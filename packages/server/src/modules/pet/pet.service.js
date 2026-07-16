'use strict'

/**
 * Pet Service（2026-06-21 pet-system-v2；2026-07-15 重构：多宠 + 无等阶 + 无装饰）
 *
 * 核心状态机（去等阶后）：
 *   - state=egg → hatch → state=alive（species 全池随机锁定，hunger 满）
 *   - state=alive → feed → levelup（按 per-org PetLevelConfig；满级封顶，无升阶）
 *   - state=alive → cron 判定 hunger=0 + N 天 → state=dead → 同一 tick rebirth → state=egg（清 species）
 *
 * 多宠模型：
 *   - 一个学生可有多只宠物（≤ MAX_PETS_PER_STUDENT），其中恰好一只 isDefault=true
 *   - 所有写操作按 petId 定位（校验归属 org + student）
 *
 * 关键不变量：
 *   - feed / hatch 都是 CAS（read → 计算 → findOneAndUpdate 带状态守卫）
 *   - 等级曲线来自 petCatalog.getLevelConfig(orgId)，满级后经验封顶
 *
 * 写 PetEvent 时机：adopt / hatch / feed / levelup / death / rebirth / set_default / admin_*
 * 积分：仅 feed 扣分（petPoints.chargeForFeed）；破壳/升级/死亡/设默认 0 积分
 */

const PetAccount = require('@models/PetAccount.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const ApiError = require('@utils/ApiError')
const petConfig = require('@shared/petConfig')
const petCatalog = require('@modules/pet/petCatalog.service')
const petPoints = require('./petPoints.helper')
const petEvent = require('./petEvent.service')

const {
  MAX_HUNGER,
  INIT_HUNGER_AFTER_HATCH,
  MAX_PETS_PER_STUDENT,
  DEFAULT_DEATH_THRESHOLD_DAYS,
  expToNext
} = petConfig

// ─────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────

function baseEggDoc(orgId, studentId, isDefault, now) {
  return {
    org: orgId,
    student: studentId,
    isDefault: !!isDefault,
    state: 'egg',
    stateChangedAt: now,
    eggAdoptedAt: now,
    eggHatchedAt: null,
    species: null,
    level: 1,
    experience: 0,
    hatchedAt: null,
    adoptedAt: now,
    currentHunger: 100,
    maxHunger: MAX_HUNGER,
    lastFedAt: null,
    lastHungerDecayAt: null,
    deathThresholdDays: DEFAULT_DEATH_THRESHOLD_DAYS,
    nickname: null,
    meta: {}
  }
}

/**
 * 按 petId 定位并校验归属（org + student）。
 */
async function loadOwnedPet({ orgId, studentId, petId }) {
  if (!petId) throw ApiError.badRequest('缺少 petId')
  const pet = await PetAccount.findOne({ _id: petId, org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('宠物不存在或不属于该学员')
  return pet
}

// ─────────────────────────────────────────────────────────────
// 领养
// ─────────────────────────────────────────────────────────────

/**
 * 懒创建第一只宠物：仅当该学员当前 0 只宠物时创建一只默认蛋。
 * 触发场景：家长首次打开 pet 页 / 报名钩子。幂等。
 */
async function ensureFirstPet(orgId, studentId, by = 'manual') {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!studentId) throw ApiError.badRequest('缺少 studentId')

  const count = await PetAccount.countDocuments({ org: orgId, student: studentId })
  if (count > 0) {
    return PetAccount.findOne({ org: orgId, student: studentId, isDefault: true }).lean()
      || PetAccount.findOne({ org: orgId, student: studentId }).lean()
  }

  const now = new Date()
  const created = await PetAccount.create(baseEggDoc(orgId, studentId, true, now))
  await petEvent.recordEvent({
    orgId, studentId, petAccountId: created._id,
    type: by === 'admin' ? 'admin_adopt' : 'adopt',
    payload: { by }
  })
  return created.toObject()
}

/**
 * 显式领养一只新宠物（得蛋）。校验上限 MAX_PETS_PER_STUDENT。
 * 首只自动 isDefault=true。
 */
async function adopt({ orgId, studentId, by = 'parent' }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  const count = await PetAccount.countDocuments({ org: orgId, student: studentId })
  if (count >= MAX_PETS_PER_STUDENT) {
    throw ApiError.unprocessable(`最多领养 ${MAX_PETS_PER_STUDENT} 只宠物`)
  }
  const now = new Date()
  const created = await PetAccount.create(baseEggDoc(orgId, studentId, count === 0, now))
  const event = await petEvent.recordEvent({
    orgId, studentId, petAccountId: created._id,
    type: by === 'admin' ? 'admin_adopt' : 'adopt',
    payload: { by }
  })
  return { petAccount: await decoratePet(created.toObject(), orgId), event }
}

// ─────────────────────────────────────────────────────────────
// 破壳
// ─────────────────────────────────────────────────────────────

/**
 * 破壳：state=egg → state=alive，species 全池加权随机（跳过该学员已养种类）。
 *
 * 2026-07-16: 同种唯一约束后, 抽到已养 species 会撞 partial unique 索引 E11000。
 * 在 service 层循环重抽, 最多 MAX_PETS_PER_STUDENT 次 (物种池子规模上限),
 * 仍冲突 → 422「运气太差」(用户可换蛋或先弃养)。
 */
async function hatch({ orgId, studentId, petId, by = 'parent' }) {
  const pet = await loadOwnedPet({ orgId, studentId, petId })
  if (pet.state !== 'egg') throw ApiError.unprocessable('当前不是蛋状态，无法破壳')

  // 取该学员已养 species 集合 (蛋态 species=null 不算)
  const ownedPets = await PetAccount.find({
    org: orgId,
    student: studentId,
    species: { $ne: null, $exists: true }
  }).select('species').lean()
  const ownedKeys = new Set(ownedPets.map((p) => p.species))

  let species = null
  for (let i = 0; i < MAX_PETS_PER_STUDENT; i++) {
    const rolled = await petCatalog.rollSpecies()
    if (!rolled) break
    if (!ownedKeys.has(rolled.key)) {
      species = rolled.key
      break
    }
  }
  if (!species) {
    throw ApiError.unprocessable(
      ownedKeys.size === 0
        ? '当前没有可选的宠物种类，请联系管理员配置'
        : `运气太差，${ownedKeys.size} 种都已养，请先弃养或换蛋`
    )
  }

  const now = new Date()
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id, state: 'egg' },
    {
      $set: {
        state: 'alive',
        stateChangedAt: now,
        species,
        level: 1,
        experience: 0,
        hatchedAt: now,
        eggHatchedAt: now,
        currentHunger: INIT_HUNGER_AFTER_HATCH,
        lastFedAt: now,
        lastHungerDecayAt: now,
        deathThresholdDays: DEFAULT_DEATH_THRESHOLD_DAYS
      }
    },
    { new: true }
  ).lean()

  if (!updated) throw ApiError.conflict('宠物状态已变更，请刷新后重试')

  const event = await petEvent.recordEvent({
    orgId, studentId, petAccountId: pet._id,
    type: by === 'admin' ? 'admin_hatch' : 'hatch',
    payload: { species, level: 1 }
  })

  return { petAccount: await decoratePet(updated, orgId), event, leveledUp: false }
}

