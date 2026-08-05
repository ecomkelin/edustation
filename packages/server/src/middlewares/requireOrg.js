'use strict'

const ApiError = require('@utils/ApiError')
const UserOrgRel = require('@models/UserOrgRel.model')
const Org = require('@models/Org.model')

/**
 * 校验 x-org-id header；超管可跳过。
 * 挂载 req.orgId。
 *
 * 2026-08-05: 加 Org.isActive 校验 (审计 M12)
 *   之前非超管只查 UserOrgRel.findOne({user,org}) 存在 → 即使 Org.isActive=false (机构被平台停用),
 *   该用户仍可继续读写业务数据. Org.model.js 注释明示"isActive=false 时该机构下用户无法登录/操作",
 *   但中间件未执行. 现在 Org.findById 查 isActive, 停用即 forbidden (超管豁免, 仍可继续代管).
 */
module.exports = async function requireOrg(req, res, next) {
  try {
    if (req.user && req.user.isPlatformAdmin) {
      // 平台超管：x-org-id 可选；如有则校验存在 + isActive (超管看停用机构也应被告知)
      const orgId = req.headers['x-org-id']
      if (orgId) {
        const org = await Org.findById(orgId).select('_id isActive').lean()
        if (!org) throw ApiError.notFound('机构不存在')
        // 超管看到停用机构仍可调 (代管/恢复用), 但在请求上下文标记, 由后续 service 决定是否拦截
        req.orgId = String(org._id)
        req.orgIsActive = org.isActive !== false
      } else {
        req.orgId = null
        req.orgIsActive = null
      }
      return next()
    }

    const orgId = req.headers['x-org-id']
    if (!orgId) {
      throw ApiError.badRequest('缺少 x-org-id header')
    }

    // 校验机构存在 + 未停用 (Org.isActive=false → 拒绝, 与 Org.model 注释语义对齐)
    const org = await Org.findById(orgId).select('_id isActive').lean()
    if (!org) throw ApiError.notFound('机构不存在')
    if (org.isActive === false) {
      throw ApiError.forbidden('该机构已被停用, 无法操作')
    }

    const rel = await UserOrgRel.findOne({ user: req.user.id, org: orgId })
      .select('_id')
      .lean()
    if (!rel) {
      throw ApiError.forbidden('您不属于该机构')
    }

    req.orgId = String(orgId)
    req.orgIsActive = true
    next()
  } catch (e) {
    next(e)
  }
}
