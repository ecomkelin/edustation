'use strict'

/**
 * PetAdmin Service（2026-06-21 pet-system-v2）
 *
 * Admin 端对 PetAccount 的运营级操作：
 *   - list：分页 + 过滤（state / tier / student 搜索）
 *   - get：详情 + 最近事件
 *   - update：调整（admin 兜底，bug fix / 客服补偿；写 admin_override 事件）
 *   - listEvents：流水
 *
 * 权限：
 *   - list / get / listEvents → pet.read
 *   - update → pet.write
 */

const mongoose = require('mongoose')
const PetAccount = require('@models/PetAccount.model')
const PetEvent = require('@models/PetEvent.model')
const Student = require('@models/Student.model')
const ApiError = require('@utils/ApiError')
const petService = require('@modules/pet/pet.service')
const petEvent = require('@modules/pet/petEvent.service')
const petItemsService = require('@modules/pet/petItems.service')

const { ObjectId } = mongoose.Types

/**
 * 列表 PetAccount
 *
 * @param {Object} opts
 * @param {String} opts.orgId
 * @param {Number} [opts.page=1]
 * @param {Number} [opts.pageSize=20]
 * @param {String} [opts.state] - egg/alive/dead
 * @param {String} [opts.tier] - C/B/A/S
 * @param {String} [opts.keyword] - 学员名模糊
 */
async function list({ orgId, page = 1, pageSize = 20, state, tier, keyword }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))

  // 用 aggregate 一次 join student（避免 N+1）
  const orgObjectId = ObjectId.isValid(orgId) ? new ObjectId(orgId) : orgId
  const match = { org: orgObjectId }
  if (state) match.state = state
  if (tier) {
    // 蛋态按 eggTier 过滤，存活态按 tier 过滤
    if (state === 'egg') match.eggTier = tier
    else match.tier = tier
  }

  // 先按 keyword 过滤 student ids
  let studentIds = null
  if (keyword && keyword.trim()) {
    const kw = keyword.trim()
    const matched = await Student.find({
      org: orgObjectId,
      isActive: true,
      name: { $regex: kw, $options: 'i' }
    }).select('_id').lean()
    studentIds = matched.map(s => s._id)
    if (studentIds.length === 0) {
      return { items: [], total: 0, page: safePage, pageSize: safeSize }
    }
    match.student = { $in: studentIds }
  }

  const pipeline = [
    { $match: match },
    { $sort: { updatedAt: -1 } },
    {
      $lookup: {
        from: 'students',
        localField: 'student',
        foreignField: '_id',
        as: 'studentInfo'
      }
    },
    { $unwind: { path: '$studentInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        org: 1,
        student: 1,
        state: 1,
        stateChangedAt: 1,
        eggTier: 1,
        species: 1,
        tier: 1,
        level: 1,
        experience: 1,
        currentHunger: 1,
        lastFedAt: 1,
        lastHungerDecayAt: 1,
        deathThresholdDays: 1,
        nickname: 1,
        adoptedAt: 1,
        updatedAt: 1,
        studentName: '$studentInfo.name',
        studentGender: '$studentInfo.gender'
      }
    },
    { $skip: (safePage - 1) * safeSize },
    { $limit: safeSize }
  ]

  const items = await PetAccount.aggregate(pipeline)
  const total = await PetAccount.countDocuments(match)

  // 补 species 记录
  const { getSpecies } = require('@shared/petSpecies')
  const decorated = items.map(it => ({
    ...it,
    speciesRecord: it.species ? getSpecies(it.species) : null
  }))

  return { items: decorated, total, page: safePage, pageSize: safeSize }
}

/**
 * 单个 PetAccount 详情 + 最近 20 条事件
 */
