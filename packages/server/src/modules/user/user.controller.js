'use strict'

const service = require('./user.service')
const overviewService = require('./userOverview.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await service.list({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await service.detail(req.params.id, req.orgId, !!req.user.isPlatformAdmin)
  res.json(ApiResponse.ok(data))
}

exports.create = async (req, res) => {
  const data = await service.create({ orgId: req.orgId, ...req.body })
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  const data = await service.update(req.params.id, req.orgId, req.body)
  res.json(ApiResponse.ok(data))
}

exports.remove = async (req, res) => {
  await service.remove(req.params.id, req.orgId)
  res.json(ApiResponse.ok())
}

exports.removableCheck = async (req, res) => {
  const data = await service.removableCheck(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.changePassword = async (req, res) => {
  await service.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword)
  res.json(ApiResponse.ok())
}

exports.resetPassword = async (req, res) => {
  await service.resetPassword(req.params.id, req.orgId, req.body.newPassword)
  res.json(ApiResponse.ok())
}

exports.setPositions = async (req, res) => {
  // isPlatformAdmin 必须透传: service 里的 sensitive 权限闸门要靠它放行超管 (2026-08-07 修)
  const data = await service.setPositions(
    req.params.id,
    req.orgId,
    req.body.positions,
    !!req.user.isPlatformAdmin
  )
  res.json(ApiResponse.ok(data))
}

/**
 * 切换某员工作为"对外名师"。
 * 仅写 UserOrgRel.showAsTeacher; user.roleScope='guardian' 时强制返回 400 (兜底对齐 service)。
 */
exports.setTeacherFlag = async (req, res) => {
  const data = await service.setTeacherFlag(req.params.id, req.orgId, req.body.showAsTeacher)
  res.json(ApiResponse.ok(data))
}

exports.lookupByMobile = async (req, res) => {
  const data = await service.lookupByMobile(req.query.mobile, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.attachToOrg = async (req, res) => {
  const data = await service.attachToOrg(
    req.params.id,
    req.orgId,
    req.body.positions || [],
    !!req.body.isMain
  )
  res.status(201).json(ApiResponse.created(data))
}

// 切换用户黑名单（isBlocked=true/false），仅超管
exports.setBlocked = async (req, res) => {
  const data = await service.setBlocked(req.params.id, req.body.isBlocked, req.body.reason)
  res.json(ApiResponse.ok(data))
}

// 游离用户（2026-06）: 不属于任何机构的孤儿账号管理, 仅平台超管
exports.listUnaffiliated = async (req, res) => {
  const data = await service.listUnaffiliated(req.query)
  res.json(ApiResponse.ok(data))
}

exports.updateUnaffiliated = async (req, res) => {
  const data = await service.updateUnaffiliated(req.params.id, req.body)
  res.json(ApiResponse.ok(data))
}

// 游离用户 resetPassword 走 platform-admin 守卫 (R-0209), orgId 在此场景下无意义,
//   传 null 跳过 UserOrgRel 校验即可. service 内有 isPlatformAdmin 路径判断.
exports.resetPasswordUnaffiliated = async (req, res) => {
  await service.resetPassword(req.params.id, null, req.body.newPassword)
  res.json(ApiResponse.ok())
}

// ─── 用户详情页聚合 (2026-08-07) ───────────────────────────────
// 可见性完全交给 userOverview.service.resolveScope 处理:
//   平台超管 → 全平台视角; 机构管理员 → 强制 { org: req.orgId } 且目标必须属于本机构 (否则 404)

// R-0217 GET /users/:id/overview
exports.overview = async (req, res) => {
  const data = await overviewService.overview({
    userId: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: !!req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(data))
}

// R-0218 GET /users/:id/related/:domain
exports.related = async (req, res) => {
  const data = await overviewService.related({
    userId: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: !!req.user.isPlatformAdmin,
    domain: req.params.domain,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(data))
}
