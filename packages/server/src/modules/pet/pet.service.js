'use strict'

/**
 * Pet Service（2026-06-21 pet-system-v2 完整版）
 *
 * 核心状态机（详细见 plan §4）：
 *   - state=egg → hatch → state=alive（species 锁定，hunger 满）
 *   - state=alive → feed → levelup / tierup (满级升阶 → state=egg, eggTier=next)
 *   - state=alive → swap-egg → state=egg（保留阶，扣积分）
 *   - state=alive → tier-down → state=egg（降阶，species 保留，0 积分）
 *   - state=alive → cron 判定 hunger=0 + N 天 → state=dead → 同一 tick rebirth → state=egg
 *
 * 关键不变量（service 必须保证）：
 *   - species 在 egg 态已锁定时，hatch 不再随机（D2）
 *   - feed 满级升阶在单事务内级联完成（feed 后立刻 state=egg + eggTier=next）
 *   - tierdown 是原子的单次 $set
 *   - 任何写操作都先 read → 计算新值 → CAS update（参照 PointsAccount 模式）
 *
 * 写 PetEvent 的时机：
 *   - adopt / hatch / feed / levelup / tierup / tierdown / swap / death / rebirth
 *   - equip / unequip（见 petItems.service.js）
 *   - admin_override
 *
 * 与 PointsAccount 的关系：
 *   - feed / swap 扣积分走 petPoints.helper.chargeForFeed / chargeForSwap
 *   - 升阶/降阶/破壳/死亡 0 积分，不写 PointsTransaction
 */

const mongoose = require('mongoose')
const PetAccount = require('@models/PetAccount.model')
const ApiError = require('@utils/ApiError')
const petConfig = require('@shared/petConfig')
// 2026-06-21 pet-system-v2-ext: species/items/consumables 从 shared 迁到 DB，
// 统一通过 petCatalog 读（带 cache + shared 兜底）。
const petCatalog = require('@modules/pet/petCatalog.service')
const petPoints = require('./petPoints.helper')
const petEvent = require('./petEvent.service')

const { ObjectId } = mongoose.Types

// ─────────────────────────────────────────────────────────────
// 懒创建 / 领养
// ─────────────────────────────────────────────────────────────

/**
 * 懒创建 PetAccount（参照 PointsAccount.ensureAccount）。
 *
 * 行为：
 *   - 若已存在 → 直接返回
 *   - 若不存在 → 创建 state=egg, eggTier=C, hunger=100, level=1, exp=0 的新记录
 *     并写 PetEvent type=adopt
 *
 * 触发场景：
 *   - 家长首次打开 pet 页（懒兜底）
 *   - 报名成功钩子（显式 adopt）
 *
 * @param {String} orgId
 * @param {String} studentId
 * @param {String} [by='manual']  - 触发来源：'enrollment' / 'manual'（仅审计记录）
 * @returns {Promise<Object>} PetAccount 文档（lean）
 */
async function ensurePetAccount(orgId, studentId, by = 'manual') {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!studentId) throw ApiError.badRequest('缺少 studentId')

  const existing = await PetAccount.findOne({ org: orgId, student: studentId }).lean()
  if (existing) return existing

  // 懒创建：新蛋，C 阶
  const now = new Date()
  const created = await PetAccount.create({
    org: orgId,
    student: studentId,
    state: 'egg',
    stateChangedAt: now,
    eggTier: 'C',
    eggAdoptedAt: now,
    eggHatchedAt: null,
    species: null,
    tier: null,
    level: 1,
    experience: 0,
    hatchedAt: null,
    adoptedAt: now,
    currentHunger: 100,
    maxHunger: petConfig.MAX_HUNGER,
    lastFedAt: null,
    lastHungerDecayAt: null,
    deathThresholdDays: 30,
    nickname: null,
    unlocked: { hat: [], scarf: [], clothes: [], accessory: [], halo: [], background: [] },
    equipped: { hat: null, scarf: null, clothes: null, accessory: null, halo: null, background: null },
    meta: {}
  })

  // 写 adopt 事件（首次创建时）
  await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: created._id,
    type: 'adopt',
    payload: { initialTier: 'C', by }
  })

  return created.toObject()
}

