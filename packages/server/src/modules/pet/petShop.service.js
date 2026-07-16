'use strict'

/**
 * 宠物商城 service（pet-shop 2026-06-22；2026-07-15 重构：删装饰 + 去等阶 + 多宠 petId 化）
 *
 * 重构后仅剩「消耗品商城」：
 *   - listShop({orgId})           列出可购买的 consumables（扁平数值，无 tier）
 *   - buyConsumable({orgId, studentId, petId, consumableKey, by, operatorId})
 *       校验宠物存活 → 直接委托 petService.feed（feed 内部已扣分+加经验/饱腹度+升级）
 *   - grantConsumable({orgId, petAccountId, consumableKey, operatorId})
 *       admin 代买：从 petAccountId 推 studentId，by='admin'
 *
 * 装饰购买（buyItem/grantItem）已随装饰系统整体删除。
 */

const PetAccount = require('@models/PetAccount.model')
const PetConsumable = require('@models/PetConsumable.model')
const petService = require('./pet.service')
const ApiError = require('@utils/ApiError')

/**
 * 列出可购买的 consumables（扁平数值）。
 */
async function listShop({ orgId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const allConsumables = await PetConsumable.find({ isActive: true })
    .populate('videoFile', 'url mime')
    .lean()
  const consumables = allConsumables.map((c) => ({
    key: c.key,
    name: c.name,
    kind: c.kind,
    pointCost: c.pointCost,
    hungerRestore: c.hungerRestore,
    expGain: c.expGain,
    visualType: c.visualType,
    videoFile: c.videoFile,
    svgContent: c.svgContent,
    description: c.description
  }))
  return { consumables }
}

/**
 * 学生/家长买食物/玩具（立即喂一次；委托 feed，避免双重扣分）。
 */
async function buyConsumable({ orgId, studentId, petId, consumableKey, by = 'student', operatorId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  const feedBy = by === 'admin' ? 'admin' : 'parent'
  return petService.feed({ orgId, studentId, petId, consumableKey, by: feedBy, operatorId })
}

/**
 * 老师/admin 代买食物/玩具（admin 端）。petAccountId 即目标宠物。
 */
async function grantConsumable({ orgId, petAccountId, consumableKey, operatorId }) {
  if (!orgId || !petAccountId) throw ApiError.badRequest('缺少 orgId/petAccountId')
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  const pet = await PetAccount.findOne({ _id: petAccountId, org: orgId }).lean()
  if (!pet) throw ApiError.notFound('宠物不存在')
  return buyConsumable({
    orgId,
    studentId: pet.student,
    petId: pet._id,
    consumableKey,
    by: 'admin',
    operatorId
  })
}

module.exports = {
  listShop,
  buyConsumable,
  grantConsumable
}
