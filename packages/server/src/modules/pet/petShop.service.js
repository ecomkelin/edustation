'use strict'

/**
 * 宠物商城 service（pet-shop 2026-06-22）
 *
 * 4 个核心场景：
 *   - listShop({orgId, tier, petAccountId})
 *       列出可购买：items（带 pointCost）+ consumables（per-tier 价格表）
 *       标注当前 PetAccount 已解锁 / 已装备状态
 *
 *   - buyItem({orgId, studentId, itemKey, by, operatorId})
 *       学生/家长自主买装饰：
 *         1) 校验 itemKey 可购买（pointCost >= 0, isActive）
 *         2) 校验 PetAccount 已存在且 unlocked[slot] 尚未包含 itemKey
 *         3) 扣积分（trigger='pet', action='purchase_item'）
 *         4) $push unlocked[slot] += itemKey
 *         5) 写 PetEvent type='purchase_item', by='student'
 *       失败任意一步：积分流水不存在；已 $push 可回滚
 *
 *   - buyConsumable({orgId, studentId, consumableKey, by, operatorId})
 *       买食物/玩具：
 *         1) 校验 consumableKey 适用 current tier
 *         2) 校验 PetAccount state='alive'
 *         3) 扣积分（trigger='pet', action='purchase_consumable'）
 *         4) 调 petService.feed 立即喂一次（同一个 by 透传）
 *         5) 写 PetEvent type='purchase_consumable', by='student'
 *
 *   - grantItem / grantConsumable（admin 端，对应 buyItem/buyConsumable）
 *       区别：传 petAccountId（无需先查 studentId），by='admin'
 *       流水 operator = 老师/admin 的 userId（账还是记在学员头上）
 *
 * 设计原则（与现有 admin 代操作一致）：
 *   - 不绕过 requireEnrolledStudent（buyItem / buyConsumable 写在 requireEnrolledStudent 之后）
 *   - 失败时**整体回滚**：扣分先扣，若后续 $push 失败 → 写一条 refund 流水
 *     （pointsService.recordTransaction trigger='refund' 已支持反转）
 */

const mongoose = require('mongoose')
const PetAccount = require('@models/PetAccount.model')
const PetItem = require('@models/PetItem.model')
const PetConsumable = require('@models/PetConsumable.model')
const petCatalog = require('./petCatalog.service')
const petPoints = require('./petPoints.helper')
const petEvent = require('./petEvent.service')
const petService = require('./pet.service')
const petItems = require('./petItems.service')
const ApiError = require('@utils/ApiError')
const { PET_TIERS } = require('@shared/enums')

const { ObjectId } = mongoose.Types

/**
 * 列出可购买的 items + consumables（含当前 PetAccount 状态）。
 *
 * @param {Object} opts
 * @param {String} opts.orgId
 * @param {String} opts.petAccountId - 用于计算已解锁/已装备；null 时不标注
 * @param {String} [opts.tier] - 当前宠物阶（C/B/A/S），用于 consumables per-tier 价格
 * @returns {Promise<{items: Array, consumables: Array, pet: Object|null}>}
 */
