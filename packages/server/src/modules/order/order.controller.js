'use strict'

const s = require('./order.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))

// C 端 /orders/me (R-2078 2026-07-01): 当前 active child 的 Order
// 复用 service.list,强制 student=req.activeStudentId,避免越权
exports.mine = async (req, res) =>
  res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, student: req.activeStudentId, ...req.query })))
exports.create = async (req, res) => {
  // 新结构：{ student, items: [{ courseProduct, quantity }], actualPrice, paymentMethod, paidAmount, remark, agreements }
  // - 仅传 items  → 创建 pending 订单（客户端下单 / 家长端未来使用）
  // - 同时传 paymentMethod + paidAmount → 员工线下收款一气呵成，原子地标 paid 并创建 StudentProduct
  // - body.agreements 是协议同意快照, client 走"立即购买"流程时必带; 后台手动开单可不传
  res.status(201).json(ApiResponse.created(await s.create({
    orgId: req.orgId,
    actor: { userId: req.user.id, ip: req.ip, userAgent: req.get('user-agent') || '' },
    ...req.body
  })))
}
exports.pay = async (req, res) => res.json(ApiResponse.ok(await s.pay({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.cancel = async (req, res) => res.json(ApiResponse.ok(await s.cancel({ id: req.params.id, orgId: req.orgId, ...req.body })))
// 退款 (R-1722 2026-06-25 立项): 部分退款支持; 复用 order.pay 权限码 (label "收款 / 退款")
// 联动 StudentProduct 软停用; 累计退完自动转 refunded. 详见 order.service.refund
exports.refund = async (req, res) => res.json(ApiResponse.ok(await s.refund({
  id: req.params.id,
  orgId: req.orgId,
  amount: Number(req.body.amount),
  reason: req.body.reason,
  operator: { userId: req.user._id || req.user.id }
})))
// 物理删除：超管+密码二次确认（requirePlatformPassword 路由层）；互锁检查 StudentProduct.order
// 业务硬门挡 paid/refunded；详见 order.service.remove 与 utils/removable.assertUnused
exports.remove = async (req, res) =>
  res.json(ApiResponse.ok(await s.remove(req.params.id, req.orgId)))
// 删除预检：业务岗（order.read）即可查询，删除按钮触发前先弹挡板说明
exports.removableCheck = async (req, res) =>
  res.json(ApiResponse.ok(await s.removableCheck(req.params.id, req.orgId)))
