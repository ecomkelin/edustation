'use strict'

/**
 * PetAdmin Service（2026-06-21 pet-system-v2；2026-07-15 重构：多宠 + 无等阶 + 无装饰）
 *
 * Admin 端对 PetAccount 的运营级操作：
 *   - list：分页 + 过滤（state / student 搜索）
 *   - get：详情 + 最近事件
 *   - update：调整字段（写 admin_override 事件）
 *   - listEvents：流水（cursor 分页）
 *   - 代操作：adopt / feed / hatch / setDefault（去 swap/tier/equip）
 *   - getByStudent：课堂展示轮询（返回默认宠物 + 全部宠物）
 *
 * 权限：list/get/listEvents/getByStudent → pet.read；其余 → pet.write
 */

const mongoose = require('mongoose')
const PetAccount = require('@models/PetAccount.model')
const PetEvent = require('@models/PetEvent.model')
const PetSpecies = require('@models/PetSpecies.model')
const Student = require('@models/Student.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const petService = require('@modules/pet/pet.service')
const petEvent = require('@modules/pet/petEvent.service')

const { ObjectId } = mongoose.Types

/**
 * 列表 PetAccount（多宠：一个学生可能多行）
 */
async function list({ orgId, page = 1, pageSize = 20, state, keyword }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))

  const orgObjectId = ObjectId.isValid(orgId) ? new ObjectId(orgId) : orgId
  const match = { org: orgObjectId }
  if (state) match.state = state

  if (keyword && keyword.trim()) {
    const kw = keyword.trim()
    const matched = await Student.find({
      org: orgObjectId,
      isActive: true,
      name: { $regex: kw, $options: 'i' }
    }).select('_id').lean()
    const studentIds = matched.map(s => s._id)
    if (studentIds.length === 0) {
      return { items: [], total: 0, page: safePage, pageSize: safeSize }
    }
    match.student = { $in: studentIds }
  }

  const pipeline = [
    { $match: match },
    { $sort: { isDefault: -1, updatedAt: -1 } },
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
        isDefault: 1,
        state: 1,
        stateChangedAt: 1,
        species: 1,
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

  const speciesKeys = [...new Set(items.map(it => it.species).filter(Boolean))]
  const speciesDocs = speciesKeys.length > 0
    ? await PetSpecies.find({ key: { $in: speciesKeys } }).populate('videoFile', 'url mime').lean()
    : []
  const speciesMap = Object.fromEntries(speciesDocs.map(s => [s.key, s]))
  const decorated = items.map(it => ({
    ...it,
    speciesRecord: it.species ? speciesMap[it.species] || null : null
  }))

  return { items: decorated, total, page: safePage, pageSize: safeSize }
}

/**
 * 单个 PetAccount 详情 + 最近 20 条事件
 */
async function get({ orgId, petAccountId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!petAccountId) throw ApiError.badRequest('缺少 petAccountId')
  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId })
    .populate('student', 'name gender')
    .lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  const decorated = await petService.decoratePet(pet, orgId)
  if (pet.student && typeof pet.student === 'object') {
    decorated.studentName = pet.student.name
    decorated.studentGender = pet.student.gender
  }
  const recentEvents = await PetEvent.find({ petAccount: pet._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean()
  return { pet: decorated, recentEvents }
}

/**
 * 列表事件（cursor 分页）
 */
async function listEvents({ orgId, petAccountId, studentId, type, cursor, limit = 30 }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30))
  const filter = { org: orgId }
  if (petAccountId) filter.petAccount = petAccountId
  if (studentId) filter.student = studentId
  if (type) {
    const types = Array.isArray(type) ? type : String(type).split(',').filter(Boolean)
    if (types.length === 1) filter.type = types[0]
    else if (types.length > 1) filter.type = { $in: types }
  }
  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded) {
      filter.$or = [
        { createdAt: { $lt: decoded.ts } },
        { createdAt: decoded.ts, _id: { $lt: decoded.id } }
      ]
    }
  }
  const rows = await PetEvent.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit + 1)
    .lean()
  const hasMore = rows.length > safeLimit
  const items = hasMore ? rows.slice(0, safeLimit) : rows
  const last = items[items.length - 1]
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last._id) : null
  return { items, nextCursor, hasMore }
}

function encodeCursor(ts, id) {
  const tsIso = ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString()
  const idHex = typeof id === 'object' && id.toHexString ? id.toHexString() : String(id)
  return Buffer.from(`${tsIso}|${idHex}`).toString('base64url')
}

function decodeCursor(s) {
  try {
    const raw = Buffer.from(String(s), 'base64url').toString('utf8')
    const idx = raw.indexOf('|')
    if (idx <= 0) return null
    const ts = new Date(raw.slice(0, idx))
    const id = raw.slice(idx + 1)
    if (isNaN(ts.getTime()) || !/^[a-f0-9]{24}$/i.test(id)) return null
    return { ts, id }
  } catch (_) {
    return null
  }
}

/**
 * Admin 调整 PetAccount（pet.write）。
 *
 * 白名单：nickname / currentHunger / lastFedAt / deathThresholdDays / state / level / experience / maxHunger
 * isDefault 走 setDefaultOnBehalf，不在此裸 set（避免破坏 partial unique）。
 * 不允许改：org / student / adoptedAt / species / maxLevel / visuals（per-pet override 已撤销，per-species 见 PetSpeciesTab）
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

    if (k === 'currentHunger' || k === 'maxHunger') {
      if (typeof newValue !== 'number' || newValue < 0 || newValue > 1000) {
        throw ApiError.badRequest(`${k} 必须在 0-1000 之间`)
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
    return { pet: await petService.decoratePet(pet.toObject(), orgId), changes: [] }
  }

  const updated = await PetAccount.findByIdAndUpdate(pet._id, { $set: updates }, { new: true }).lean()
  if (!updated) throw ApiError.conflict('更新失败，请重试')

  if (changes.length > 0) {
    await petEvent.recordEvent({
      orgId,
      studentId: pet.student,
      petAccountId: pet._id,
      type: 'admin_override',
      payload: { changes, operator: operatorId, reason: payload.reason || 'admin_adjust' }
    })
  }

  return { pet: await petService.decoratePet(updated, orgId), changes }
}

/* ─── 老师/admin 代操作（去 swap/tier/equip） ───────────────── */