// ─────────────────────────────────────────────────────────────
// 喂食
// ─────────────────────────────────────────────────────────────

/**
 * 喂食：扣积分 + 经验累计 + 饱腹度恢复 + 升级（满级封顶，无升阶）。
 */
async function feed({ orgId, studentId, petId, consumableKey, by = 'parent', operatorId = null }) {
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')

  const pet = await loadOwnedPet({ orgId, studentId, petId })
  if (pet.state !== 'alive') throw ApiError.unprocessable('当前不是存活状态，无法喂食')

  const found = await petCatalog.findConsumable({ key: consumableKey })
  if (!found) throw ApiError.notFound(`消耗品 ${consumableKey} 不可用`)
  const { config } = found
  const cost = config.pointCost
  const expGain = config.expGain
  const hungerGain = config.hungerRestore

  const levelCfg = await petCatalog.getLevelConfig(orgId)

  // 计算新的 exp / level / hunger
  let newExp = pet.experience + expGain
  let newLevel = pet.level
  let newHunger = Math.min(pet.maxHunger, pet.currentHunger + hungerGain)
  let levelUpCount = 0

  while (newLevel < levelCfg.maxLevel) {
    const need = expToNext(newLevel, levelCfg)
    if (need == null || newExp < need) break
    newExp -= need
    newLevel += 1
    levelUpCount += 1
  }
  // 满级封顶：经验清零（进度条显示已满）
  if (newLevel >= levelCfg.maxLevel) newExp = 0

  // 先扣积分（不足时抛错，经验/饱腹度不变）
  const chargeResult = await petPoints.chargeForFeed({
    orgId, studentId, petAccountId: pet._id,
    consumableKey, cost, expGain, hungerGain, operatorId
  })

  const now = new Date()
  const setFields = {
    experience: newExp,
    level: newLevel,
    currentHunger: newHunger,
    lastFedAt: now
  }

  // CAS（带老值守卫）+ retry 1 次
  const casFilter = {
    _id: pet._id, state: 'alive',
    level: pet.level, experience: pet.experience, currentHunger: pet.currentHunger
  }
  let updated = await PetAccount.findOneAndUpdate(casFilter, { $set: setFields }, { new: true }).lean()
  if (!updated) {
    const fresh = await PetAccount.findById(pet._id).lean()
    if (!fresh) throw ApiError.notFound('宠物不存在')
    if (fresh.state !== 'alive') throw ApiError.conflict('宠物状态已变更，请刷新')
    updated = await PetAccount.findOneAndUpdate(
      { _id: pet._id, state: 'alive' }, { $set: setFields }, { new: true }
    ).lean()
    if (!updated) throw ApiError.conflict('宠物状态并发变更，请刷新后重试')
  }

  const events = []
  events.push(await petEvent.recordEvent({
    orgId, studentId, petAccountId: pet._id,
    type: by === 'admin' ? 'admin_feed' : 'feed',
    payload: {
      consumableKey, expGain,
      hungerBefore: pet.currentHunger, hungerAfter: newHunger,
      expBefore: pet.experience, expAfter: newExp,
      level: newLevel,
      operator: by === 'admin' ? operatorId : null
    }
  }))
  if (levelUpCount > 0) {
    for (let i = 0; i < levelUpCount; i++) {
      events.push(await petEvent.recordEvent({
        orgId, studentId, petAccountId: pet._id,
        type: 'levelup',
        payload: { fromLevel: pet.level + i, toLevel: pet.level + i + 1 }
      }))
    }
  }

  return {
    petAccount: await decoratePet(updated, orgId, levelCfg),
    levelUp: levelUpCount > 0,
    pointsCost: cost,
    pointsAfter: chargeResult.account.balance,
    events: events.filter(Boolean)
  }
}

