'use strict'

const router = require('express').Router()
const c = require('./room.controller')
const v = require('./room.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('room.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('room.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('room.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('room.write'), v.update, mws.validateRequest, asyncHandler(c.update))
router.delete('/:id', mws.requirePermission('room.write'), asyncHandler(c.remove))

module.exports = router