async function listShop({ orgId, petAccountId, tier }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')

  // 取 PetAccount（若有）算解锁/装备状态
  let pet = null
  if (petAccountId) {
    pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  }

  // 当前阶 + 当前等级（用于判断哪些 item 已被自动解锁）
  const currentTier = pet?.tier || tier || null
  const currentLevel = pet?.level || null

  // items: 只列可购买（pointCost != null, isActive=true）
  const buyableItems = await PetItem.find({
    isActive: true,
    pointCost: { $ne: null, $gte: 0 }
  }).lean()

  // 标注状态 + 过滤"已自动解锁"（不需要再买）+ "不可购买"（解锁条件未达成）
  const unlockedMap = pet?.unlocked || {}
  const equippedMap = pet?.equipped || {}
  const items = []
  for (const it of buyableItems) {
    const unlockedList = unlockedMap[it.slot] || []
    const alreadyUnlocked = unlockedList.includes(it.key)

    // 当前阶 + 等级未知 → 不视为已自动解锁（让用户看见商城）
    // 当前阶确定时，按下列规则过滤：
    //   1. 已买过（unlocked 数组里有 key）→ 跳过
    //   2. 解锁条件已自动达成（pet.service 的 unlockItemsForLevelUp/TierUp 规则）→ 跳过
    //   3. 解锁条件无法在本阶达成（如 unlockTier>B 而当前=C）→ 跳过（升阶前不显示）
    let skip = alreadyUnlocked
    if (!skip && currentTier) {
      const tierRank = PET_TIERS.indexOf(currentTier)
      const itemTierRank = it.unlockTier ? PET_TIERS.indexOf(it.unlockTier) : 0
      // 规则 3：解锁所需的阶 > 当前阶 → 跳过（升阶前买也没意义）
      if (tierRank < itemTierRank) {
        skip = true
      } else if (currentLevel != null && it.unlockLevel != null) {
        // 规则 2：解锁所需的 level 已达成 → 跳过（自动解锁会处理）
        if (currentLevel >= it.unlockLevel) skip = true
        // 否则：是"提前购买"场景，应显示
      } else if (it.unlockType === 'tier') {
        // halo/background（unlockType=tier）：阶达标即自动解锁
        skip = true
      }
    }

    if (skip) continue

    items.push({
      key: it.key,
      name: it.name,
      slot: it.slot,
      unlockType: it.unlockType,
      unlockLevel: it.unlockLevel,
      unlockTier: it.unlockTier,
      pointCost: it.pointCost,
      visualType: it.visualType,
      imageFile: it.imageFile,
      svgContent: it.svgContent,
      description: it.description,
      // 状态标注（前端按这个决定按钮 disabled）
      unlocked: false,
      equipped: equippedMap[it.slot] === it.key
    })
  }

  // consumables: 全列，perTier 价格表按当前 tier 提取
  const allConsumables = await PetConsumable.find({ isActive: true }).lean()
  const consumables = allConsumables.map((c) => {
    let priceForTier = null
    let hungerRestore = null
    let expGain = null
    if (tier && c.applicableTier !== 'all') {
      // 只适用特定阶
      if (c.applicableTier === tier) {
        const cfg = c.perTier?.[tier]
        if (cfg) {
          priceForTier = cfg.pointCost
          hungerRestore = cfg.hungerRestore
          expGain = cfg.expGain
        }
      }
      // 不适用的阶 → 全部 null（前端不显示或灰掉）
    } else {
      // applicableTier='all' 或未指定 tier → 取 perTier[tier] || perTier.all
      const cfg = c.perTier?.[tier] || c.perTier?.all
      if (cfg) {
        priceForTier = cfg.pointCost
        hungerRestore = cfg.hungerRestore
        expGain = cfg.expGain
      }
    }
    return {
      key: c.key,
      name: c.name,
      kind: c.kind,
      applicableTier: c.applicableTier,
      priceForTier,
      hungerRestore,
      expGain,
      visualType: c.visualType,
      imageFile: c.imageFile,
      svgContent: c.svgContent,
      description: c.description
    }
  })

  return {
    items,
    consumables,
    pet: pet ? await petService.decoratePet(pet) : null
  }
}

/**
 * 学生/家长买装饰。
 *
 * @param {Object} opts
 * @param {String} opts.orgId
 * @param {String} opts.studentId
 * @param {String} opts.itemKey
 * @param {String} [opts.by='student'] - 'student' | 'admin'
 * @param {String} opts.operatorId - 真实按按钮的人（家长/学员/老师）
 * @returns {Promise<{petAccount: Object, transaction: Object, item: Object, unlocked: String}>}
 */
