'use strict'

const service = require('./org.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await service.list(req.query)
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await service.detail(req.params.id)
  res.json(ApiResponse.ok(data))
}

exports.create = async (req, res) => {
  // fileBindOrgId：上传 logo 时用的源 org（req.orgId），用于 fileBind 跨租户校验。
  // 不传会导致"新建机构时绑的 logo"被 fileBind.isOurFile 当作跨租户跳过 → 孤儿。
  const data = await service.create(req.body, { fileBindOrgId: req.orgId })
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  // fileBindOrgId：req.orgId（上传 logo 时用的源 org），用于 fileBind 跨租户校验。
  // 不传会导致"在 X scope 上传、在 Y org 上 PUT"时，fileBind.isOurFile 误判为跨租户 → 孤儿。
  // isPlatformAdmin: 透传到 service 层做字段白名单 (2026-06: super-admin-only 字段硬卡)
  const data = await service.update(req.params.id, req.body, {
    fileBindOrgId: req.orgId,
    isPlatformAdmin: !!(req.user && req.user.isPlatformAdmin)
  })
  res.json(ApiResponse.ok(data))
}

// 机构不允许物理删除——见 org.routes.js 注释。请使用 toggle-active。

exports.toggleActive = async (req, res) => {
  const data = await service.toggleActive(req.params.id, req.user.id, req.body.password)
  res.json(ApiResponse.ok(data))
}

exports.candidatePrincipals = async (req, res) => {
  const data = await service.candidatePrincipals(req.params.id)
  res.json(ApiResponse.ok(data))
}

/**
 * R-0932 GET /orgs/:id/public (2026-07-02 立项)
 * 公开机构主页:登入家长可访问 (无 PERM, 不需 employee 权限码)
 *
 * 输入:
 *   - path :id (hex 24) — 机构 _id
 *
 * 输出 (service.public 内做白名单过滤):
 *   - 基础字段: name, nameAbbreviation, type (String enum), logo, address, establishedDate
 *   - 地区: region (仅 name + code,不暴露完整 region 对象)
 *   - 联系方式: contactPerson, contactPhone (C 端家长可见, 但前端展示时建议配合号码脱敏)
 *   - 推广摘要: 拼装 R-0930 当前生效的 OrgPromotion 字段
 *     { promotionSummary: { banner, headline, subheadline, highlights[], campusStory, brandIntro, hotline, contactPerson, contactPhone, ctaText, ctaUrl, images[] } }
 *
 * 不输出 (PII / 合规):
 *   - socialCreditCode / legalPerson / licenseNumber (平台超管专属)
 *   - principal (User ObjectId)
 *   - meta (Mixed)
 *   - timestamps
 *
 * 停用机构 (isActive=false) 仍返 200 (前端可展示"该机构暂未开放"),但同 orgId 后续
 * 写接口会失败。
 */
exports.public = async (req, res) => {
  const data = await service.public(req.params.id)
  res.json(ApiResponse.ok(data))
}
