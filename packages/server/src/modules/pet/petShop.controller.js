'use strict'

/**
 * 宠物商城 Controller（pet-shop 2026-06-22；2026-07-15 重构：删装饰 + 去 tier + 多宠 petId）
 *
 * C 端：家长/学员 自助买消耗品（list / buy-consumable）
 * admin 端：老师/admin 代买消耗品（grant-consumable / adminListShop）
 *
 * 2026-07-21 v3: 消耗品归属（ownerSpecies）—— buy/grant 时若 consumable 有 ownerSpecies, 强制找该学员对应物种的宠物
 * （step 1: body.petId → step 2: ownerSpecies 宠物 → step 3: 默认宠物）
 */

const shop = require('./petShop.service')
const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')
const PetAccount = require('@models/PetAccount.model')
const PetConsumable = require('@models/PetConsumable.model')

function studentIdOf(req) {
  const sid = req.body?.student || req.activeStudentId
  if (!sid) throw ApiError.badRequest('缺少 studentId / x-active-student-id')
  return sid
}

/**
 * 解析目标宠物 petId
 *   1. body.petId 显式指定（保持 C 端可显式指定）
 *   2. PetConsumable.ownerSpecies（2026-07-21 v3）—— 消耗品专属物种, 找该学员对应的物种宠物
 *   3. 默认宠物 fallback
 */
async function resolvePetId(req, studentId, consumableKey) {
  if (req.body?.petId) return req.body.petId

  // 2026-07-21 v4: 若 consumable 有 ownerSpecies (数组), 强制找该学员对应物种的宠物
  if (consumableKey) {
    const c = await PetConsumable.findOne({ key: consumableKey, isActive: true })
      .select('ownerSpecies').lean()
    const owners = c?.ownerSpecies || []
    if (Array.isArray(owners) && owners.length > 0) {
      // 找该学员的: species ∈ ownerSpecies + 状态 alive
      const pet = await PetAccount.findOne({
        org: req.orgId, student: studentId,
        species: { $in: owners }, state: 'alive'
      }).select('_id').lean()
      if (pet) return pet._id
      // 该学员没有 ownerSpecies 列表中的物种 → 让下游 pet.service.feed 抛 422
    }
  }

  // 现有 fallback
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
  // 2026-07-21: 传 consumableKey 让 resolvePetId 优先选 owner pet
  const petId = await resolvePetId(req, studentId, consumableKey)
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