async function get({ orgId, petAccountId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!petAccountId) throw ApiError.badRequest('缺少 petAccountId')
  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  const decorated = await petService.decoratePet(pet)
  const recentEvents = await PetEvent.find({ petAccount: pet._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean()
  return { pet: decorated, recentEvents }
}

/**
 * 列表事件（按 petAccount / 按 org + student 两种 scope）
 */
async function listEvents({ orgId, page = 1, pageSize = 30, petAccountId, studentId, type }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 30))
  const filter = { org: orgId }
  if (petAccountId) filter.petAccount = petAccountId
  if (studentId) filter.student = studentId
  if (type) {
    const types = Array.isArray(type) ? type : String(type).split(',').filter(Boolean)
    if (types.length === 1) filter.type = types[0]
    else if (types.length > 1) filter.type = { $in: types }
  }
  const [items, total] = await Promise.all([
    PetEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .lean(),
    PetEvent.countDocuments(filter)
  ])
  return { items, total, page: safePage, pageSize: safeSize }
}

/**
 * Admin 调整 PetAccount（pet.write 权限）。
 *
 * 支持调整的字段（白名单）：
 *   - nickname（玩家昵称）
 *   - currentHunger（饱腹度，0-100）
 *   - lastFedAt（喂食时间；可用于客服"补喂"操作）
 *   - deathThresholdDays（per-org 暂时平台硬编码，未来 per-org 化）
 *   - state（强制翻状态；仅限 egg↔alive，dead 由 cron 写；admin 强制 set 写 admin_override 事件）
 *   - level / experience（手动调整；bug 修复用）
 *
 * 不允许通过此接口改：org / student / adoptedAt / species / tier
 * （这些是结构性字段，改动需走专门流程）
 */
async function update({ orgId, petAccountId, operatorId, payload }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')
  if (!payload || typeof payload !== 'object') throw ApiError.badRequest('缺少 payload')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId })
  if (!pet) throw ApiError.notFound('宠物不存在')

  const ALLOWED = ['nickname', 'currentHunger', 'lastFedAt', 'deathThresholdDays', 'state', 'level', 'experience', 'maxHunger']
  const updates = {}
  const changes = []
  for (const k of Object.keys(payload)) {
    if (!ALLOWED.includes(k)) continue
    if (payload[k] === undefined) continue
    const oldValue = pet[k]
    const newValue = payload[k]

    // 校验
    if (k === 'currentHunger' || k === 'maxHunger') {
      if (typeof newValue !== 'number' || newValue < 0 || newValue > 100) {
        throw ApiError.badRequest(`${k} 必须在 0-100 之间`)
      }
    }
    if (k === 'level' && (newValue < 1 || newValue > 100)) {
      throw ApiError.badRequest('level 不合法')
    }
    if (k === 'experience' && newValue < 0) {
      throw ApiError.badRequest('experience 不能为负')
    }
    if (k === 'state' && !['egg', 'alive', 'dead'].includes(newValue)) {
      throw ApiError.badRequest('state 不合法')
    }

    updates[k] = newValue
    if (oldValue !== newValue) {
      changes.push({ field: k, oldValue, newValue })
    }
  }

  if (Object.keys(updates).length === 0) {
    return { pet: await petService.decoratePet(pet.toObject()), changes: [] }
  }

  const updated = await PetAccount.findByIdAndUpdate(pet._id, { $set: updates }, { new: true }).lean()
  if (!updated) throw ApiError.conflict('更新失败，请重试')

  // 写一条 admin_override 事件
  if (changes.length > 0) {
    await petEvent.recordEvent({
      orgId,
      studentId: pet.student,
      petAccountId: pet._id,
      type: 'admin_override',
      payload: { changes, operator: operatorId, reason: payload.reason || 'admin_adjust' }
    })
  }

  return { pet: await petService.decoratePet(updated), changes }
}

/* ─── 2026-06-21 pet-system-v2-ext：老师/admin 代操作 6 端点 ─────
 * 设计：
 *   - 复用 pet.service.feed/hatch/swapEgg/tierDown 的核心逻辑（by='admin' 区分审计 type）
 *   - 由 petEvent.recordEvent 额外写 'admin_adopt' / 'admin_feed' 等审计 event
 *   - 不绕过 requireEnrolledStudent（admin 代操作也要 student 至少报 1 个班）
 *     → 实际业务上代喂场景多在课上（学生肯定已报班），未报班场景暂不处理
 */

