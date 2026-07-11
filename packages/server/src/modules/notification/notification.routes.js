'use strict'

const router = require('express').Router()
const c = require('./notification.controller')
const v = require('./notification.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 公共：身份 + 机构上下文（activeStudent 在 /me 路由单独挂）
router.use(mws.authenticate, mws.requireOrg)

// ─── C 端 /me（跳过 requirePermission，仅 activeStudent 校验）───
router.use('/me', mws.activeStudent)

// R-3602 GET /api/v1/notifications/me
router.get('/me', v.listMe, asyncHandler(c.listMe))
// R-3603 GET /api/v1/notifications/me/unread-count
router.get('/me/unread-count', v.unreadCount, asyncHandler(c.unreadCount))
// R-3605 POST /api/v1/notifications/me/read-all
router.post('/me/read-all', asyncHandler(c.markAllRead))
// R-3607 POST /api/v1/notifications/me/archive-all
router.post('/me/archive-all', asyncHandler(c.archiveAll))
// R-3608 GET /api/v1/notifications/me/preferences
router.get('/me/preferences', asyncHandler(c.getPreferences))
// R-3609 PUT /api/v1/notifications/me/preferences
router.put('/me/preferences', v.updatePreferences, asyncHandler(c.updatePreferences))

// ─── C 端 单条操作（按 :id 校验属主） ───
// R-3604 POST /api/v1/notifications/:id/read
router.post('/:id/read', v.byId, asyncHandler(c.markRead))
// R-3606 POST /api/v1/notifications/:id/archive
router.post('/:id/archive', v.byId, asyncHandler(c.archive))

// ─── 管理后台 / 内部接口（要求 notification.* 权限码） ───
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
// R-3612 GET /api/v1/notifications/admin/logs
router.get(
  '/admin/logs',
  mws.requirePermission('notification.read'),
  v.listLogs,
  asyncHandler(c.listLogs)
)

module.exports = router