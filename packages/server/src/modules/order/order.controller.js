'use strict'

const s = require('./order.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.create = async (req, res) => {
  // 新结构：{ student, items: [{ courseProduct, quantity }], actualPrice, paymentMethod, paidAmount, remark }
  // - 仅传 items  → 创建 pending 订单（客户端下单 / 家长端未来使用）
  // - 同时传 paymentMethod + paidAmount → 员工线下收款一气呵成，原子地标 paid 并创建 StudentProduct
  res.status(201).json(ApiResponse.created(await s.create({ orgId: req.orgId, ...req.body })))
}
exports.pay = async (req, res) => res.json(ApiResponse.ok(await s.pay({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.cancel = async (req, res) => res.json(ApiResponse.ok(await s.cancel({ id: req.params.id, orgId: req.orgId, ...req.body })))
