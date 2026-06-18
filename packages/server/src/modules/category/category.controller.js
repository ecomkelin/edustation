'use strict'

const s = require('./category.service')
const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')
const { requirePermission } = require('@middlewares')

/**
 * 2026-06 整改: Category 全 per-org, controller 把 req.orgId 注入 service.
 * 平台超管可省略 orgId (查跨 org), 但创建必须带 orgId.
 *
 * 写权限按 body.model 动态选 (复用引用方权限):
 *   - Student  → student.write
 *   - Subject  → subject.write
 *   - LeadTag  → recruit.write
 *   - Channel  → recruit.write
 */
async function assertWritePerm(req, model) {
  const perm = s.writePermFor(model)
  if (!perm) throw ApiError.badRequest(`不支持的 model: ${model}`)
  // 直接调 requirePermission 中间件函数 (它接受 (perm, getMode?))
  return new Promise((resolve, reject) => {
    requirePermission(perm)(req, {}, (err) => (err ? reject(err) : resolve()))
  })
}

exports.list = async (req, res) => {
  const data = await s.list({ ...req.query, orgId: req.orgId || null })
  res.json(ApiResponse.ok(data))
}
exports.tree = async (req, res) => {
  const data = await s.tree({ ...req.query, orgId: req.orgId || null })
  res.json(ApiResponse.ok(data))
}
exports.detail = async (req, res) => {
  const data = await s.detail(req.params.id, req.orgId || null)
  res.json(ApiResponse.ok(data))
}
exports.create = async (req, res) => {
  if (!req.orgId) throw ApiError.badRequest('类别字典必须归属某个机构')
  await assertWritePerm(req, req.body.model)
  const data = await s.create(req.body, req.orgId, !!(req.user && req.user.isPlatformAdmin))
  res.status(201).json(ApiResponse.created(data))
}
exports.update = async (req, res) => {
  // update 不一定带 model (只改 name/sort/isActive 时可不带),
  // 这种情况下从 DB 读原 model, 再校验权限.
  let model = req.body.model
  if (!model) {
    const existing = await s.detail(req.params.id, req.orgId || null)
    model = existing.model
  }
  await assertWritePerm(req, model)
  const data = await s.update(req.params.id, req.body, req.orgId || null)
  res.json(ApiResponse.ok(data))
}
exports.remove = async (req, res) => {
  // remove 没 body.model, 从 DB 取
  const existing = await s.detail(req.params.id, req.orgId || null)
  await assertWritePerm(req, existing.model)
  const data = await s.remove(req.params.id, req.orgId || null)
  res.json(ApiResponse.ok(data))
}
exports.removableCheck = async (req, res) => {
  const data = await s.removableCheck(req.params.id, req.orgId || null)
  res.json(ApiResponse.ok(data))
}
