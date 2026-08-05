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
// 2026-07-11: OR(task.read, task.read.own) — task.read.own 持有者 (普通员工) 也能进任务模块看自己的
router.get('/stats', mws.requirePermission('task.read', 'task.read.own'), asyncHandler(c.stats))

// ─── 可派任务员工下拉 ─────────────────────────
// R-3924 GET /tasks/assignable-users
// 顺序要求: 必须在 /:id 之前 (单段通配会抢先命中 → CastError)
// 2026-08-02: 建任务页原来打 GET /users (要 user.read), 「财务」岗只有 task.write → 403 空下拉;
//   这里只返 {id, realName, positions[]}, 用 task 自己的权限码守门, 不下放用户档案读权限
router.get('/assignable-users', mws.requirePermission('task.read', 'task.read.own'), asyncHandler(c.assignableUsers))

// ─── 看板 ─────────────────────────────────────
// R-3913 GET /tasks/kanban
// 顺序要求: 必须在 /:id 之前
// 2026-07-11: 同上, OR 任一即可进入看板
router.get('/kanban', mws.requirePermission('task.read', 'task.read.own'), v.kanban, mws.validateRequest, asyncHandler(c.kanban))

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
// 2026-08-05: 加 requireBodyPassword (审计 H10) — 模板也是强引用下游 (Task.fromTemplate / TaskGenerationLog.template),
//   物理删除需业务岗二次密码确认; 与 R-3904 /tasks/:id delete 弱化范式对齐.
router.delete('/templates/:id', mws.requirePermission('task.delete'), mws.requireBodyPassword, asyncHandler(c.templateRemove))
// R-3917 配套: 模板删除预检端点 (普通 task.read 权限即可调, 弹挡板用)
router.get('/templates/:id/removable-check', mws.requirePermission('task.read'), asyncHandler(c.templateRemovableCheck))

// ─── 任务列表 / 详情 / 预检 ────────────────────

// R-3901 GET /tasks
// 2026-07-11: OR(task.read, task.read.own) — task.read.own 持有者 (普通员工) 也能进任务列表看自己的
router.get('/', mws.requirePermission('task.read', 'task.read.own'), v.list, mws.validateRequest, asyncHandler(c.list))
// R-3902 GET /tasks/:id
// 2026-07-11: 同上, task.read.own 持有者能查看自己相关任务的详情
router.get('/:id', mws.requirePermission('task.read', 'task.read.own'), asyncHandler(c.detail))
// R-3911 GET /tasks/:id/removable-check
// 2026-07-11: 同上, 普通员工也要能对自己创建的任务做删除预检
router.get('/:id/removable-check', mws.requirePermission('task.read', 'task.read.own'), asyncHandler(c.removableCheck))

// 2026-07-08: 归档 / 取消归档 (软隐藏, 复用 task.delete 权限; 与物理删除互为补充)
// R-3920 POST /tasks/:id/archive
router.post('/:id/archive', mws.requirePermission('task.delete'), asyncHandler(c.archive))
// R-3921 POST /tasks/:id/unarchive
router.post('/:id/unarchive', mws.requirePermission('task.delete'), asyncHandler(c.unarchive))

// ─── 状态机端点 (子操作) ─────────────────────

// R-3905 POST /tasks/:id/submit
// 2026-07-11: 提交完成是执行人操作, OR(task.read, task.read.own)
router.post('/:id/submit', mws.requirePermission('task.read', 'task.read.own'), asyncHandler(c.submit))
// R-3906 POST /tasks/:id/review
router.post('/:id/review', mws.requirePermission('task.review'), v.review, mws.validateRequest, asyncHandler(c.review))
// R-3907 POST /tasks/:id/cancel
router.post('/:id/cancel', mws.requirePermission('task.write'), v.cancel, mws.validateRequest, asyncHandler(c.cancel))

// ─── 条目 ────────────────────────────────────

// R-3908 POST /tasks/:id/items
router.post('/:id/items', mws.requirePermission('task.write'), v.addItem, mws.validateRequest, asyncHandler(c.addItem))
// R-3909 PATCH /tasks/:id/items/:itemId
// 2026-07-11: 勾选子任务是执行人操作, OR(task.read, task.read.own)
router.patch('/:id/items/:itemId', mws.requirePermission('task.read', 'task.read.own'), v.toggleItem, mws.validateRequest, asyncHandler(c.toggleItem))
// R-3922 DELETE /tasks/:id/items/:itemId (2026-07-08: 配合 task 物理删除挡板, 让用户清空 checklist 后能删任务)
router.delete('/:id/items/:itemId', mws.requirePermission('task.write'), asyncHandler(c.removeItem))

// R-3923 POST /tasks/:id/items/:itemId/remarks (2026-07-09: 规则 3b — 子任务备注, 豁免执行中锁)
//   跟 toggleItem 同权限: task.read OR task.read.own (执行人本身就有 task.read.own)
//   service 内额外校验 item.assignee 本人或 task.write
router.post('/:id/items/:itemId/remarks', mws.requirePermission('task.read', 'task.read.own'), v.addItemRemark, mws.validateRequest, asyncHandler(c.addItemRemark))

// ─── 评论 ────────────────────────────────────

// R-3910 POST /tasks/:id/comments
// 2026-07-11: 评论是任何能看到任务的人都能发, OR(task.read, task.read.own)
router.post('/:id/comments', mws.requirePermission('task.read', 'task.read.own'), v.addComment, mws.validateRequest, asyncHandler(c.addComment))

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