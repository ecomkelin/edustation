'use strict'

/**
 * Pet Controller（2026-06-21 pet-system-v2 完整版）
 *
 * C 端（家长）路由 — 不需要业务权限码，仅 auth + activeStudent + requireEnrolledStudent
 */

const s = require('./pet.service')
const petItems = require('./petItems.service')
const petCatalog = require('./petCatalog.service')
const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')

function studentIdOf(req) {
  const sid = req.body?.student || req.activeStudentId
  if (!sid) throw ApiError.badRequest('缺少 studentId / x-active-student-id')
  return sid
}

// 懒创建兜底（任何路由都先 ensure）
async function ensureOrThrow(orgId, studentId) {
  await s.ensurePetAccount(orgId, studentId)
}

// GET /api/v1/pet/me — 当前 active child 的 PetAccount
exports.me = async (req, res) => {
  const studentId = studentIdOf(req)
  await ensureOrThrow(req.orgId, studentId)
  const result = await s.getMine({ orgId: req.orgId, studentId })
  res.json(ApiResponse.ok(result))
}

// GET /api/v1/pet/species — 种类图鉴
exports.species = async (req, res) => {
  res.json(ApiResponse.ok(petCatalog.listSpecies()))
}

// GET /api/v1/pet/items — 装饰图鉴 + 解锁/装备状态
exports.items = async (req, res) => {
  const studentId = studentIdOf(req)
  await ensureOrThrow(req.orgId, studentId)
  const result = await petItems.listCatalog({ orgId: req.orgId, studentId })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/adopt — 0 积分（懒创建兜底；幂等）
exports.adopt = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.adopt({ orgId: req.orgId, studentId, by: 'manual' })
  res.json(ApiResponse.ok(s.decoratePet(result)))
}

// POST /api/v1/pet/hatch — 0 积分
exports.hatch = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.hatch({ orgId: req.orgId, studentId })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/feed — { foodType }
exports.feed = async (req, res) => {
  const studentId = studentIdOf(req)
  const { foodType } = req.body || {}
  if (!foodType) throw ApiError.badRequest('缺少 foodType')
  const result = await s.feed({ orgId: req.orgId, studentId, foodType })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/swap-egg — 扣积分
exports.swapEgg = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.swapEgg({ orgId: req.orgId, studentId })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/tier-down — { targetTier }
exports.tierDown = async (req, res) => {
  const studentId = studentIdOf(req)
  const { targetTier } = req.body || {}
  if (!targetTier) throw ApiError.badRequest('缺少 targetTier')
  const result = await s.tierDown({ orgId: req.orgId, studentId, targetTier })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/equip — { slot, itemKey }
exports.equip = async (req, res) => {
  const studentId = studentIdOf(req)
  const { slot, itemKey } = req.body || {}
  if (!slot) throw ApiError.badRequest('缺少 slot')
  const result = await petItems.equip({ orgId: req.orgId, studentId, slot, itemKey: itemKey ?? null })
  res.json(ApiResponse.ok(result))
}

// GET /api/v1/pet/events — 事件流分页
exports.events = async (req, res) => {
  const studentId = studentIdOf(req)
  const { page, pageSize } = req.query
  const result = await s.listEvents({
    orgId: req.orgId,
    studentId,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20
  })
  res.json(ApiResponse.ok(result))
}
