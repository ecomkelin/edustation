'use strict'

/**
 * pet-system-v2 接入 points.recordTransaction 的薄包装
 *
 * 2026-06-21：trigger='pet' 已在 @shared/enums 的 POINTS_TRIGGER_DIRECTION
 * 中标记 direction=-1（扣分）。本文件只做语义包装：
 *   - feed() 调 recordTransaction 扣分（扣不动 → 玩家积分不足 → 喂食失败）
 *   - swapEgg() 调 recordTransaction 扣分
 *   - 升阶/降阶/破壳/死亡 0 积分，**不**走 recordTransaction
 *
 * 复用 [[points.service.recordTransaction]] 已有的：
 *   - balance CAS 原子更新
 *   - 流水记录（PointsTransaction）
 *   - balanceAfter 快照
 *   - 报告缓存失效
 *
 * 不在这里写：PetEvent（业务事件流独立，与积分流水解耦）。
 */

const pointsService = require('@modules/points/points.service')

/**
 * 喂食扣积分（仅扣分；经验/饱腹度更新由 pet.service.feed 自己处理）。
 *
 * 2026-06-21 pet-system-v2-ext 升级：
 *   - 支持 consumableKey（DB-driven 的 PetConsumable.key）
 *   - 兼容 foodType（v1 旧字段）
 *
 * @param {Object} opts
 * @param {String} opts.orgId
 * @param {String} opts.studentId
 * @param {String} opts.petAccountId
 * @param {String} opts.consumableKey - 新字段（PetConsumable.key）
 * @param {String} [opts.foodType] - v1 兼容；可空
 * @param {Number} opts.cost - 正数（喂食成本）
 * @param {Number} opts.expGain - 喂食带来的经验值
 * @param {Number} opts.hungerGain - 喂食带来的饱腹度恢复
 * @returns {Promise<{transaction: Object, account: Object}>}
 * @throws ApiError.unprocessable 积分不足时
 */
async function chargeForFeed({ orgId, studentId, petAccountId, consumableKey, foodType, cost, expGain, hungerGain, operatorId }) {
  return pointsService.recordTransaction({
    orgId,
    studentId,
    trigger: 'pet',
    amount: -Math.abs(cost),
    refType: 'PetAccount',
    refId: petAccountId,
    operator: operatorId, // admin 代操作时记录
    meta: {
      action: 'feed',
      consumableKey,
      foodType: foodType || null,
      expGain,
      hungerGain
    }
  })
}

/**
 * 置换蛋扣积分。
 */
async function chargeForSwap({ orgId, studentId, petAccountId, cost, operatorId }) {
  return pointsService.recordTransaction({
    orgId,
    studentId,
    trigger: 'pet',
    amount: -Math.abs(cost),
    refType: 'PetAccount',
    refId: petAccountId,
    operator: operatorId, // admin 代操作时记录
    meta: {
      action: 'swap_egg'
    }
  })
}

module.exports = {
  chargeForFeed,
  chargeForSwap
}
