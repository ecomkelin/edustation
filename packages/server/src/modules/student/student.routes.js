'use strict'

const router = require('express').Router()
const c = require('./student.controller')
const v = require('./student.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/me', asyncHandler(c.me))
router.get('/', mws.requirePermission('student.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('student.read'), asyncHandler(c.detail))
// 学生学习画像 (2026-06 新增) — 6 字段结构化画像, 与 notes (过敏史) 完全独立
router.get('/:id/profile', mws.requirePermission('student.read'), v.idParam, mws.validateRequest, asyncHandler(c.getProfile))
router.put('/:id/profile', mws.requirePermission('student.write'), v.idParam, v.setProfile, mws.validateRequest, asyncHandler(c.setProfile))
router.post('/', mws.requirePermission('student.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('student.write'), v.update, mws.validateRequest, asyncHandler(c.update))
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
router.get('/:id/removable-check', mws.requirePermission('student.read'), asyncHandler(c.removableCheck))
// 黑名单: 仅超管可操作（不叠加 student.write,避免教务误触）
router.put('/:id/block', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
router.put('/:id/unblock', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
// 误操作修复: 重绑监护人仅超管（service.create 流程不走 HTTP,不影响创建学员）
router.put('/:id/guardians', mws.requirePlatformAdmin, v.setGuardians, mws.validateRequest, asyncHandler(c.setGuardians))

module.exports = router
