'use strict'

/**
 * 任务模块路由 (2026-07-08 立项)
 *
 * 路由编号: R-3900 ~ R-3919 (MM=39, 任务模块)
 *   端点与权限码映射见 api.desc.md
 *
 * §8.1 物理删除防护:
 *   - DELETE /tasks/:id → requirePlatformPassword (超管+密码)
 *   - GET /tasks/:id/removable-check → requirePermission('task.read') 普通岗
 */

const router = require('express').Router()
const c = require('./task.controller')
const v = require('./task.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// ─── 我的统计 (列表页顶部用) ─────────────────────
// R-3912 GET /tasks/stats
router.get('/stats', mws.requirePermission('task.read'), asyncHandler(c.stats))

// ─── 看板 ─────────────────────────────────────
// R-3913 GET /tasks/kanban
// 顺序要求: 必须在 /:id 之前
router.get('/kanban', mws.requirePermission('task.read'), v.kanban, mws.validateRequest, asyncHandler(c.kanban))

// ─── 模板 ─────────────────────────────────────
// 顺序要求: 必须在 /:id 之前

// R-3914 POST /tasks/templates
router.post('/templates', mws.requirePermission('task.write'), v.templateCreate, mws.validateRequest, asyncHandler(c.templateCreate))
// R-3915 GET /tasks/templates
router.get('/templates', mws.requirePermission('task.read'), asyncHandler(c.templateList))
// R-3919 POST /tasks/templates/:id/pause
router.post('/templates/:id/pause', mws.requirePermission('task.write'), asyncHandler(c.templatePause))
// R-3919 POST /tasks/templates/:id/resume
router.post('/templates/:id/resume', mws.requirePermission('task.write'), asyncHandler(c.templateResume))
// R-3918 POST /tasks/templates/:id/run-now
router.post('/templates/:id/run-now', mws.requirePermission('task.write'), asyncHandler(c.templateRunNow))
// R-3916 PATCH /tasks/templates/:id
router.patch('/templates/:id', mws.requirePermission('task.write'), v.templateUpdate, mws.validateRequest, asyncHandler(c.templateUpdate))
// R-3917 DELETE /tasks/templates/:id
router.delete('/templates/:id', mws.requirePermission('task.delete'), asyncHandler(c.templateRemove))

// ─── 任务列表 / 详情 / 预检 ────────────────────

// R-3901 GET /tasks
router.get('/', mws.requirePermission('task.read'), v.list, mws.validateRequest, asyncHandler(c.list))
// R-3902 GET /tasks/:id
router.get('/:id', mws.requirePermission('task.read'), asyncHandler(c.detail))
// R-3911 GET /tasks/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('task.read'), asyncHandler(c.removableCheck))

// ─── 状态机端点 (子操作) ─────────────────────

// R-3905 POST /tasks/:id/submit
router.post('/:id/submit', mws.requirePermission('task.read'), asyncHandler(c.submit))
// R-3906 POST /tasks/:id/review
router.post('/:id/review', mws.requirePermission('task.review'), v.review, mws.validateRequest, asyncHandler(c.review))
// R-3907 POST /tasks/:id/cancel
router.post('/:id/cancel', mws.requirePermission('task.write'), v.cancel, mws.validateRequest, asyncHandler(c.cancel))

// ─── 条目 ────────────────────────────────────

// R-3908 POST /tasks/:id/items
router.post('/:id/items', mws.requirePermission('task.write'), v.addItem, mws.validateRequest, asyncHandler(c.addItem))
// R-3909 PATCH /tasks/:id/items/:itemId
router.patch('/:id/items/:itemId', mws.requirePermission('task.read'), v.toggleItem, mws.validateRequest, asyncHandler(c.toggleItem))

// ─── 评论 ────────────────────────────────────

// R-3910 POST /tasks/:id/comments
router.post('/:id/comments', mws.requirePermission('task.read'), v.addComment, mws.validateRequest, asyncHandler(c.addComment))

// ─── 写操作 (主体) ────────────────────────────

// R-3900 POST /tasks
router.post('/', mws.requirePermission('task.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-3903 PATCH /tasks/:id
router.patch('/:id', mws.requirePermission('task.write'), v.update, mws.validateRequest, asyncHandler(c.update))

// ─── §8.1 物理删除防护 ─────────────────────

// R-3904 DELETE /tasks/:id  →  requirePlatformPassword
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router