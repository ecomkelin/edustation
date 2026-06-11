'use strict'

const router = require('express').Router()
const c = require('./pet.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg, mws.activeStudent)

router.get('/me', asyncHandler(c.me))
router.post('/feed', asyncHandler(c.feed)) // stub

module.exports = router