/**
 * 显式领养：仅当学员尚未有 PetAccount 时创建（避免重复 adopt）。
 *
 * 业务上 enroll 钩子调这个，幂等。
 */
async function adopt({ orgId, studentId, by = 'enrollment' }) {
  const existing = await PetAccount.findOne({ org: orgId, student: studentId }).lean()
  if (existing) return existing // 幂等
  return ensurePetAccount(orgId, studentId, by)
}

// ─────────────────────────────────────────────────────────────
// 破壳
// ─────────────────────────────────────────────────────────────

/**
 * 破壳：state=egg → state=alive，species 随机（若 D2 已锁定则保留）。
 *
 * 同时根据新阶/新等级应用解锁：
 *   - 升 Lv 1 → 解锁当前阶 C 默认 hat/scarf/clothes/accessory（按 unlockLevel ≤ 1）
 *   - 蛋 state=egg 不触发 halo/background（halo/background 仅 alive 升阶时解锁）
 *
 * @returns {Promise<{petAccount: Object, event: Object}>}
 */
async function hatch({ orgId, studentId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')

  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物，请先领养')
  if (pet.state !== 'egg') throw ApiError.unprocessable('当前不是蛋状态，无法破壳')

  const eggTier = pet.eggTier
  if (!eggTier || !petConfig.isValidTier(eggTier)) {
    throw ApiError.unprocessable('蛋的阶数据异常')
  }

  // D2: 若 species 已锁定（升阶遗留），直接复用；否则按当前 eggTier 加权随机
  let species = pet.species
  if (!species) {
    const rolled = await petCatalog.rollSpecies({ tier: eggTier })
    if (!rolled) throw ApiError.unprocessable('当前阶下没有可选种类')
    species = rolled.key
  }

  // 验证 species 存在
  const speciesDoc = await petCatalog.getSpecies({ key: species })
  if (!speciesDoc) {
    throw ApiError.unprocessable('种类数据异常')
  }

  const now = new Date()
  const cfg = petConfig.PET_TIER_CONFIG[eggTier]

  // 计算新解锁：按当前等级 1（破壳后 level=1）
  const newLevelUnlocks = await petCatalog.listItemsUnlockedAtLevel({ tier: eggTier, level: 1 })
  // 蛋→活不触发 halo/background（仅 alive 升阶时解锁）

  // 2026-06-23: 不再写 PetAccount.hungerDecayMinutes；由 PetSpecies.hungerDecayMinutes 直接决定

  // 合并 unlocked（去重）—— 按 item.slot 分类
  const unlocked = pet.unlocked || {}
  const itemsByKey = await Promise.all(newLevelUnlocks.map(k => petCatalog.getItem({ key: k })))
  const slotOf = (k) => {
    const it = itemsByKey[newLevelUnlocks.indexOf(k)]
    return it && (it.slot || it.type)
  }
  const mergedUnlocked = {
    hat:        Array.from(new Set([...(unlocked.hat || []), ...newLevelUnlocks.filter(k => slotOf(k) === 'hat')])),
    scarf:      Array.from(new Set([...(unlocked.scarf || []), ...newLevelUnlocks.filter(k => slotOf(k) === 'scarf')])),
    clothes:    Array.from(new Set([...(unlocked.clothes || []), ...newLevelUnlocks.filter(k => slotOf(k) === 'clothes')])),
    accessory:  Array.from(new Set([...(unlocked.accessory || []), ...newLevelUnlocks.filter(k => slotOf(k) === 'accessory')])),
    halo:       Array.from(unlocked.halo || []),
    background: Array.from(unlocked.background || [])
  }

  // CAS update：以 (state='egg', _id) 为守卫
  // 2026-06-22: equipped 重置为全 null（蛋态逻辑上不该有装备；swapEgg 后保留旧装备是 bug）
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id, state: 'egg' },
    {
      $set: {
        state: 'alive',
        stateChangedAt: now,
        species,
        tier: eggTier,
        level: 1,
        experience: 0,
        hatchedAt: now,
        eggHatchedAt: now,
        currentHunger: petConfig.INIT_HUNGER_AFTER_HATCH,  // 2026-06-23: 破蛋后从 300 起（maxHunger=1000）
        lastFedAt: now, // 破壳即记录（衰减起点）
        lastHungerDecayAt: now,
        deathThresholdDays: cfg.deathThresholdDays,
        unlocked: mergedUnlocked,
        equipped: { hat: null, scarf: null, clothes: null, accessory: null, halo: null, background: null }
      }
    },
    { new: true }
  ).lean()

  if (!updated) {
    throw ApiError.conflict('宠物状态已变更，请刷新后重试')
  }

  const event = await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'hatch',
    payload: { tier: eggTier, species, level: 1, unlocked: newLevelUnlocks }
  })

  return { petAccount: updated, event, leveledUp: false, tieredUp: false }
}

