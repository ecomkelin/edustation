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
  expToNext,
  resolveMaxLevel,
  resolveVisualAtLevel,
  resolveLevelUpEffectAtLevel,
  resolveEggVisual
} = require('@shared/petConfig')
const Student = require('@models/Student.model')

// ─────────────────────────────────────────────────────────────
// PetEvent payload snapshot (2026-07-17)
// 每个 PetEvent.recordEvent 写时, 把当时的学员姓名 + 宠物快照塞进 payload。
// 设计动机:
//   - admin 流水「学员」/「目标宠物」列需要稳定展示, 即使:
//     a) populate 未生效 (server 未重启过渡期);
//     b) PetAccount 已被弃养物理删除 (populate 返 null);
//     c) 学员改名 / 宠物改名后, 历史事件保持原名 (audit 不可变)。
// ─────────────────────────────────────────────────────────────
function buildPetSnapshot(pet) {
  return {
    petNickname: pet?.nickname || null,
    petSpecies: pet?.species || null,           // key, e.g. 'cat_orange'
    petLevel: pet?.level != null ? pet.level : null,
    petState: pet?.state || null                // egg / alive / dead
  }
}

async function buildStudentSnapshot(orgId, studentId) {
  if (!studentId) return { studentName: null, studentGender: null }
  const s = await Student.findOne({ _id: studentId, org: orgId }).select('name gender').lean()
  return { studentName: s?.name || null, studentGender: s?.gender || null }
}

// 把 snapshot 合到 payload 里 (覆盖现有键, 不破坏 type-specific 字段)
function mergeSnapshot(payload, snap) {
  return { ...(payload || {}), ...snap }
}

// ─────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────

