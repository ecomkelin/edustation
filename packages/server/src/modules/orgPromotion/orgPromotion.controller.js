'use strict'

const s = require('./orgPromotion.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 注意: 路由是 org.routes.js 挂的 `/:id/promotion`, mergeParams: true 把外层 :id
 * 合并到 req.params。所以这里从 req.params.id 取值 (不是 req.params.orgId)。
 */
exports.get = async (req, res) => {
  const data = await s.get(req.params.id)
  res.json(ApiResponse.ok(data))
}

exports.update = async (req, res) => {
  // fileBindOrgId: 上传图片时的源 org (req.orgId), 走 fileBind 跨租户校验
  // (与 org.service.update 同一约定, 见该 service 注释)
  const data = await s.update(req.params.id, req.body, { fileBindOrgId: req.orgId })
  res.json(ApiResponse.ok(data))
}
