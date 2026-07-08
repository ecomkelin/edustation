'use strict'

/**
 * 任务模块路由 (2026-07-08 立项)
 *
 * 路由编号: R-3900 ~ R-3919 (MM=39, 任务模块)
 *   端点与权限码映射见 api.desc.md
 *
 * §8.1 物理删除防护 (2026-07-08 调整, 工作流类弱化):
 *   - DELETE /tasks/:id → requirePermission('task.delete') + requireBodyPassword
 *     业务侧 service.remove 再校验: 平台超管 OR 任务 creator 本人
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

// 2026-07-08: 归档 / 取消归档 (软隐藏, 复用 task.delete 权限; 与物理删除互为补充)
// R-3920 POST /tasks/:id/archive
router.post('/:id/archive', mws.requirePermission('task.delete'), asyncHandler(c.archive))
// R-3921 POST /tasks/:id/unarchive
router.post('/:id/unarchive', mws.requirePermission('task.delete'), asyncHandler(c.unarchive))

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
// R-3922 DELETE /tasks/:id/items/:itemId (2026-07-08: 配合 task 物理删除挡板, 让用户清空 checklist 后能删任务)
router.delete('/:id/items/:itemId', mws.requirePermission('task.write'), asyncHandler(c.removeItem))

// ─── 评论 ────────────────────────────────────

// R-3910 POST /tasks/:id/comments
router.post('/:id/comments', mws.requirePermission('task.read'), v.addComment, mws.validateRequest, asyncHandler(c.addComment))

// ─── 写操作 (主体) ────────────────────────────

// R-3900 POST /tasks
router.post('/', mws.requirePermission('task.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-3903 PATCH /tasks/:id
router.patch('/:id', mws.requirePermission('task.write'), v.update, mws.validateRequest, asyncHandler(c.update))

// ─── §8.1 物理删除防护 (2026-07-08 调整) ────────
//
// 任务 (Task) 是工作流类实体, 不同于核心业务实体 (Org/CourseProduct/Room):
//   - 任务的子表 (TaskItem/Review/Comment) 都是任务自己生成的, 物理删除即级联
//   - 任务创建者 (creator) 对自己创建的工作流应有终决权
//   - §0 开发阶段可重写, 不必向旧 requirePlatformPassword 模型兼容
//
// 因此: 平台超管 (isPlatformAdmin) OR 任务 creator + 持 task.delete 权限 + 输密码
//
// 与 requirePlatformPassword 的区别:
//   - requirePlatformPassword: 仅限 isPlatformAdmin, 用于跨机构核心实体
//   - requireBodyPassword:     不限超管, 任意登录用户 + 输对自身密码即可
//                             (再由 service.remove 校验"creator / 平台超管")
//
// R-3904 DELETE /tasks/:id  →  requirePermission('task.delete') + requireBodyPassword
router.delete('/:id', mws.requirePermission('task.delete'), mws.requireBodyPassword, asyncHandler(c.remove))

module.exports = router