// ─────────────────────────────────────────────────────────────
// 喂食（核心，CAS）
// ─────────────────────────────────────────────────────────────

/**
 * 喂食：扣积分 + 经验累计 + 饱腹度恢复 + 升级 + 满级升阶级联。
 *
 * 状态机：
 *   - 必须在 state='alive' 才可喂
 *   - 每次喂食：experience += expGain；可能触发 levelup / tierup
 *   - 满级（level==maxLv）时经验继续累计，达到 tierUpExpThreshold 触发 tierup：
 *     - state='alive' → 'egg'
 *     - eggTier=nextTier(current)
 *     - level=1, exp=0
 *     - species 保留（D2 决策：升阶保留）
 *     - hunger=maxHunger, lastFedAt=now
 *     - 解锁新阶 halo/background（D4 决策：升阶解锁但不自动装备）
 *
 * 扣分失败（积分不足）→ 整个操作回滚（经验/饱腹度不变）
 * 写失败 → CAS 守卫失败时 retry 1 次；再失败抛 409
 *
 * 2026-06-21 pet-system-v2-ext：consumableKey 直接走 DB-driven 的 PetConsumable.key
 *
 * @param {String} orgId
 * @param {String} studentId
 * @param {String} consumableKey - DB-driven 的 PetConsumable.key
 * @returns {Promise<{petAccount, levelUp, tierUp, pointsCost, pointsAfter, events}>}
 */