// ─────────────────────────────────────────────────────────────
// 设为默认宠物
// ─────────────────────────────────────────────────────────────

/**
 * 把指定宠物设为该学员的默认宠物（其余置 false）。
 * 先清其他再置目标，避开 isDefault partial unique 索引冲突。
 */
async function setDefault({ orgId, studentId, petId, by = 'parent', operatorId = null }) {
  const pet = await loadOwnedPet({ orgId, studentId, petId })
  if (pet.isDefault) {
    return { petAccount: await decoratePet(pet.toObject(), orgId) }
  }
  await PetAccount.updateMany(
    { org: orgId, student: studentId, _id: { $ne: pet._id }, isDefault: true },
    { $set: { isDefault: false } }
  )
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id, org: orgId, student: studentId },
    { $set: { isDefault: true } },
    { new: true }
  ).lean()

  const event = await petEvent.recordEvent({
    orgId, studentId, petAccountId: pet._id,
    type: by === 'admin' ? 'admin_set_default' : 'set_default',
    payload: { operator: by === 'admin' ? operatorId : null }
  })
  return { petAccount: await decoratePet(updated, orgId), event }
}

// ─────────────────────────────────────────────────────────────
// 弃养 (2026-07-16)
// ─────────────────────────────────────────────────────────────

/**
 * 物理删除宠物 (1 学生 + 1 species 唯一约束后, 多余可弃养)。
 *
 * 守门：
 *   - loadOwnedPet 已校验 petId 归属 (org + student + _id 三元组)
 *   - 最后一只挡板: 总数 ≤ 1 → 422, 引导用户先领养
 *   - isDefault 转移: 若弃养的是默认宠物, 自动把剩余最早领养的一只置为默认
 *     (没有剩余 → 该 student 退化为 0 只状态, 下次 ensureFirstPet 重建首只)
 *
 * 不退积分 (与 feed 扣分对称, 弃养为用户主动放弃)
 * 写一条 PetEvent (type: abandon / admin_abandon) 作审计
 */
async function abandon({ orgId, studentId, petId, by = 'parent', operatorId = null }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!studentId) throw ApiError.badRequest('缺少 studentId')
  if (!petId) throw ApiError.badRequest('缺少 petId')

  const pet = await loadOwnedPet({ orgId, studentId, petId })

  // 最后一只挡板 (避免 0 只 + isDefault 漂移)
  const total = await PetAccount.countDocuments({ org: orgId, student: studentId })
  if (total <= 1) {
    throw ApiError.unprocessable('最后一只不能弃养，请先领养新宠物')
  }

  // isDefault 转移: 弃养的是默认 → 把剩余最早领养的提升为默认
  if (pet.isDefault) {
    const other = await PetAccount.findOne({
      org: orgId,
      student: studentId,
      _id: { $ne: pet._id }
    }).sort({ adoptedAt: 1 }).lean()
    if (other) {
      await PetAccount.updateOne(
        { _id: other._id },
        { $set: { isDefault: true } }
      )
    }
  }

  // 删档
  const deleted = await PetAccount.deleteOne({
    _id: pet._id,
    org: orgId,
    student: studentId
  })
  if (deleted.deletedCount === 0) {
    throw ApiError.conflict('宠物已被他人操作，请刷新后重试')
  }

  // 审计 (弃养事件 sparse eventKey 不需要 — 一次性手动操作, 无幂等需求)
  await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: by === 'admin' ? 'admin_abandon' : 'abandon',
    payload: {
      reason: by === 'admin' ? 'admin' : 'manual',
      operator: by === 'admin' ? operatorId : null,
      // 顺手记下弃养时的 species, 后续 admin 事件流好追溯
      species: pet.species || null,
      level: pet.level || 1,
      experience: pet.experience || 0,
      nickname: pet.nickname || null
    }
  })

  return { abandonedPetId: pet._id }
}

