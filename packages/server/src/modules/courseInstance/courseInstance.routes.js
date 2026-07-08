'use strict'

const router = require('express').Router()
const c = require('./courseInstance.controller')
const v = require('./courseInstance.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-1100 GET /course-instances
router.get('/', mws.requirePermission('courseInstance.read'), asyncHandler(c.list))
// R-1101 GET /course-instances/:id
router.get('/:id', mws.requirePermission('courseInstance.read'), asyncHandler(c.detail))
// R-1101A GET /course-instances/:id/me — C 端开班详情,跳过 courseInstance.read 权限码,只校验 activeStudent 是报名学生
//   2026-07-04 立项: C 端开班详情页 [packages/client/src/pages/course/instance-detail.vue] 之前调 courseInstanceApi.detail 要 courseInstance.read 权限码 → 403
//   按 [memory: c-end-me-endpoint-pattern] 范式加 me 端点: 跳过 requirePermission, mws.activeStudent 自动校验 activeStudent 是该开班报名学生 (含 enrolled/withdrawn/completed,允许回看)
//   必须放在 '/:id/removable-check' 之前 (虽然 prefix 不同不冲突,显式排序更安全)
router.get('/:id/me', mws.activeStudent, asyncHandler(c.forClientStudent))
// R-1102 POST /course-instances
router.post('/', mws.requirePermission('courseInstance.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-1103 PUT /course-instances/:id
router.put('/:id', mws.requirePermission('courseInstance.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 状态变更：cancelled 仅超管，其他状态需要 write；service 层做精细控制
// R-1113 PUT /course-instances/:id/status
router.put('/:id/status', mws.requirePermission('courseInstance.write'), v.setStatus, mws.validateRequest, asyncHandler(c.setStatus))
// 软删:超管 + 二次密码;状态(planning/cancelled)与业务互锁在 service 层校验。
// R-1104 DELETE /course-instances/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// 预检:只读,业务岗(.read 权限)可看阻挡原因;不做删除。
// R-1105 GET /course-instances/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('courseInstance.read'), asyncHandler(c.removableCheck))
// 2026-07-08: 取消归档 (recover) — 把软删的开班恢复, 仍需超管+密码 (高风险)
// R-1106 POST /course-instances/:id/recover
router.post('/:id/recover', mws.requirePlatformPassword, asyncHandler(c.recover))

module.exports = router