function baseEggDoc(orgId, studentId, isDefault, now, species = null) {
  return {
    org: orgId,
    student: studentId,
    isDefault: !!isDefault,
    state: 'egg',
    stateChangedAt: now,
    eggAdoptedAt: now,
    eggHatchedAt: null,
    species,                       // 2026-07-17: teacher 代领养可预赋值; null = 仍走随机 (默认)
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
  const stuSnap = await buildStudentSnapshot(orgId, studentId)
  const petSnap = buildPetSnapshot(created.toObject())
  await petEvent.recordEvent({
    orgId, studentId, petAccountId: created._id,
    type: by === 'admin' ? 'admin_adopt' : 'adopt',
    payload: mergeSnapshot({ by }, { ...petSnap, ...stuSnap })
  })
  return created.toObject()
}

/**
 * 显式领养一只新宠物（得蛋）。校验上限 MAX_PETS_PER_STUDENT。
 *
 * 2026-07-17: 新增 speciesKey 可选参数 (admin 代领养手动选种类用)。
 *   - 传了: 蛋直接 pre-assign 该 species (hatch 时不再 rollSpecies)
 *   - 不传: 仍走默认 egg-with-null-species, hatch 时随机 roll
 * 校验: speciesKey 必须是已激活的 PetSpecies.key
 *
 * 2026-07-17: 新增 asDefault 可选参数 (C 端领养体验: 新宠直接为默认)。
 *   - true:  新宠 isDefault=true, 学员其他默认自动清空 (转移语义)
 *   - false / null: 走原有行为 — 仅当 count===0 时 (首只) 自动默认
 * partial unique `(org,student,isDefault)` 是 partial-filter 只对 true 生效,
 *   所以需要"先清旧默认 → 再插新默认"的顺序, 否则 E11000
 */
async function adopt({ orgId, studentId, by = 'parent', speciesKey = null, asDefault = null }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  const count = await PetAccount.countDocuments({ org: orgId, student: studentId })
  if (count >= MAX_PETS_PER_STUDENT) {
    throw ApiError.unprocessable(`最多领养 ${MAX_PETS_PER_STUDENT} 只宠物`)
  }
  // 决定 isDefault: asDefault=true 显式覆盖 (C 端); 否则按 count 推 (首只默认)
  const shouldBeDefault = asDefault === true ? true : (count === 0)

  let preSpecies = null
  if (speciesKey) {
    const sp = await petCatalog.getSpecies({ key: speciesKey })
    if (!sp) throw ApiError.notFound(`物种 ${speciesKey} 不存在`)
    if (sp.isActive === false) throw ApiError.unprocessable(`物种 ${speciesKey} 已下架`)
    preSpecies = sp.key
  }

  // 2026-07-17: 转移默认 (新宠为默认时, 清学员其他默认避开 partial unique E11000)
  if (shouldBeDefault && count > 0) {
    await PetAccount.updateMany(
      { org: orgId, student: studentId, isDefault: true },
      { $set: { isDefault: false } }
    )
  }

  const now = new Date()
  let created
  try {
    created = await PetAccount.create(baseEggDoc(orgId, studentId, shouldBeDefault, now, preSpecies))
  } catch (e) {
    // 2026-07-17: 同种唯一 partial unique 索引 E11000 — 蛋已经 pre-assign 同 species
    // (典型: 老师之前选了 cat_orange 的蛋未破壳, 现在又选 cat_orange)
    // MongoDB 不会细分 state, 直接撞索引抛错 → 转友好提示
    if (e && e.code === 11000 && preSpecies) {
      const sp = await petCatalog.getSpecies({ key: preSpecies })
      throw ApiError.unprocessable(
        `该学员已有 ${sp?.name || preSpecies} 的蛋未破壳, 请先破壳或弃养`
      )
    }
    throw e
  }
  const stuSnap = await buildStudentSnapshot(orgId, studentId)
  const petSnap = buildPetSnapshot(created.toObject())
  const event = await petEvent.recordEvent({
    orgId, studentId, petAccountId: created._id,
    type: by === 'admin' ? 'admin_adopt' : 'adopt',
    payload: mergeSnapshot(
      { by, preAssignedSpecies: !!preSpecies, setAsDefault: shouldBeDefault },
      { ...petSnap, ...stuSnap }
    )
  })
  return { petAccount: await decoratePet(created.toObject(), orgId), event }
}

// ─────────────────────────────────────────────────────────────
// 破壳
// ─────────────────────────────────────────────────────────────

/**
 * 破壳：state=egg → state=alive。
 *
 * 物种来源优先级:
 *   1. 蛋上 pre-assigned 的 species (admin 代领养手动选的) — 直接用, 不再 roll
 *   2. 否则: 全池加权随机 (跳过该学员已养种类)
 *
 * 2026-07-16: 同种唯一约束后, 抽到已养 species 会撞 partial unique 索引 E11000。
 * 在 service 层循环重抽, 最多 MAX_PETS_PER_STUDENT 次 (物种池子规模上限),
 * 仍冲突 → 422「运气太差」(用户可换蛋或先弃养)。
 */
async function hatch({ orgId, studentId, petId, by = 'parent' }) {
  const pet = await loadOwnedPet({ orgId, studentId, petId })
  if (pet.state !== 'egg') throw ApiError.unprocessable('当前不是蛋状态，无法破壳')

  let species = pet.species || null  // 2026-07-17: 蛋上预赋值则优先用

  // 取该学员 **其他活** 宠物的 species 集合
  // 排除当前蛋 (_id) + 只看 alive (蛋态 species 还没真"领养") → 预赋值的蛋不被自己挡
  const ownedPets = await PetAccount.find({
    org: orgId,
    student: studentId,
    _id: { $ne: pet._id },
    state: 'alive',
    species: { $ne: null, $exists: true }
  }).select('species').lean()
  const ownedKeys = new Set(ownedPets.map((p) => p.species))

  if (!species) {
    // 仅未预赋值时才 roll
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
  } else if (ownedKeys.has(species)) {
    // 预赋值已被该学员破壳领养 → 422 (提示明确)
    const sp = await petCatalog.getSpecies({ key: species })
    throw ApiError.unprocessable(`该学员已破壳领养 ${sp?.name || species}, 请弃养后再试`)
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

  const stuSnap = await buildStudentSnapshot(orgId, studentId)
  const petSnap = buildPetSnapshot(updated)
  const event = await petEvent.recordEvent({
    orgId, studentId, petAccountId: pet._id,
    type: by === 'admin' ? 'admin_hatch' : 'hatch',
    payload: mergeSnapshot({ species, level: 1 }, { ...petSnap, ...stuSnap })
  })

  // 2026-07-19: 破壳 = 升到 Lv.1 的虚拟升级, 返回 Lv.1 升级特效让前端播放
  // (用户决策: 蛋破壳后立即播 1 级升级特效, 与喂食跨级升级语义一致)
  const speciesRec = await petCatalog.getSpecies({ key: species })
  const lv1Effect = resolveLevelUpEffectAtLevel(speciesRec, 1)
  const levelUpEffects = lv1Effect ? [lv1Effect] : []

  return {
    petAccount: await decoratePet(updated, orgId),
    event,
    levelUp: lv1Effect != null,         // 等价于 "本次破壳有 Lv.1 特效"
    levelUpEffects,
    levelUpToLevel: 1,
    levelUpCount: lv1Effect ? 1 : 0
  }
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

  // 2026-07-21 v4: ownerSpecies 数组校验 — 限定给某几个物种的消耗品
  // pet.species ∈ ownerSpecies 才允许喂；空数组 = 通用
  const ownerSpecies = found.consumable.ownerSpecies || []
  if (Array.isArray(ownerSpecies) && ownerSpecies.length > 0) {
    if (!ownerSpecies.includes(pet.species)) {
      const speciesList = await petCatalog.listSpecies({ isActive: true })
      const spMap = Object.fromEntries(speciesList.map((s) => [s.key, s.name]))
      const names = ownerSpecies.map((k) => spMap[k] || k).join('、')
      throw ApiError.unprocessable(`该消耗品仅限「${names}」使用`)
    }
  }

  const levelCfg = await petCatalog.getLevelConfig(orgId)
  // 2026-07-16: 最高等级来自 PetSpecies（per-species），PetAccount 无 override 字段
  const speciesRec = await petCatalog.getSpecies({ key: pet.species })
  const maxLevel = resolveMaxLevel(speciesRec)
  const cfg = { ...levelCfg, maxLevel }

  // 计算新的 exp / level / hunger
  let newExp = pet.experience + expGain
  let newLevel = pet.level
  let newHunger = Math.min(pet.maxHunger, pet.currentHunger + hungerGain)
  let levelUpCount = 0

  // 2026-07-18 第四期: 升级特效队列 — 一次喂食跨 N 级时按 fromLevel 升序收集
  // (用 speciesRecord 提前在循环外查一次, 避免循环内反复 query; maxLevel 决定循环上限)
  // 注意: speciesRec 在循环外已查 (上方)
  const levelUpEffects = []
  while (newLevel < maxLevel) {
    const need = expToNext(newLevel, cfg)
    if (need == null || newExp < need) break
    newExp -= need
    newLevel += 1
    levelUpCount += 1
    // 升到 newLevel → 查 levelVisuals[newLevel].levelUpEffect (无 fallback, 未配则跳过)
    const eff = resolveLevelUpEffectAtLevel(speciesRec, newLevel)
    if (eff) levelUpEffects.push(eff)
  }
  // 满级封顶：经验清零（进度条显示已满）
  if (newLevel >= maxLevel) newExp = 0

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
  // 2026-07-17: 同时取 student+pet 快照, payload 冗余利于 admin 流水 (含弃养后仍可查)
  const feedStuSnap = await buildStudentSnapshot(orgId, studentId)
  const feedPetSnap = buildPetSnapshot(updated)
  events.push(await petEvent.recordEvent({
    orgId, studentId, petAccountId: pet._id,
    type: by === 'admin' ? 'admin_feed' : 'feed',
    payload: mergeSnapshot({
      consumableKey,
      // 2026-07-17: 此前缺失 — admin 流水的"积分"列拿不到扣分明细, 误以为没扣
      // 实际扣分走 petPoints.chargeForFeed (上方 line 242), 此字段只用于审计/可视化
      pointCost: cost,
      expGain,
      hungerBefore: pet.currentHunger, hungerAfter: newHunger,
      expBefore: pet.experience, expAfter: newExp,
      level: newLevel,
      operator: by === 'admin' ? operatorId : null
    }, { ...feedPetSnap, ...feedStuSnap })
  }))
  if (levelUpCount > 0) {
    for (let i = 0; i < levelUpCount; i++) {
      events.push(await petEvent.recordEvent({
        orgId, studentId, petAccountId: pet._id,
        type: 'levelup',
        payload: mergeSnapshot(
          { fromLevel: pet.level + i, toLevel: pet.level + i + 1 },
          { ...feedPetSnap, ...feedStuSnap }
        )
      }))
    }
  }

  return {
    petAccount: await decoratePet(updated, orgId, levelCfg),
    levelUp: levelUpCount > 0,
    // 2026-07-18 第四期: 跨级时依次播放 (Lv.X → Lv.X+1 → ...) — 用户决策: 跨级按链路串行播
    // levelUpEffects[] 已按 fromLevel 升序收集; 空数组表示本次未升级 / 无特效可播
    levelUpCount,
    levelUpToLevel: newLevel,  // 本次最终到达的等级 (levelUp=true 时有意义)
    levelUpEffects,
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

  const stuSnap2 = await buildStudentSnapshot(orgId, studentId)
  const petSnap2 = buildPetSnapshot(updated)
  const event = await petEvent.recordEvent({
    orgId, studentId, petAccountId: pet._id,
    type: by === 'admin' ? 'admin_set_default' : 'set_default',
    payload: mergeSnapshot(
      { operator: by === 'admin' ? operatorId : null },
      { ...petSnap2, ...stuSnap2 }
    )
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

  // 删档 (PetAccount.visuals 已撤，per-species levelVisuals 在 PetSpecies 上，弃 PetAccount 不用解绑 File refs)
  const deleted = await PetAccount.deleteOne({
    _id: pet._id,
    org: orgId,
    student: studentId
  })
  if (deleted.deletedCount === 0) {
    throw ApiError.conflict('宠物已被他人操作，请刷新后重试')
  }

  // 2026-07-21 v3: 不需要弃养级联清理（ownerSpecies 是 PetSpecies.key，不受宠物实例增减影响）
  // 同物种的其他宠物仍可正常喂该消耗品

  // 审计 (弃养事件 sparse eventKey 不需要 — 一次性手动操作, 无幂等需求)
  // 2026-07-17: 弃养时 PetAccount 已物理删除, 必须 snapshot 学员姓名 + 宠物昵称/物种/等级才能在 admin 流水追溯
  const stuSnapAb = await buildStudentSnapshot(orgId, studentId)
  const petSnapAb = buildPetSnapshot(pet)
  await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: by === 'admin' ? 'admin_abandon' : 'abandon',
    payload: mergeSnapshot({
      reason: by === 'admin' ? 'admin' : 'manual',
      operator: by === 'admin' ? operatorId : null,
      // 顺手记下弃养时的 species, 后续 admin 事件流好追溯
      species: pet.species || null,
      level: pet.level || 1,
      experience: pet.experience || 0,
      nickname: pet.nickname || null
    }, { ...petSnapAb, ...stuSnapAb })
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
 * 给 pet 文档补派生字段（nextExpToLevel / maxLevel / currentVisual / levelUpEffect / eggVisual / speciesRecord）。
 * maxLevel 来自 PetSpecies（per-species，PetAccount 无 override）。
 * currentVisual 是 server 端走完 per-species fallback 链后的解析结果（species.levelVisuals[L] → species 视觉），
 *   前端拿这一个字段渲染即可，无需自己维护 lookup。
 * levelUpEffect 是当前等级升级上来时播放的特效 (2026-07-18 第四期, 仅装饰查询时方便预览;
 *   升级瞬时播放请直接用 feed 返回的 levelUpEffects[]).
 * eggVisual 是蛋态底层视觉 (2026-07-18 第五期): 直接取 species 自身视觉字段, 不走 fallback 链.
 *   蛋态用此作为底图, emoji + 破壳动画作为 overlay.
 */
async function decoratePet(pet, orgId, levelCfg) {
  if (!pet) return null
  const result = { ...pet }
  if (pet.species) {
    result.speciesRecord = await petCatalog.getSpecies({ key: pet.species }) || null
  }
  if (pet.state === 'alive') {
    const expCfg = levelCfg || await petCatalog.getLevelConfig(orgId || pet.org)
    const maxLevel = resolveMaxLevel(result.speciesRecord)
    result.nextExpToLevel = expToNext(pet.level, { ...expCfg, maxLevel })
    result.maxLevel = maxLevel
    // 解析当前等级的形象（per-species levelVisuals fallback 链 → species 兜底）
    result.currentVisual = resolveVisualAtLevel(result.speciesRecord, pet.level)
    // 2026-07-18 第四期: 当前等级的升级特效 (无 fallback; null = 该等级未配 = 无特效)
    // 仅供"如果当前是从上一级升上来的，该播什么"查询 (课堂展示 / 列表预览等场景)
    result.levelUpEffect = resolveLevelUpEffectAtLevel(result.speciesRecord, pet.level)
  } else if (pet.state === 'egg') {
    // 2026-07-18 第五期: 蛋态底层视觉 = species 自身视觉字段 (不走 fallback)
    result.eggVisual = resolveEggVisual(result.speciesRecord)
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