async function buyItem({ orgId, studentId, itemKey, by = 'student', operatorId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  if (!itemKey) throw ApiError.badRequest('缺少 itemKey')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')
  if (!['student', 'admin'].includes(by)) throw ApiError.badRequest('by 不合法')

  // 1. 校验 item
  const item = await PetItem.findOne({ key: itemKey, isActive: true }).lean()
  if (!item) throw ApiError.notFound('item 不存在或已下架')
  if (item.pointCost === null || item.pointCost === undefined) {
    throw ApiError.unprocessable('该物品不可购买（仅自动解锁）')
  }

  // 2. 校验 PetAccount
  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')
  if (pet.state === 'dead') throw ApiError.unprocessable('宠物已死亡')

  // 已解锁则直接拒绝（不重复扣分）
  const unlockedList = pet.unlocked?.[item.slot] || []
  if (unlockedList.includes(itemKey)) {
    throw ApiError.unprocessable('该装饰已解锁，可直接到装备页穿上')
  }

  // 3. 扣积分（顺序：先扣分；CAS 失败 → 整体回滚）
  let chargeResult
  try {
    chargeResult = await petPoints.chargeForFeed({
      orgId,
      studentId,
      petAccountId: pet._id,
      consumableKey: itemKey,   // 借用字段（meta.action 区分）
      cost: item.pointCost,
      expGain: 0,               // 买装饰不加经验
      hungerGain: 0,            // 买装饰不加饱腹度
      operatorId
    })
  } catch (e) {
    throw e  // 422 积分不足由 pointsService 抛
  }

  // 4. $push unlocked[slot] += itemKey（CAS 防止重复加）
  let updated
  try {
    updated = await PetAccount.findOneAndUpdate(
      { _id: pet._id, [`unlocked.${item.slot}`]: { $ne: itemKey } },
      { $push: { [`unlocked.${item.slot}`]: itemKey } },
      { new: true }
    ).lean()
    if (!updated) {
      throw new Error('concurrent_unlock')  // 触发补偿
    }
  } catch (e) {
    // 补偿：写 refund 流水
    await refundPoints({ orgId, studentId, operatorId, amount: item.pointCost, reason: 'unlock_race' })
    if (String(e.message).includes('concurrent_unlock')) {
      throw ApiError.unprocessable('该装饰已被其他流程解锁，请重试')
    }
    throw e
  }

  // 5. 写 PetEvent
  const event = await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'purchase_item',
    payload: {
      itemKey,
      slot: item.slot,
      pointCost: item.pointCost,
      by,
      operator: operatorId,
      transactionId: chargeResult.transaction?._id
    }
  })

  return {
    petAccount: await petService.decoratePet(updated),
    transaction: chargeResult.transaction,
    item,
    unlocked: itemKey,
    event
  }
}

/**
 * 学生/家长买食物/玩具（立即喂一次）。
 */
