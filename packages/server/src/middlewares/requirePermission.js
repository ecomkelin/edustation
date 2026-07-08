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
      // 2026-07-08: 平台超管视作"持所有权限" — 注入 ['*'] 通配符, 让下游 service 的
      //   perms.includes('task.write') / 'student.delete' 等检查一致通过, 不必每个 service
      //   单独写 `actor.isPlatformAdmin || perms.includes(code)` 短路
      //   service 拿到的 `actor.permissions` 行为: 数组, includes() 永远 true
      if (req.user.isPlatformAdmin) {
        req.user.permissions = ['*']
        return next()
      }

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
