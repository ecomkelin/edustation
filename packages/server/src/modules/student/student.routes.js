'use strict'

const router = require('express').Router()
const c = require('./student.controller')
const v = require('./student.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-0472 GET /students/me
router.get('/me', asyncHandler(c.me))
// R-0473 GET /students/me/stats
// 2026-07-05: 家长查自己孩子的 stat 聚合 (剩余课时 / 积分 / 近 7 天课程数) — 跨 kid 一次性返, 避免逐一调 activeStudent 端点
router.get('/me/stats', asyncHandler(c.myStats))
// R-0474 GET /students/me/profile
// 2026-07-11: 家长查自己孩子的学习画像 (C 端首页 / 学习画像页用)
//   - 跳过 requirePermission, activeStudent 中间件校验 "x-active-student-id 是否属于 req.user 监护人"
//   - 解决: 家长 Position 移除 student.read 后, /students/:id/profile 403
router.get('/me/profile', mws.activeStudent, asyncHandler(c.myProfile))
// R-0400 GET /students
router.get('/', mws.requirePermission('student.read'), asyncHandler(c.list))
// R-0401 GET /students/:id
router.get('/:id', mws.requirePermission('student.read'), asyncHandler(c.detail))
// 学生学习画像 (2026-06 新增) — 6 字段结构化画像, 与 notes (过敏史) 完全独立
// R-0406 GET /students/:id/profile
router.get('/:id/profile', mws.requirePermission('student.read'), v.idParam, mws.validateRequest, asyncHandler(c.getProfile))
// R-0407 PUT /students/:id/profile
router.put('/:id/profile', mws.requirePermission('student.write'), v.idParam, v.setProfile, mws.validateRequest, asyncHandler(c.setProfile))
// R-0402 POST /students
router.post('/', mws.requirePermission('student.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-0403 PUT /students/:id
router.put('/:id', mws.requirePermission('student.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// R-0404 DELETE /students/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// R-0405 GET /students/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('student.read'), asyncHandler(c.removableCheck))
// 黑名单: 仅超管可操作（不叠加 student.write,避免教务误触）
// R-0410 PUT /students/:id/block
router.put('/:id/block', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
// R-0411 PUT /students/:id/unblock
router.put('/:id/unblock', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
// 误操作修复: 重绑监护人仅超管（service.create 流程不走 HTTP,不影响创建学员）
// R-0414 PUT /students/:id/guardians
router.put('/:id/guardians', mws.requirePlatformAdmin, v.setGuardians, mws.validateRequest, asyncHandler(c.setGuardians))

// === 学生详情页 (2026-08-07 新增) ===
// R-0408 GET /students/:id/overview
//   一次返 档案 + 监护人 + 学习画像 + 家长沟通画像 + 各域计数
//   越权 (学员不属于当前 org) → 404 (与 R-0401 详情 404 口径一致, 防 IDOR 枚举)
router.get('/:id/overview', mws.requirePermission('student.read'), asyncHandler(c.overview))
// R-0409 GET /students/:id/related/:domain
//   domain ∈ enrollments / lessonAttendances / studentProducts / orders /
//             works / pointsTransactions / petEvents
//   分页返 {items,total,page,pageSize}; 未知 domain 返 400
//   注意: /:id/related/:domain (3 段) 与 /:id (1 段) 不冲突, 不必担心顺序
router.get('/:id/related/:domain', mws.requirePermission('student.read'), asyncHandler(c.related))

module.exports = router
