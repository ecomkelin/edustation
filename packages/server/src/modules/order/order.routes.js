'use strict'

const router = require('express').Router()
const c = require('./order.controller')
const v = require('./order.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-1700 GET /orders
router.get('/', mws.requirePermission('order.read'), asyncHandler(c.list))
// R-1701 GET /orders/:id
router.get('/:id', mws.requirePermission('order.read'), asyncHandler(c.detail))
// R-1702 POST /orders
router.post('/', mws.requirePermission('order.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-1721 POST /orders/:id/pay
router.post('/:id/pay', mws.requirePermission('order.pay'), v.pay, mws.validateRequest, asyncHandler(c.pay))
// 退款 (R-1722 2026-06-25 立项): 部分退款支持; 复用 order.pay 权限码 (label "收款 / 退款")
// 联动 StudentProduct 软停用; 累计退完自动转 refunded
router.post('/:id/refund', mws.requirePermission('order.pay'), v.refund, mws.validateRequest, asyncHandler(c.refund))
// R-1723 POST /orders/:id/cancel
router.post('/:id/cancel', mws.requirePermission('order.write'), v.cancel, mws.validateRequest, asyncHandler(c.cancel))

// 物理删除：超管+密码二次确认；互锁由 service.remove 内检查 StudentProduct.order 引用
// R-1704 DELETE /orders/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// 预检：业务岗即可查询，删除按钮触发前先弹挡板说明
// R-1705 GET /orders/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('order.read'), asyncHandler(c.removableCheck))

module.exports = router