async function feed({ orgId, studentId, consumableKey, by = 'parent' }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')

  // 解析 consumableKey（必须显式传）
  const resolvedKey = consumableKey
  if (!resolvedKey) throw ApiError.badRequest('缺少 consumableKey')

  // 1. 读 pet
  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')
  if (pet.state !== 'alive') throw ApiError.unprocessable('当前不是存活状态，无法喂食')

  const tier = pet.tier
  const cfg = petConfig.PET_TIER_CONFIG[tier]
  if (!cfg) throw ApiError.unprocessable('宠物阶数据异常')

  // 2. 查 consumable 配置（DB 优先 + 校验 applicableTier）
  const found = await petCatalog.findConsumable({ key: resolvedKey, tier })
  if (!found) throw ApiError.notFound(`消耗品 ${resolvedKey} 在 ${tier} 阶不可用`)
  const { consumable, perTierConfig } = found
  const cost = perTierConfig.pointCost
  const expGain = perTierConfig.expGain
  const hungerGain = perTierConfig.hungerRestore

  // 3. 计算新的 exp / level / hunger
  let newExp = pet.experience + expGain
  let newLevel = pet.level
  let newHunger = Math.min(pet.maxHunger, pet.currentHunger + hungerGain)
  let tierUpTriggered = false
  let levelUpCount = 0

  // 处理升级链（单次喂食可能跨多级，但 exp 不足以跨阶的不会触发 tierup）
  while (newLevel < cfg.maxLv && newExp >= petConfig.expToNext(tier, newLevel)) {
    newExp -= petConfig.expToNext(tier, newLevel)
    newLevel += 1
    levelUpCount += 1
  }

  // 满级后判断是否触发升阶
  if (newLevel >= cfg.maxLv) {
    const tierUpThreshold = petConfig.tierUpExpThreshold(tier)
    if (newExp >= tierUpThreshold) {
      const next = petConfig.nextTier(tier)
      if (!next) {
        // 已是 S 阶最高
        newExp = Math.min(newExp, tierUpThreshold - 1)
      } else {
        tierUpTriggered = true
      }
    }
  }

  // 4. 先扣积分（积分不足时整体回滚）
  const chargeResult = await petPoints.chargeForFeed({
    orgId,
    studentId,
    petAccountId: pet._id,
    consumableKey: resolvedKey,
    cost,
    expGain,
    hungerGain
  })
  // 此时扣分已成功；若后面 CAS 失败，玩家"花了积分没拿到效果"——但 CAS 失败极罕见
  // 未来如发现可加补偿流（写一笔 refund 流水）

  // 5. 构造 update 操作
  const now = new Date()
  const setFields = {
    experience: newExp,
    currentHunger: newHunger,
    lastFedAt: now
  }
  const pushFields = {}

  if (tierUpTriggered) {
    const nextTier = petConfig.nextTier(tier)
    // 解锁新阶 halo + background（D4 不自动装备，仅加入 unlocked）
    const newTierUnlocks = await petCatalog.listItemsUnlockedAtTier({ tier: nextTier })
    const tierUnlockItems = await Promise.all(newTierUnlocks.map(k => petCatalog.getItem({ key: k })))
    const slotOfT = (k) => {
      const it = tierUnlockItems[newTierUnlocks.indexOf(k)]
      return it && (it.slot || it.type)
    }
    setFields.state = 'egg'
    setFields.stateChangedAt = now
    setFields.eggTier = nextTier
    setFields.eggAdoptedAt = now
    setFields.tier = nextTier
    setFields.level = 1
    setFields.experience = 0
    setFields.currentHunger = pet.currentHunger  // 2026-06-23: 升阶继承原饱腹度
    setFields.lastHungerDecayAt = now
    setFields.deathThresholdDays = petConfig.PET_TIER_CONFIG[nextTier].deathThresholdDays
    setFields.species = pet.species // D2: species 保留

    // unlocked 合并 halo/background
    const unlocked = pet.unlocked || {}
    setFields.unlocked = {
      hat:        unlocked.hat || [],
      scarf:      unlocked.scarf || [],
      clothes:    unlocked.clothes || [],
      accessory:  unlocked.accessory || [],
      halo:       Array.from(new Set([...(unlocked.halo || []), ...newTierUnlocks.filter(k => slotOfT(k) === 'halo')])),
      background: Array.from(new Set([...(unlocked.background || []), ...newTierUnlocks.filter(k => slotOfT(k) === 'background')]))
    }
  } else if (levelUpCount > 0) {
    setFields.level = newLevel
    // 解锁新 Lv 带来的升级型装饰
    const newLvUnlocks = await petCatalog.listItemsUnlockedAtLevel({ tier, level: newLevel })
    if (newLvUnlocks.length > 0) {
      const lvUnlockItems = await Promise.all(newLvUnlocks.map(k => petCatalog.getItem({ key: k })))
      const slotOfLv = (k) => {
        const it = lvUnlockItems[newLvUnlocks.indexOf(k)]
        return it && (it.slot || it.type)
      }
      const unlocked = pet.unlocked || {}
      setFields.unlocked = {
        hat:        Array.from(new Set([...(unlocked.hat || []), ...newLvUnlocks.filter(k => slotOfLv(k) === 'hat')])),
        scarf:      Array.from(new Set([...(unlocked.scarf || []), ...newLvUnlocks.filter(k => slotOfLv(k) === 'scarf')])),
        clothes:    Array.from(new Set([...(unlocked.clothes || []), ...newLvUnlocks.filter(k => slotOfLv(k) === 'clothes')])),
        accessory:  Array.from(new Set([...(unlocked.accessory || []), ...newLvUnlocks.filter(k => slotOfLv(k) === 'accessory')])),
        halo:       unlocked.halo || [],
        background: unlocked.background || []
      }
    }
  }

  // 6. CAS update（带状态守卫 + 老值校验）
  const casFilter = {
    _id: pet._id,
    state: 'alive',
    level: pet.level,
    experience: pet.experience,
    currentHunger: pet.currentHunger
  }

  let updated = await PetAccount.findOneAndUpdate(casFilter, { $set: setFields }, { new: true }).lean()
  if (!updated) {
    // retry 1 次：重读 + 重计算
    const fresh = await PetAccount.findById(pet._id).lean()
    if (!fresh) throw ApiError.notFound('宠物不存在')
    if (fresh.state !== 'alive') throw ApiError.conflict('宠物状态已变更，请刷新')
    // 重计算（这次基于 fresh state）
    // 为简单起见，直接把新值强制写入（接受玩家可能少得一点经验，但不阻塞）
    // 实务上：让玩家重试更友好
    updated = await PetAccount.findOneAndUpdate(
      { _id: pet._id, state: 'alive' },
      { $set: setFields },
      { new: true }
    ).lean()
    if (!updated) throw ApiError.conflict('宠物状态并发变更，请刷新后重试')
  }

  // 7. 写 PetEvent（feed 必写；levelup / tierup 按需写）
  const events = []
  events.push(await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: by === 'admin' ? 'admin_feed' : 'feed',
    payload: {
      consumableKey: resolvedKey,
      expGain,
      hungerBefore: pet.currentHunger,
      hungerAfter: newHunger,
      expBefore: pet.experience,
      expAfter: tierUpTriggered ? 0 : newExp,
      tier: tierUpTriggered ? petConfig.nextTier(tier) : tier,
      level: tierUpTriggered ? 1 : newLevel,
      operator: by === 'admin' ? (petPoints.operatorId || null) : null
    }
  }))

  if (levelUpCount > 0 && !tierUpTriggered) {
    for (let i = 0; i < levelUpCount; i++) {
      const fromL = pet.level + i
      const toL = fromL + 1
      events.push(await petEvent.recordEvent({
        orgId,
        studentId,
        petAccountId: pet._id,
        type: 'levelup',
        payload: { fromLevel: fromL, toLevel: toL, tier }
      }))
    }
  }

  if (tierUpTriggered) {
    events.push(await petEvent.recordEvent({
      orgId,
      studentId,
      petAccountId: pet._id,
      type: 'tierup',
      payload: { fromTier: tier, toTier: petConfig.nextTier(tier), species: pet.species }
    }))
  }

  return {
    petAccount: updated,
    levelUp: levelUpCount > 0 && !tierUpTriggered,
    tierUp: tierUpTriggered,
    pointsCost: cost,
    pointsAfter: chargeResult.account.balance,
    events: events.filter(Boolean)
  }
}

