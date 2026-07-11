'use strict'

const ApiError = require('@utils/ApiError')
const UserOrgRel = require('@models/UserOrgRel.model')

/**
 * 高阶中间件：requirePermission('student.write') 或 OR 关系 requirePermission('task.read', 'task.read.own')
 *
 * - 平台超管直接通过, 注入 ['*'] 通配符
 * - 阶段 1 简单实现：每次请求查一次 DB。阶段 2 改 Redis 缓存。
 * - 校验通过后必须把聚合后的完整权限集合挂回 req.user.permissions, 下游 service 才能 cross-check
 *   (例如 task.service.list 用 task.read 之外的权限做二次过滤)
 *
 * 2026-07-11: 多参数 = OR 关系, 任一通过即可. 用于拆权限场景 (task.read 看全部 vs task.read.own 看自己).
 *   单参数调用保持原语义不变.
 */
module.exports = function requirePermission(...perms) {
  // 兼容单 perm 字符串: requirePermission('task.read')
  // 以及 OR 形式: requirePermission('task.read', 'task.read.own')
  if (!perms.length) {
    throw new Error('requirePermission: 至少需要一个权限码')
  }
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

      const userPerms = new Set()
      for (const p of rel.positions || []) {
        if (p && p.isActive !== false) {
          for (const code of p.permissions || []) userPerms.add(code)
        }
      }

      // OR: 任一通过即可
      const ok = perms.some((code) => userPerms.has(code))
      if (!ok) {
        throw ApiError.forbidden(`无权限: ${perms.join(' | ')}`)
      }
      // 2026-07-11: 把聚合后的完整权限集合挂回 req.user.permissions, 让下游 service 也能 cross-check
      //   (例如 task.service.list 用 task.read 之外的权限做二次过滤, 或用 supervisor 角色的权限判断)。
      //   之前只校验不写入, 导致下游 service.permissions || [] 永远是 [] → "task.read 拥有者仍只看自己" bug
      req.user.permissions = Array.from(userPerms)
      next()
    } catch (e) {
      next(e)
    }
  }
}
