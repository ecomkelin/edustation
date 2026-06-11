'use strict'

const router = require('express').Router()
const c = require('./points.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg, mws.activeStudent)

router.get('/me', asyncHandler(c.me))
router.post('/earn', asyncHandler(c.earn)) // stub
router.get('/transactions', asyncHandler(c.transactions))

module.exports = router