/**
 * 代领养（可多只，≤ 上限）。
 */
async function adoptOnBehalf({ orgId, studentId, operatorId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')
  const result = await petService.adopt({ orgId, studentId, by: 'admin' })
  return result.petAccount
}

/**
 * 代喂食。
 */
async function feedOnBehalf({ orgId, petAccountId, consumableKey, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')

  return petService.feed({
    orgId, studentId: pet.student, petId: pet._id, consumableKey, by: 'admin', operatorId
  })
}

/**
 * 代破壳。
 */
async function hatchOnBehalf({ orgId, petAccountId, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')

  return petService.hatch({ orgId, studentId: pet.student, petId: pet._id, by: 'admin' })
}

/**
 * 代设为默认宠物。
 */
async function setDefaultOnBehalf({ orgId, petAccountId, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')

  return petService.setDefault({
    orgId, studentId: pet.student, petId: pet._id, by: 'admin', operatorId
  })
}

/**
 * 按 studentId 拿宠物（课堂展示轮询用）：返回默认宠物 + 全部宠物 + 默认宠物最近事件。
 */
async function getByStudent({ orgId, studentId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')

  const studentDoc = await Student.findOne({ _id: studentId, org: orgId }).select('name gender').lean()
  const rawPets = await PetAccount.find({ org: orgId, student: studentId }).lean()
  if (rawPets.length === 0) return { pet: null, pets: [], recentEvents: [] }

  const decorated = await Promise.all(rawPets.map(p => petService.decoratePet(p, orgId)))
  decorated.forEach(p => {
    p.studentName = studentDoc?.name || null
    p.studentGender = studentDoc?.gender || null
  })
  decorated.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
  const defaultPet = decorated.find(p => p.isDefault) || decorated[0] || null

  const recentEvents = defaultPet
    ? await PetEvent.find({ petAccount: defaultPet._id }).sort({ createdAt: -1 }).limit(10).lean()
    : []

  return { pet: defaultPet, pets: decorated, recentEvents }
}

/* ─── 弃养 (§8.1 三重防护: 平台超管 + pet.write + 密码 + 互锁预检) ─── */

/**
 * PetAccount 弃养用法互锁声明 (CLAUDE.md §8.1 范式)。
 *
 * 当前没有任何下游实体硬引用 PetAccount 文档 (PetEvent 是软审计, deleteOne PetAccount
 * 时 PetEvent.petAccount 变成 dangling ref; admin 事件流按 createdAt 展示不影响)。
 * 后续若加积分自动扣 / 招生转化等下游再补。
 */
function petAccountUsageChecks(_petAccountId) {
  return []
}

/**
 * 预检: DELETE 前告诉前端 0 阻挡 or 列出 blockers
 * 普通员工 (pet.read) 即可调, 不需超管+密码
 */
async function removableCheckPetAccount({ orgId, petAccountId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  const doc = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!doc) {
    return {
      canRemove: false,
      blockers: [{ entity: 'PetAccount', label: '宠物', count: 0, hint: '宠物不存在' }]
    }
  }
  return removable.check(orgId, petAccountUsageChecks(petAccountId))
}

/**
 * Admin 代弃养 (物理删除 PetAccount 文档)。
 * 与 C 端 pet.service.abandon 语义一致, 只是 by='admin' 走 §8.1 三重防护。
 */
async function removePetAccount({ orgId, petAccountId, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId })
  if (!pet) throw ApiError.notFound('宠物不存在')

  // §8.1 业务互锁 (removable.assertUnused 内部 throw 422 + blockers)
  await removable.assertUnused(orgId, petAccountUsageChecks(petAccountId))

  // 最后一只挡板
  const total = await PetAccount.countDocuments({ org: orgId, student: pet.student })
  if (total <= 1) throw ApiError.unprocessable('最后一只不能弃养')

  // isDefault 转移
  if (pet.isDefault) {
    const other = await PetAccount.findOne({
      org: orgId,
      student: pet.student,
      _id: { $ne: pet._id }
    }).sort({ adoptedAt: 1 }).lean()
    if (other) {
      await PetAccount.updateOne({ _id: other._id }, { $set: { isDefault: true } })
    }
  }

  // 删档（PetAccount.visuals 已撤，per-species levelVisuals 在 PetSpecies 上，删 PetAccount 不用解绑 File refs）
  const deleted = await PetAccount.deleteOne({ _id: pet._id, org: orgId })
  if (deleted.deletedCount === 0) throw ApiError.conflict('宠物已被他人操作，请刷新后重试')

  // 审计
  await petEvent.recordEvent({
    orgId,
    studentId: pet.student,
    petAccountId: pet._id,
    type: 'admin_abandon',
    payload: {
      reason: 'admin',
      operator: operatorId,
      species: pet.species || null,
      level: pet.level || 1,
      experience: pet.experience || 0,
      nickname: pet.nickname || null
    }
  })

  return { abandonedPetId: pet._id }
}

module.exports = {
  list,
  get,
  listEvents,
  update,
  adoptOnBehalf,
  feedOnBehalf,
  hatchOnBehalf,
  setDefaultOnBehalf,
  getByStudent,
  removePetAccount,
  removableCheckPetAccount
}
