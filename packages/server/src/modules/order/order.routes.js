'use strict'

const router = require('express').Router()
const c = require('./order.controller')
const v = require('./order.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('order.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('order.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('order.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.post('/:id/pay', mws.requirePermission('order.pay'), v.pay, mws.validateRequest, asyncHandler(c.pay))
router.post('/:id/cancel', mws.requirePermission('order.write'), v.cancel, mws.validateRequest, asyncHandler(c.cancel))

module.exports = router