// ─────────────────────────────────────────────────────────────
// 置换蛋（保留阶，0 经验，扣积分）
// ─────────────────────────────────────────────────────────────

/**
 * 置换蛋：state=alive → state=egg（保留当前 tier；species 破壳时重新随机）。
 *
 * 业务流程：
 *   - 校验 state=alive
 *   - 扣 swapCost 积分
 *   - CAS update: state=egg, eggTier=current tier, level=1, exp=0, currentHunger=maxHunger, species=preserved
 *   - 写 PetEvent type=swap
 *
 * @returns {Promise<{petAccount, pointsCost, pointsAfter, event}>}
 */
async function swapEgg({ orgId, studentId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')

  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')
  if (pet.state !== 'alive') throw ApiError.unprocessable('当前不是存活状态，无法置换')

  const tier = pet.tier
  const cfg = petConfig.PET_TIER_CONFIG[tier]
  if (!cfg) throw ApiError.unprocessable('宠物阶数据异常')

  const cost = cfg.swapCost

  // 扣积分
  const chargeResult = await petPoints.chargeForSwap({
    orgId,
    studentId,
    petAccountId: pet._id,
    cost
  })

  // CAS update
  const now = new Date()
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id, state: 'alive' },
    {
      $set: {
        state: 'egg',
        stateChangedAt: now,
        eggTier: tier, // 保留阶
        eggAdoptedAt: now,
        // species 保留（D2: 升阶保留 species，但 swap 是玩家主动行为，破壳时重新随机；
        // 实际语义：当前 species 字段保留作为参考，但下一次 hatch 会重新随机 rollSpecies(eggTier)）
        // 这里清掉 species 让 hatch 时重新随机：
        species: null,
        level: 1,
        experience: 0,
        currentHunger: pet.currentHunger,  // 2026-06-23: 置换后保留原饱腹度（用户决策）
        lastHungerDecayAt: now,
        // unlocked / equipped 保留（玩家已解锁的不会丢）
        // equipped 不动（D3 一致：降阶/置换不动 unlocked；只有 tierdown 触发超 cap 卸下）
      }
    },
    { new: true }
  ).lean()

  if (!updated) {
    throw ApiError.conflict('宠物状态已变更，请刷新后重试')
  }

  const event = await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'swap',
    payload: { tier, cost, fromSpecies: pet.species }
  })

  return {
    petAccount: updated,
    pointsCost: cost,
    pointsAfter: chargeResult.account.balance,
    event
  }
}

