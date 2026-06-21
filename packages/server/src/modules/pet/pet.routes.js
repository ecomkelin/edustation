'use strict'

/**
 * Pet Routes（2026-06-21 pet-system-v2 完整版）
 *
 * C 端（家长）：
 *   - 中间件链：authenticate → requireOrg → activeStudent → requireEnrolledStudent
 *   - 不需要业务权限码（C 端走 guardian 校验）
 *
 * 端点清单见 pet.controller.js 与 plan §7.1
 */

const router = require('express').Router()
const c = require('./pet.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// C 端：先拉一次 PetAccount（懒创建兜底），不强制 requireEnrolledStudent
// （家长首次进来没有 active student 时也能调用 GET /pet/me?student=xxx 自己创建）
router.use(mws.authenticate, mws.requireOrg, mws.activeStudent)

// GET 端点：不要求 enrolled（懒创建即可）
router.get('/me', asyncHandler(c.me))
router.get('/species', asyncHandler(c.species))
router.get('/items', asyncHandler(c.items))
router.get('/events', asyncHandler(c.events))

// 写端点：必须 enrolled（按 D8 决策，未报班不能领养/喂养/换装）
router.use(mws.requireEnrolledStudent)
router.post('/adopt', asyncHandler(c.adopt))
router.post('/hatch', asyncHandler(c.hatch))
router.post('/feed', asyncHandler(c.feed))
router.post('/swap-egg', asyncHandler(c.swapEgg))
router.post('/tier-down', asyncHandler(c.tierDown))
router.post('/equip', asyncHandler(c.equip))

module.exports = router
