'use strict'

const router = require('express').Router()
const c = require('./notification.controller')
const v = require('./notification.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 公共：身份 + 机构上下文（activeStudent 在 /me 路由单独挂）
router.use(mws.authenticate, mws.requireOrg)

// ─── C 端 /me（家长，跳过 requirePermission，仅 activeStudent 校验）───
// 2026-07-13: 拆 /me (家长 + activeStudent) 与 /me/staff (员工, 无 activeStudent) —
//   之前两个都挂在 /me 上, 员工读 /me 依赖"客户端不传 x-active-student-id"的隐含契约,
//   一旦前端顺手带 header 立刻被 activeStudent 403. 拆开彻底分流.
const parentMeRouter = require('express').Router()
parentMeRouter.use(mws.activeStudent)

// R-3602 GET /api/v1/notifications/me
parentMeRouter.get('/', v.listMe, asyncHandler(c.listMe))
// R-3603 GET /api/v1/notifications/me/unread-count
parentMeRouter.get('/unread-count', v.unreadCount, asyncHandler(c.unreadCount))
// R-3605 POST /api/v1/notifications/me/read-all
parentMeRouter.post('/read-all', asyncHandler(c.markAllRead))
// R-3607 POST /api/v1/notifications/me/archive-all
parentMeRouter.post('/archive-all', asyncHandler(c.archiveAll))
// R-3608 GET /api/v1/notifications/me/preferences
parentMeRouter.get('/preferences', asyncHandler(c.getPreferences))
// R-3609 PUT /api/v1/notifications/me/preferences
parentMeRouter.put('/preferences', v.updatePreferences, asyncHandler(c.updatePreferences))

router.use('/me', parentMeRouter)

// ─── 员工 /me/staff (2026-07-13 新增) ────────────────────
// 员工侧 inbox, 不挂 activeStudent (员工没有 activeStudentId 概念);
// controller listMe/unreadCount/markAllRead/archiveAll 内部按 recipient=userId 直接查,
// 天然不依赖 activeStudentId, 直接复用即可.
const staffMeRouter = require('express').Router()
// R-4013 GET /api/v1/notifications/me/staff — 员工 inbox 列表
staffMeRouter.get('/', v.listMe, asyncHandler(c.listMe))
// R-3614 GET /api/v1/notifications/me/staff/unread-count — 员工红点
staffMeRouter.get('/unread-count', v.unreadCount, asyncHandler(c.unreadCount))
// R-3615 POST /api/v1/notifications/me/staff/read-all — 员工一键已读
staffMeRouter.post('/read-all', asyncHandler(c.markAllRead))
// R-3616 POST /api/v1/notifications/me/staff/archive-all — 员工一键归档
staffMeRouter.post('/archive-all', asyncHandler(c.archiveAll))

router.use('/me/staff', staffMeRouter)

// ─── 管理后台 / 内部接口（要求 notification.* 权限码） ───
// 注意路由顺序：具体路径 (/publish, /templates, /admin/logs) 必须在 /:id 之前声明，
// 否则 GET /notifications/templates 会被 /:id 抢先匹配 → CastError('_id') 400。
// R-3601 POST /api/v1/notifications/publish —— 内部发布
router.post(
  '/publish',
  mws.requirePermission('notification.send'),
  v.publish,
  asyncHandler(c.publish)
)
// R-3610 GET /api/v1/notifications/templates
router.get(
  '/templates',
  mws.requirePermission('notification.read'),
  asyncHandler(c.listTemplates)
)
// R-3611 PUT /api/v1/notifications/templates/:type/:channel
router.put(
  '/templates/:type/:channel',
  mws.requirePermission('notification.write'),
  v.upsertTemplate,
  asyncHandler(c.upsertTemplate)
)
// R-4017 DELETE /api/v1/notifications/templates/:type/:channel
// 2026-07-14 新增: 机构自定义 → 重置为平台默认 (幂等, 不存在不报错)
router.delete(
  '/templates/:type/:channel',
  mws.requirePermission('notification.write'),
  v.removeTemplate,
  asyncHandler(c.removeTemplate)
)
// R-4018 POST /api/v1/notifications/templates/reset-all
// 2026-07-14 新增: 批量重置 — 一次性清空本机构所有 org 自定义模板
//   注意: 路由放 /templates/reset-all 而不是 /templates (避免与 templates listTemplates 路径冲突)
router.post(
  '/templates/reset-all',
  mws.requirePermission('notification.write'),
  asyncHandler(c.resetOrgTemplates)
)
// R-4020 PUT /api/v1/notifications/templates/platform/:type/:channel
// 2026-07-18 新增: 平台超管专属 — toggle/编辑平台默认模板 (影响所有用平台默认的机构)
// 放 templates/platform/ 段, 避免与 /templates/:type/:channel 的 :type 段冲突
router.put(
  '/templates/platform/:type/:channel',
  mws.requirePlatformAdmin,
  v.upsertTemplate,
  asyncHandler(c.upsertPlatformTemplate)
)
// R-3612 GET /api/v1/notifications/admin/logs
router.get(
  '/admin/logs',
  mws.requirePermission('notification.read'),
  v.listLogs,
  asyncHandler(c.listLogs)
)

// ─── 单条操作（家长 / 员工共用，按 :id 校验属主） ───
// 必须放在最后：/:id 是单段通配, 会抢在 /templates (单段具体) 之前匹配 → CastError 400.
// R-4019 GET /api/v1/notifications/:id —— 单条详情（C 端 / admin 详情页共用）
router.get('/:id', v.byId, asyncHandler(c.getOne))
// R-3604 POST /api/v1/notifications/:id/read
router.post('/:id/read', v.byId, asyncHandler(c.markRead))
// R-3606 POST /api/v1/notifications/:id/archive
router.post('/:id/archive', v.byId, asyncHandler(c.archive))

module.exports = router