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
// R-1723 POST /orders/:id/cancel
router.post('/:id/cancel', mws.requirePermission('order.write'), v.cancel, mws.validateRequest, asyncHandler(c.cancel))

module.exports = router