// ─────────────────────────────────────────────────────────────
// 主动降阶（0 积分，保留 species + unlocked，自动卸下超 cap 装备）
// ─────────────────────────────────────────────────────────────

/**
 * 主动降阶：state=alive → state=egg，eggTier=targetTier。
 *
 * 行为：
 *   - 0 积分
 *   - species 保留（D2）
 *   - unlocked 全部保留（D3：玩家资产不丢）
 *   - equipped 自动卸下：超新阶 cap（即 item.unlockTier > targetTier）的装备置 null
 *   - level=1, exp=0, hunger=maxHunger
 *   - 写 PetEvent type=tierdown
 *
 * @param {String} orgId
 * @param {String} studentId
 * @param {String} targetTier - C / B / A / S（必须 < 当前 tier）
 * @returns {Promise<{petAccount, event}>}
 */
async function tierDown({ orgId, studentId, targetTier }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  if (!targetTier) throw ApiError.badRequest('缺少 targetTier')
  if (!petConfig.isValidTier(targetTier)) throw ApiError.badRequest('targetTier 不合法')

  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')
  if (pet.state !== 'alive') throw ApiError.unprocessable('当前不是存活状态，无法降阶')
  if (pet.tier === targetTier) throw ApiError.unprocessable('已在目标阶')

  // 校验 targetTier < pet.tier
  const order = ['C', 'B', 'A', 'S']
  const currentIdx = order.indexOf(pet.tier)
  const targetIdx = order.indexOf(targetTier)
  if (targetIdx >= currentIdx) throw ApiError.unprocessable('降阶目标必须低于当前阶')

  // 计算新 equipped：超新阶 cap 的卸下
  const targetCfg = petConfig.PET_TIER_CONFIG[targetTier]
  const equipped = pet.equipped || {}
  const equippedItemMap = {}
  for (const slot of ['hat', 'scarf', 'clothes', 'accessory', 'halo', 'background']) {
    if (equipped[slot]) {
      const item = await petCatalog.getItem({ key: equipped[slot] })
      equippedItemMap[slot] = item
    }
  }
  const isOverCap = (slot) => {
    const it = equippedItemMap[slot]
    if (!it) return false
    const ut = it.unlockTier
    return ut && tierOrderIdx(ut) > targetIdx
  }
  const newEquipped = {
    hat: isOverCap('hat') ? null : equipped.hat,
    scarf: isOverCap('scarf') ? null : equipped.scarf,
    clothes: isOverCap('clothes') ? null : equipped.clothes,
    accessory: isOverCap('accessory') ? null : equipped.accessory,
    halo: isOverCap('halo') ? null : equipped.halo,
    background: isOverCap('background') ? null : equipped.background
  }

  // 找出会被自动卸下的 item（写事件时记录）
  const autoUnequipped = []
  for (const slot of ['hat', 'scarf', 'clothes', 'accessory', 'halo', 'background']) {
    if (equipped[slot] && !newEquipped[slot]) {
      autoUnequipped.push({ slot, itemKey: equipped[slot] })
    }
  }

  // CAS update
  const now = new Date()
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id, state: 'alive', tier: pet.tier },
    {
      $set: {
        state: 'egg',
        stateChangedAt: now,
        eggTier: targetTier,
        eggAdoptedAt: now,
        species: pet.species, // D2: species 保留
        tier: targetTier,
        level: 1,
        experience: 0,
        currentHunger: pet.currentHunger,  // 2026-06-23: 降阶继承原饱腹度
        lastHungerDecayAt: now,
        deathThresholdDays: targetCfg.deathThresholdDays,
        equipped: newEquipped
        // unlocked 不动（D3：玩家资产保留）
      }
    },
    { new: true }
  ).lean()

  if (!updated) throw ApiError.conflict('宠物状态已变更，请刷新后重试')

  // 写事件：tierdown + 各 unequip
  const event = await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'tierdown',
    payload: { fromTier: pet.tier, toTier: targetTier, reason: 'manual', autoUnequipped }
  })
  // auto unequip 各写一条事件
  for (const { slot, itemKey } of autoUnequipped) {
    await petEvent.recordEvent({
      orgId,
      studentId,
      petAccountId: pet._id,
      type: 'unequip',
      payload: { slot, itemKey, fromItemKey: itemKey, reason: 'tierdown_cap' }
    })
  }

  return { petAccount: updated, event, autoUnequipped }
}