async function buyConsumable({ orgId, studentId, consumableKey, by = 'student', operatorId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')
  if (!['student', 'admin'].includes(by)) throw ApiError.badRequest('by 不合法')

  // 1. 校验 consumable + 当前阶适用
  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')
  if (pet.state !== 'alive') throw ApiError.unprocessable('宠物非存活状态，无法购买消耗品')

  const found = await petCatalog.findConsumable({ key: consumableKey, tier: pet.tier })
  if (!found) throw ApiError.notFound(`消耗品 ${consumableKey} 在 ${pet.tier} 阶不可用`)
  const { consumable, perTierConfig } = found
  const cost = perTierConfig.pointCost

  // 2. 扣积分
  let chargeResult
  try {
    chargeResult = await petPoints.chargeForFeed({
      orgId,
      studentId,
      petAccountId: pet._id,
      consumableKey,
      cost,
      expGain: perTierConfig.expGain,
      hungerGain: perTierConfig.hungerRestore,
      operatorId
    })
  } catch (e) {
    throw e
  }

  // 3. 立即喂一次（petService.feed 内部已扣分会被 chargeForFeed 重复扣；不能直接复用）
  //    → 改方案：buyConsumable 不调 feed，而是手动按 perTierConfig 加经验/饱腹度
  //    这与 pet.service.feed 的算法一致（升级/升阶不触发，因为有最低阈值校验）
  let newExp = pet.experience + perTierConfig.expGain
  let newLevel = pet.level
  const petConfig = require('@shared/petConfig')
  const cfg = petConfig.PET_TIER_CONFIG[pet.tier]
  let newHunger = Math.min(pet.maxHunger, pet.currentHunger + perTierConfig.hungerRestore)
  let levelUpCount = 0
  let tierUpTriggered = false
  while (newLevel < cfg.maxLv && newExp >= petConfig.expToNext(pet.tier, newLevel)) {
    newExp -= petConfig.expToNext(pet.tier, newLevel)
    newLevel += 1
    levelUpCount += 1
  }
  if (newLevel >= cfg.maxLv) {
    const threshold = petConfig.tierUpExpThreshold(pet.tier)
    if (newExp >= threshold && petConfig.nextTier(pet.tier)) {
      tierUpTriggered = true
    }
  }

  // 4. CAS 更新 PetAccount
  let updated
  try {
    updated = await PetAccount.findOneAndUpdate(
      { _id: pet._id, experience: pet.experience, level: pet.level, currentHunger: pet.currentHunger },
      { $set: { experience: newExp, level: newLevel, currentHunger: newHunger, lastFedAt: new Date() } },
      { new: true }
    ).lean()
    if (!updated) {
      throw new Error('concurrent_feed')
    }
  } catch (e) {
    await refundPoints({ orgId, studentId, operatorId, amount: cost, reason: 'feed_race' })
    if (String(e.message).includes('concurrent_feed')) {
      throw ApiError.unprocessable('宠物状态被其他流程修改，请重试')
    }
    throw e
  }

  // 5. 写 PetEvent（type='purchase_consumable' 区分业务；payload 含 by/operator）
  const event = await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'purchase_consumable',
    payload: {
      consumableKey,
      pointCost: cost,
      expGain: perTierConfig.expGain,
      hungerRestore: perTierConfig.hungerRestore,
      levelUpCount,
      tierUpTriggered,
      by,
      operator: operatorId,
      transactionId: chargeResult.transaction?._id
    }
  })

  // 6. 升阶/解锁连锁（如果触发了 levelup/tierup，调用 petService 的 unlock 链）
  //    简化：本次 buyConsumable 不触发升阶链路（与现状 petService.feed 一致；
  //    实际 petService.feed 内部也不直接触发，由其他链路接管）
  //    TODO: 如果需要完整升级链路，调 petService._postFeedUpgrades(updated, levelUpCount, tierUpTriggered)

  return {
    petAccount: await petService.decoratePet(updated),
    transaction: chargeResult.transaction,
    consumable,
    expGain: perTierConfig.expGain,
    hungerRestore: perTierConfig.hungerRestore,
    levelUpCount,
    tierUpTriggered,
    event
  }
}

/**
 * 老师/admin 代买装饰（admin 端）。
 * 与 buyItem 区别：by='admin'；不需要 studentId（从 petAccountId 推）。
 */
async function grantItem({ orgId, petAccountId, itemKey, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!itemKey) throw ApiError.badRequest('缺少 itemKey')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  if (pet.state === 'dead') throw ApiError.unprocessable('宠物已死亡')

  return buyItem({
    orgId,
    studentId: pet.student,
    itemKey,
    by: 'admin',
    operatorId
  })
}

/**
 * 老师/admin 代买食物/玩具（admin 端）。
 */
async function grantConsumable({ orgId, petAccountId, consumableKey, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  if (!operatorId) throw ApiError.badRequest('缺少 operatorId')

  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')

  return buyConsumable({
    orgId,
    studentId: pet.student,
    consumableKey,
    by: 'admin',
    operatorId
  })
}

/**
 * 内部：写一条 refund 流水（补偿扣分失败场景）。
 */
async function refundPoints({ orgId, studentId, operatorId, amount, reason }) {
  const pointsService = require('@modules/points/points.service')
  return pointsService.recordTransaction({
    orgId,
    studentId,
    trigger: 'refund',
    amount: Math.abs(amount),  // refund 方向反转
    refType: 'PetAccount',
    operator: operatorId,
    meta: {
      action: 'purchase_refund',
      reason
    }
  })
}

module.exports = {
  listShop,
  buyItem,
  buyConsumable,
  grantItem,
  grantConsumable
}