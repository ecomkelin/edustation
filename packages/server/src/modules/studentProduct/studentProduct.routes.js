'use strict'

const router = require('express').Router()
const c = require('./studentProduct.controller')
const v = require('./studentProduct.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// C 端家长：/student-products/me — 仅认证 + 机构 + active student
// 不走 requirePermission（家长无员工权限码；activeStudent middleware 已经校验是监护人）
// 注意：/me 必须定义在 /:id 之前，否则会被 :id 路由吞掉
router.use(mws.activeStudent)
// R-2079 GET /student-products/me (C 端"我的课包")
router.get('/me', asyncHandler(c.mine))

// 只读列表/详情/剩余课时 (业务端)
// R-1800 GET /student-products
router.get('/', mws.requirePermission('studentProduct.read'), asyncHandler(c.list))
// R-1801 GET /student-products/:id
router.get('/:id', mws.requirePermission('studentProduct.read'), asyncHandler(c.detail))
// R-1806 GET /student-products/:id/remaining
router.get('/:id/remaining', mws.requirePermission('studentProduct.read'), asyncHandler(c.remaining))

// 赠课：员工直接创建 StudentProduct（不走订单；需要 studentProduct.gift 权限）
// 注意：必须放在 /:id 之前，否则会被 :id 路由吞掉
// R-1869 POST /student-products/gift
router.post(
  '/gift',
  mws.requirePermission('studentProduct.gift'),
  v.gift,
  mws.validateRequest,
  asyncHandler(c.gift)
)

// 物理删除：超管+密码二次确认；互锁由 service.remove 内检查 LessonAttendance/CourseEnrollment 引用
// R-1804 DELETE /student-products/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// 预检：业务岗即可查询，删除按钮触发前先弹挡板说明
// R-1805 GET /student-products/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('studentProduct.read'), asyncHandler(c.removableCheck))

module.exports = router