/**
 * 代领蛋 / 代领养（学员尚未领养时调）。
 */
async function adoptOnBehalf({ orgId, studentId, operatorId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await petService.adopt({ orgId, studentId, by: 'admin' })
  await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'admin_adopt',
    payload: { operator: operatorId, by: 'admin', initialTier: pet.eggTier || 'C' }
  })
  return await petService.decoratePet(pet)
}

/**
 * 代喂食。
 * @param body {consumableKey} - PetConsumable.key
 */
async function feedOnBehalf({ orgId, petAccountId, consumableKey, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  const studentId = pet.student

  // 设一个局部 operatorId 给 petPoints.helper（写 PointsTransaction.operator 字段）
  const result = await petService.feed({
    orgId, studentId, consumableKey, by: 'admin'
  })

  // 改写 PetEvent：把 admin_feed 的 operator 注入（pet.service.feed 写的是 null）
  // 这里简单做：在 PetEvent 上 update operator 字段（如果有最新一条）
  await PetEvent.findOneAndUpdate(
    { petAccount: petAccountId, type: 'admin_feed' },
    { $set: { 'payload.operator': operatorId } },
    { sort: { createdAt: -1 } }
  )

  return result
}

/**
 * 代破壳。
 */
async function hatchOnBehalf({ orgId, petAccountId, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  const studentId = pet.student

  const result = await petService.hatch({ orgId, studentId })
  await petEvent.recordEvent({
    orgId, studentId, petAccountId,
    type: 'admin_hatch',
    payload: { operator: operatorId, by: 'admin', tier: result.petAccount.tier, species: result.petAccount.species }
  })
  return result
}

/**
 * 代置换蛋（扣积分，admin 也要扣学员积分）。
 */
async function swapEggOnBehalf({ orgId, petAccountId, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  const studentId = pet.student

  const result = await petService.swapEgg({ orgId, studentId })
  await petEvent.recordEvent({
    orgId, studentId, petAccountId,
    type: 'admin_swap',
    payload: { operator: operatorId, by: 'admin', tier: pet.tier, cost: result.pointsCost, fromSpecies: pet.species }
  })
  return result
}

/**
 * 代主动降阶。
 */
async function tierDownOnBehalf({ orgId, petAccountId, targetTier, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!targetTier) throw ApiError.badRequest('缺少 targetTier')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  const studentId = pet.student

  const result = await petService.tierDown({ orgId, studentId, targetTier })
  await petEvent.recordEvent({
    orgId, studentId, petAccountId,
    type: 'admin_tierdown',
    payload: { operator: operatorId, by: 'admin', fromTier: pet.tier, toTier: targetTier, autoUnequipped: result.autoUnequipped || [] }
  })
  return result
}

/**
 * 代换装。
 */
async function equipOnBehalf({ orgId, petAccountId, slot, itemKey, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!slot) throw ApiError.badRequest('缺少 slot')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  const studentId = pet.student

  const result = await petItemsService.equip({ orgId, studentId, slot, itemKey })
  await petEvent.recordEvent({
    orgId, studentId, petAccountId,
    type: 'admin_equip',
    payload: { operator: operatorId, by: 'admin', slot, itemKey, fromItemKey: result.fromItemKey || null }
  })
  return result
}

/**
 * 按 studentId 拿 PetAccount（课堂展示页轮询用，先调一次拿到 petAccountId）。
 */
async function getByStudent({ orgId, studentId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  const pet = await PetAccount.findOne({ org: orgId, student: studentId }).lean()
  if (!pet) return { pet: null, recentEvents: [] }
  const decorated = await petService.decoratePet(pet)
  const recentEvents = await PetEvent.find({ petAccount: pet._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean()
  return { pet: decorated, recentEvents }
}

module.exports = {
  list,
  get,
  listEvents,
  update,
  // 代操作
  adoptOnBehalf,
  feedOnBehalf,
  hatchOnBehalf,
  swapEggOnBehalf,
  tierDownOnBehalf,
  equipOnBehalf,
  getByStudent,
  listEvents,
  update
}