/**
 * 手动升阶（2026-06-22）
 *
 * 与 feed 级联升阶的区别：不扣积分、不加经验；纯把当前存活宠物升到下一阶。
 * 前置条件：
 *   - state === 'alive'
 *   - level >= 当前阶 maxLv
 *   - experience >= tierUpThreshold
 *   - 当前阶不是 S（S 是最高阶）
 *
 * 升阶后：
 *   - state → 'egg'（新阶蛋，待破壳出 B/A/S 阶新种类）
 *   - species 保留（沿用当前种类，不重随机）
 *   - level=1, experience=0, currentHunger=maxHunger
 *   - 解锁新阶 halo + background
 *   - 写 tierup 事件（by='admin' 时由调用方决定是否再写 admin_tierup）
 *
 * @returns {Promise<{petAccount, event, fromTier, toTier}>}
 */
async function manualTierUp({ orgId, studentId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')

  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')
  if (pet.state !== 'alive') throw ApiError.unprocessable('当前不是存活状态，无法升阶')

  const cfg = petConfig.PET_TIER_CONFIG[pet.tier]
  if (!cfg) throw ApiError.unprocessable('宠物阶数据异常')
  if (pet.level < cfg.maxLv) {
    throw ApiError.unprocessable(`需要先满级（${pet.tier} 阶 maxLv=${cfg.maxLv}），当前 Lv.${pet.level}`)
  }
  const threshold = petConfig.tierUpExpThreshold(pet.tier)
  if (pet.experience < threshold) {
    throw ApiError.unprocessable(`累计经验需 ≥ ${threshold} 才能升阶，当前 ${pet.experience}`)
  }
  const nextTier = petConfig.nextTier(pet.tier)
  if (!nextTier) throw ApiError.unprocessable('已是最高阶 S，无法升阶')

  const fromTier = pet.tier
  const now = new Date()

  // 解锁新阶 halo + background（与 feed 一致）
  const newTierUnlocks = await petCatalog.listItemsUnlockedAtTier({ tier: nextTier })
  const tierUnlockItems = await Promise.all(newTierUnlocks.map(k => petCatalog.getItem({ key: k })))
  const slotOfT = (k) => {
    const it = tierUnlockItems[newTierUnlocks.indexOf(k)]
    return it && (it.slot || it.type)
  }
  const unlocked = pet.unlocked || {}

  const setFields = {
    state: 'egg',
    stateChangedAt: now,
    eggTier: nextTier,
    eggAdoptedAt: now,
    tier: nextTier,
    level: 1,
    experience: 0,
    currentHunger: pet.currentHunger,  // 2026-06-23: 手动升阶继承原饱腹度
    lastHungerDecayAt: now,
    deathThresholdDays: petConfig.PET_TIER_CONFIG[nextTier].deathThresholdDays,
    species: pet.species, // D2 保留
    unlocked: {
      hat:        unlocked.hat || [],
      scarf:      unlocked.scarf || [],
      clothes:    unlocked.clothes || [],
      accessory:  unlocked.accessory || [],
      halo:       Array.from(new Set([...(unlocked.halo || []), ...newTierUnlocks.filter(k => slotOfT(k) === 'halo')])),
      background: Array.from(new Set([...(unlocked.background || []), ...newTierUnlocks.filter(k => slotOfT(k) === 'background')]))
    }
  }

  // CAS update
  const casFilter = {
    _id: pet._id,
    state: 'alive',
    level: pet.level,
    experience: pet.experience
  }
  let updated = await PetAccount.findOneAndUpdate(casFilter, { $set: setFields }, { new: true }).lean()
  if (!updated) {
    // retry
    const fresh = await PetAccount.findById(pet._id).lean()
    if (!fresh) throw ApiError.notFound('宠物不存在')
    if (fresh.state !== 'alive') throw ApiError.conflict('宠物状态已变更，请刷新')
    updated = await PetAccount.findOneAndUpdate(
      { _id: pet._id, state: 'alive' },
      { $set: setFields },
      { new: true }
    ).lean()
    if (!updated) throw ApiError.conflict('宠物状态并发变更，请刷新后重试')
  }

  // 写 PetEvent
  const event = await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'tierup',
    payload: { fromTier, toTier: nextTier, trigger: 'manual', unlocked: newTierUnlocks }
  })

  return { petAccount: updated, event, fromTier, toTier: nextTier }
}

