'use strict'

const router = require('express').Router()
const c = require('./auth.controller')
const v = require('./auth.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.post('/login', v.loginVD, mws.validateRequest, asyncHandler(c.login))
router.post('/refresh', asyncHandler(c.refresh))
router.post('/logout', mws.authenticate, asyncHandler(c.logout))
router.get('/me', mws.authenticate, asyncHandler(c.me))

module.exports = router
