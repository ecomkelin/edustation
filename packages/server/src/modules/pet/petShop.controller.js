'use strict'

/**
 * 宠物商城 Controller（pet-shop 2026-06-22）
 *
 * C 端：家长/学员 自助买（4 个端点：list / buy-item / buy-consumable）
 * admin 端：老师/admin 代买（2 个端点：grant-item / grant-consumable）
 *
 * operatorId 来源：
 *   - C 端：req.user.id（authenticate 中间件注入）
 *   - admin：req.user.id（同一中间件）
 */

const shop = require('./petShop.service')
const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')
const PetAccount = require('@models/PetAccount.model')

function studentIdOf(req) {
  const sid = req.body?.student || req.activeStudentId
  if (!sid) throw ApiError.badRequest('缺少 studentId / x-active-student-id')
  return sid
}

// GET /api/v1/pet/shop?tier=C&petAccountId=xxx
// 列表：列出可购买 items + consumables（per-tier 价格）
exports.listShop = async (req, res) => {
  const studentId = studentIdOf(req)
  // 优先用 query 的 petAccountId，否则按 studentId 查 PetAccount 推
  let petAccountId = req.query?.petAccountId
  let tier = req.query?.tier
  if (!petAccountId) {
    const pet = await PetAccount.findOne({ org: req.orgId, student: studentId }).select('_id tier').lean()
    if (pet) {
      petAccountId = pet._id.toString()
      if (!tier) tier = pet.tier || pet.eggTier
    }
  }
  const result = await shop.listShop({ orgId: req.orgId, petAccountId, tier })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/shop/buy-item — { itemKey }
exports.buyItem = async (req, res) => {
  const studentId = studentIdOf(req)
  const { itemKey } = req.body || {}
  if (!itemKey) throw ApiError.badRequest('缺少 itemKey')
  const result = await shop.buyItem({
    orgId: req.orgId,
    studentId,
    itemKey,
    by: 'student',
    operatorId: req.user?.id
  })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/shop/buy-consumable — { consumableKey }
exports.buyConsumable = async (req, res) => {
  const studentId = studentIdOf(req)
  const { consumableKey } = req.body || {}
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  const result = await shop.buyConsumable({
    orgId: req.orgId,
    studentId,
    consumableKey,
    by: 'student',
    operatorId: req.user?.id
  })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/admin/pet/grant-item — { petAccountId, itemKey }
exports.grantItem = async (req, res) => {
  const { petAccountId, itemKey } = req.body || {}
  if (!petAccountId) throw ApiError.badRequest('缺少 petAccountId')
  if (!itemKey) throw ApiError.badRequest('缺少 itemKey')
  const result = await shop.grantItem({
    orgId: req.orgId,
    petAccountId,
    itemKey,
    operatorId: req.user?.id
  })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/admin/pet/grant-consumable — { petAccountId, consumableKey }
exports.grantConsumable = async (req, res) => {
  const { petAccountId, consumableKey } = req.body || {}
  if (!petAccountId) throw ApiError.badRequest('缺少 petAccountId')
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  const result = await shop.grantConsumable({
    orgId: req.orgId,
    petAccountId,
    consumableKey,
    operatorId: req.user?.id
  })
  res.json(ApiResponse.ok(result))
}

// GET /api/v1/admin/pet/shop?petAccountId=xxx&tier=C
// admin 端查看商城列表（无需 active student 中间件，用 petAccountId 推上下文）
// R-2375
exports.adminListShop = async (req, res) => {
  const { petAccountId, tier } = req.query || {}
  let resolvedAccountId = petAccountId
  let resolvedTier = tier
  // 没传 petAccountId 时尝试从 orgId 推（极端情况，目前不需要，保留扩展位）
  if (!resolvedTier && resolvedAccountId) {
    const pet = await PetAccount.findOne({ _id: resolvedAccountId, org: req.orgId }).select('tier eggTier').lean()
    if (pet) resolvedTier = pet.tier || pet.eggTier
  }
  const result = await shop.listShop({
    orgId: req.orgId,
    petAccountId: resolvedAccountId || null,
    tier: resolvedTier || null
  })
  res.json(ApiResponse.ok(result))
}