// ─────────────────────────────────────────────────────────────
// 读
// ─────────────────────────────────────────────────────────────

/**
 * 列出该学员全部宠物（默认宠物排在最前），均已 decorate。
 * 若 0 只且已报班 → 懒创建第一只。
 */
async function listMine({ orgId, studentId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')

  let pets = await PetAccount.find({ org: orgId, student: studentId }).lean()
  if (pets.length === 0) {
    const enrolledCount = await CourseEnrollment.countDocuments({ org: orgId, student: studentId, status: 'enrolled' })
    if (enrolledCount === 0) return { pets: [], defaultPet: null, noEnrollment: true }
    const first = await ensureFirstPet(orgId, studentId)
    pets = first ? [first] : []
  }

  const levelCfg = await petCatalog.getLevelConfig(orgId)
  const decorated = await Promise.all(pets.map(p => decoratePet(p, orgId, levelCfg)))
  decorated.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
  const defaultPet = decorated.find(p => p.isDefault) || decorated[0] || null
  return { pets: decorated, defaultPet }
}

/**
 * 取默认宠物（/pet/me 兼容；懒创建）。
 */
async function getMine({ orgId, studentId }) {
  const { pets, defaultPet, noEnrollment } = await listMine({ orgId, studentId })
  if (noEnrollment) return { pet: null, noEnrollment: true }
  return { pet: defaultPet, pets }
}

/**
 * 给 pet 文档补派生字段（nextExpToLevel / maxLevel / speciesRecord）。
 */
async function decoratePet(pet, orgId, levelCfg) {
  if (!pet) return null
  const result = { ...pet }
  if (pet.species) {
    result.speciesRecord = await petCatalog.getSpecies({ key: pet.species }) || null
  }
  if (pet.state === 'alive') {
    const cfg = levelCfg || await petCatalog.getLevelConfig(orgId || pet.org)
    result.nextExpToLevel = expToNext(pet.level, cfg)
    result.maxLevel = cfg.maxLevel
  }
  return result
}

async function listEvents({ orgId, studentId, petId, page = 1, pageSize = 20 }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))
  const PetEvent = require('@models/PetEvent.model')
  const filter = { org: orgId, student: studentId }
  if (petId) filter.petAccount = petId
  const [items, total] = await Promise.all([
    PetEvent.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeSize).limit(safeSize).lean(),
    PetEvent.countDocuments(filter)
  ])
  return { items, total, page: safePage, pageSize: safeSize }
}

/**
 * 今日工作台: 饥饿度低的宠物（去 tier）。
 */
async function listStarving({ orgId, threshold = 20, limit = 50 }) {
  const t = Math.max(0, Math.min(1000, Number(threshold) || 0))
  const Student = require('@models/Student.model')

  const pets = await PetAccount.find({ org: orgId, state: 'alive', currentHunger: { $lte: t } })
    .populate('student', 'name')
    .sort({ currentHunger: 1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean()

  const studentIds = [...new Set(pets.map((p) => String(p.student?._id)).filter(Boolean))]
  const students = studentIds.length
    ? await Student.find({ _id: { $in: studentIds } }).populate('guardians', 'mobile').lean()
    : []
  const sMap = new Map(students.map((s) => [String(s._id), s]))

  return {
    threshold: t,
    items: pets.map((p) => {
      const s = sMap.get(String(p.student?._id))
      return {
        petAccountId: p._id,
        studentId: p.student?._id,
        studentName: p.student?.name || null,
        nickname: p.nickname || null,
        species: p.species,
        level: p.level,
        currentHunger: p.currentHunger,
        maxHunger: p.maxHunger,
        lastFedAt: p.lastFedAt,
        deathThresholdDays: p.deathThresholdDays,
        guardianMobile: s?.guardians?.[0]?.mobile || null
      }
    }),
    count: pets.length
  }
}

module.exports = {
  ensureFirstPet,
  adopt,
  hatch,
  feed,
  setDefault,
  abandon,
  listMine,
  getMine,
  decoratePet,
  loadOwnedPet,
  listEvents,
  listStarving
}
