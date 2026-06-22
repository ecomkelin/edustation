'use strict'

const router = require('express').Router()
const c = require('./points.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg, mws.activeStudent)

// R-2072 GET /points/me
router.get('/me', asyncHandler(c.me))
// R-2060 POST /points/earn
router.post('/earn', asyncHandler(c.earn)) // stub
// R-2000 GET /points/transactions
router.get('/transactions', asyncHandler(c.transactions))

module.exports = router
