'use strict'

/**
 * 宠物商城 Controller（pet-shop 2026-06-22；2026-07-15 重构：删装饰 + 去 tier + 多宠 petId）
 *
 * C 端：家长/学员 自助买消耗品（list / buy-consumable）
 * admin 端：老师/admin 代买消耗品（grant-consumable / adminListShop）
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

// 解析目标宠物 petId：优先 body.petId，否则取默认宠物
async function resolvePetId(req, studentId) {
  if (req.body?.petId) return req.body.petId
  const pet = await PetAccount.findOne({ org: req.orgId, student: studentId, isDefault: true })
    .select('_id').lean()
    || await PetAccount.findOne({ org: req.orgId, student: studentId }).select('_id').lean()
  if (!pet) throw ApiError.notFound('未领养宠物')
  return pet._id
}

// GET /api/v1/pet/shop — 消耗品列表（无 tier）
exports.listShop = async (req, res) => {
  const result = await shop.listShop({ orgId: req.orgId })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/shop/buy-consumable — { consumableKey, petId? }
exports.buyConsumable = async (req, res) => {
  const studentId = studentIdOf(req)
  const { consumableKey } = req.body || {}
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  const petId = await resolvePetId(req, studentId)
  const result = await shop.buyConsumable({
    orgId: req.orgId,
    studentId,
    petId,
    consumableKey,
    by: 'student',
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

// GET /api/v1/admin/pet/shop — admin 端消耗品列表
exports.adminListShop = async (req, res) => {
  const result = await shop.listShop({ orgId: req.orgId })
  res.json(ApiResponse.ok(result))
}
