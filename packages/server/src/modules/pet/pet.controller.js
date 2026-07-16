'use strict'

/**
 * Pet Controller（2026-06-21 pet-system-v2；2026-07-15 重构：多宠 + petId 化 + 无装饰）
 *
 * C 端（家长）路由 — 不需要业务权限码，仅 auth + activeStudent + requireEnrolledStudent
 */

const s = require('./pet.service')
const petCatalog = require('./petCatalog.service')
const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')

function studentIdOf(req) {
  const sid = req.body?.student || req.activeStudentId
  if (!sid) throw ApiError.badRequest('缺少 studentId / x-active-student-id')
  return sid
}

function petIdOf(req) {
  const pid = req.params.petId || req.body?.petId
  if (!pid) throw ApiError.badRequest('缺少 petId')
  return pid
}

// GET /api/v1/pet/me — 当前 active child 的默认宠物
exports.me = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.getMine({ orgId: req.orgId, studentId })
  res.json(ApiResponse.ok(result))
}

// GET /api/v1/pet/list — 当前 active child 的全部宠物（默认宠物在前）
exports.list = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.listMine({ orgId: req.orgId, studentId })
  res.json(ApiResponse.ok(result))
}

// GET /api/v1/pet/species — 种类图鉴
exports.species = async (req, res) => {
  res.json(ApiResponse.ok(await petCatalog.listSpecies(req.query || {})))
}

// GET /pet/consumables — 食物图鉴
exports.consumables = async (req, res) => {
  res.json(ApiResponse.ok(await petCatalog.listConsumables(req.query || {})))
}

// POST /api/v1/pet/adopt — 领养一只新宠物（≤ 上限）
exports.adopt = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.adopt({ orgId: req.orgId, studentId, by: 'parent' })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/:petId/hatch — 破壳（0 积分）
exports.hatch = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.hatch({ orgId: req.orgId, studentId, petId: petIdOf(req) })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/:petId/feed — { consumableKey }
exports.feed = async (req, res) => {
  const studentId = studentIdOf(req)
  const { consumableKey } = req.body || {}
  if (!consumableKey) throw ApiError.badRequest('缺少 consumableKey')
  const result = await s.feed({ orgId: req.orgId, studentId, petId: petIdOf(req), consumableKey })
  res.json(ApiResponse.ok(result))
}

// POST /api/v1/pet/:petId/set-default — 设为默认宠物
exports.setDefault = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.setDefault({ orgId: req.orgId, studentId, petId: petIdOf(req) })
  res.json(ApiResponse.ok(result))
}

// 2026-07-16: POST /api/v1/pet/:petId/abandon — 家长弃养
//   1 学生 + 1 species 唯一约束后, 多余可物理删除
//   守门: activeStudent 监护人校验 + loadOwnedPet 三元组 (org + student + petId)
//   无密码: C 端家长操作自家宠物, 走两步 modal 确认 (uni-app showModal)
exports.abandon = async (req, res) => {
  const studentId = studentIdOf(req)
  const result = await s.abandon({ orgId: req.orgId, studentId, petId: petIdOf(req), by: 'parent' })
  res.json(ApiResponse.ok(result))
}

// GET /api/v1/pet/events — 事件流分页（可选 petId 过滤）
exports.events = async (req, res) => {
  const studentId = studentIdOf(req)
  const { page, pageSize, petId } = req.query
  const result = await s.listEvents({
    orgId: req.orgId,
    studentId,
    petId: petId || undefined,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20
  })
  res.json(ApiResponse.ok(result))
}
