'use strict'

const router = require('express').Router()
const c = require('./studentProduct.controller')
const v = require('./studentProduct.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// 只读列表/详情/剩余课时
router.get('/', mws.requirePermission('studentProduct.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('studentProduct.read'), asyncHandler(c.detail))
router.get('/:id/remaining', mws.requirePermission('studentProduct.read'), asyncHandler(c.remaining))

// 赠课：员工直接创建 StudentProduct（不走订单；需要 studentProduct.gift 权限）
// 注意：必须放在 /:id 之前，否则会被 :id 路由吞掉
router.post(
  '/gift',
  mws.requirePermission('studentProduct.gift'),
  v.gift,
  mws.validateRequest,
  asyncHandler(c.gift)
)

module.exports = router
