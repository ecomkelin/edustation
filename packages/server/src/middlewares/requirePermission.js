'use strict'

const ApiError = require('@utils/ApiError')
const UserOrgRel = require('@models/UserOrgRel.model')

/**
 * 高阶中间件：requirePermission('student.write')
 * 平台超管直接通过。
 * 阶段 1 简单实现：每次请求查一次 DB。阶段 2 改 Redis 缓存。
 */
module.exports = function requirePermission(perm) {
  return async function (req, res, next) {
    try {
      if (!req.user) throw ApiError.unauthorized()
      if (req.user.isPlatformAdmin) return next()

      if (!req.orgId) throw ApiError.badRequest('缺少 x-org-id')

      const rel = await UserOrgRel.findOne({ user: req.user.id, org: req.orgId })
        .populate('positions', 'permissions isActive')
        .lean()

      if (!rel) throw ApiError.forbidden('您不属于该机构')

      const perms = new Set()
      for (const p of rel.positions || []) {
        if (p && p.isActive !== false) {
          for (const code of p.permissions || []) perms.add(code)
        }
      }

      if (!perms.has(perm)) {
        throw ApiError.forbidden(`无权限: ${perm}`)
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}
