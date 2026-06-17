'use strict'

const router = require('express').Router()
const c = require('./captcha.controller')
const asyncHandler = require('@utils/asyncHandler')

// 挑战: 前端调用拿到 SVG + token
router.get('/challenge', asyncHandler(c.issue))
// 校验: 前端拖完提交答案
router.post('/verify', asyncHandler(c.verify))

module.exports = router
