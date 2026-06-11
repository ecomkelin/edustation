'use strict'

const s = require('./studentProduct.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.remaining = async (req, res) => res.json(ApiResponse.ok(await s.remaining(req.params.id, req.orgId)))

/**
 * 赠课：员工直接为学生创建一个 StudentProduct（source='gift'）。
 * 必须在路由层校验 studentProduct.gift 权限。
 */
exports.gift = async (req, res) => {
  res.status(201).json(ApiResponse.created(await s.gift({
    orgId: req.orgId,
    operatorId: req.user && req.user.id,
    ...req.body
  })))
}
