'use strict'

const router = require('express').Router()
const c = require('./courseInstance.controller')
const v = require('./courseInstance.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('courseInstance.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('courseInstance.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('courseInstance.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('courseInstance.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 状态变更：cancelled 仅超管，其他状态需要 write；service 层做精细控制
router.put('/:id/status', mws.requirePermission('courseInstance.write'), v.setStatus, mws.validateRequest, asyncHandler(c.setStatus))
// 软删：仅超管（requirePermission 对超管直接放行，所以 courseInstance.delete
// 实际只有超管能拥有；机构岗位不会持有此码）。状态限制（planning/cancelled）在 service 层校验。
router.delete('/:id', mws.requirePermission('courseInstance.delete'), asyncHandler(c.remove))

module.exports = router