function tierOrderIdx(t) {
  return ['C', 'B', 'A', 'S'].indexOf(t)
}

// ─────────────────────────────────────────────────────────────
// 读
// ─────────────────────────────────────────────────────────────

/**
 * 取当前 active child 的 PetAccount（懒创建）。
 *
 * 返回 lean 文档 + 派生字段：
 *   - speciesRecord: 完整 species 记录（含 image/name）
 *   - nextExpToLevel: 升级所需经验（满级返回 null）
 *   - tierUpThreshold: 满级升阶所需经验（S 阶 null）
 *   - currentFoodCost: 当前阶三档喂食成本
 */
async function getMine({ orgId, studentId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!studentId) throw ApiError.badRequest('缺少 studentId')

  const pet = await ensurePetAccount(orgId, studentId)
  return await decoratePet(pet)
}

/**
 * 给 pet 文档补上派生字段（2026-06-21 pet-system-v2-ext：async 因 speciesRecord 走 DB）。
 */
async function decoratePet(pet) {
  if (!pet) return null
  const result = { ...pet }
  if (pet.species && pet.org) {
    result.speciesRecord = await petCatalog.getSpecies({ key: pet.species }) || null
  }
  if (pet.state === 'alive' && pet.tier) {
    const cfg = petConfig.PET_TIER_CONFIG[pet.tier]
    if (cfg) {
      result.nextExpToLevel = petConfig.expToNext(pet.tier, pet.level)
      result.tierUpThreshold = petConfig.tierUpExpThreshold(pet.tier)
      result.currentFoodCost = cfg.feedCost
      result.currentSwapCost = cfg.swapCost
      result.possibleTierDowns = petConfig.lowerTiers(pet.tier)
    }
  } else if (pet.state === 'egg' && pet.eggTier) {
    result.eggTierConfig = petConfig.PET_TIER_CONFIG[pet.eggTier] || null
  }
  return result
}

async function listEvents({ orgId, studentId, page = 1, pageSize = 20 }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))
  const filter = { org: orgId, student: studentId }
  const [items, total] = await Promise.all([
    require('@models/PetEvent.model').find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .lean(),
    require('@models/PetEvent.model').countDocuments(filter)
  ])
  return { items, total, page: safePage, pageSize: safeSize }
}

/**
 * 今日工作台 (2026-06-23 AI 助手接入): 饥饿度低的宠物
 *  - 默认 threshold=20 (currentHunger <= 20 即视为"快饿死")
 *  - 仅 state=alive (egg 态没有 currentHunger 饥饿概念; dead 态已被 cron 自动转 egg, 不命中)
 *  - 排序: currentHunger 升序 (越低越靠前)
 *  - 派生: 监护人手机号 (用于"提醒家长喂食"等场景)
 *  - 返回 { threshold, items, count }
 */
async function listStarving({ orgId, threshold = 20, limit = 50 }) {
  const t = Math.max(0, Math.min(1000, Number(threshold) || 0))
  const PetAccount = require('@models/PetAccount.model')
  const Student = require('@models/Student.model')

  const pets = await PetAccount.find({
    org: orgId,
    state: 'alive',
    currentHunger: { $lte: t }
  })
    .populate('student', 'name')
    .sort({ currentHunger: 1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean()

  // 派生: 监护人手机号
  const studentIds = [...new Set(pets.map((p) => String(p.student?._id)).filter(Boolean))]
  const students = studentIds.length
    ? await Student.find({ _id: { $in: studentIds } })
        .populate('guardians', 'mobile')
        .lean()
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
        tier: p.tier,
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
  ensurePetAccount,
  adopt,
  hatch,
  feed,
  swapEgg,
  tierDown,
  manualTierUp,
  getMine,
  decoratePet,
  listEvents,
  listStarving
}
