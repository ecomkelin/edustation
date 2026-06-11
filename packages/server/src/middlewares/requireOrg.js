'use strict'

const ApiError = require('@utils/ApiError')
const UserOrgRel = require('@models/UserOrgRel.model')

/**
 * 校验 x-org-id header；超管可跳过。
 * 挂载 req.orgId。
 */
module.exports = async function requireOrg(req, res, next) {
  try {
    if (req.user && req.user.isPlatformAdmin) {
      // 平台超管：x-org-id 可选；如有则校验存在
      const orgId = req.headers['x-org-id']
      if (orgId) {
        const Org = require('@models/Org.model')
        const org = await Org.findById(orgId).select('_id').lean()
        if (!org) throw ApiError.notFound('机构不存在')
        req.orgId = String(org._id)
      } else {
        req.orgId = null
      }
      return next()
    }

    const orgId = req.headers['x-org-id']
    if (!orgId) {
      throw ApiError.badRequest('缺少 x-org-id header')
    }

    const rel = await UserOrgRel.findOne({ user: req.user.id, org: orgId })
      .select('_id')
      .lean()
    if (!rel) {
      throw ApiError.forbidden('您不属于该机构')
    }

    req.orgId = String(orgId)
    next()
  } catch (e) {
    next(e)
  }
}
