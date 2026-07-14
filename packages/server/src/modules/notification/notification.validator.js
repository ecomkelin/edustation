'use strict'

const { body, param, query } = require('express-validator')

/**
 * 通知模块 validator（v0.9 立项）
 *
 * 命名沿用项目惯例（其他 module 的 *.validator.js）：
 *   - body('field').optional({ values: 'falsy' }).isXxx()  ← 允许 null/空字符串
 *   - param('id').isMongoId()
 *   - query('page').optional().isInt({ min: 1 })
 */

// R-3601 内部发布（employee/admin 调用）
exports.publish = [
  body('type').isString().isLength({ min: 3, max: 64 }),
  body('recipientId').isMongoId(),
  // 2026-07-13: recipientRole 白名单 — 员工侧触发点传 'staff', 平台超管可传 'platform'
  body('recipientRole').optional({ values: 'falsy' }).isIn(['parent', 'staff', 'platform']),
  body('activeStudentId').optional({ values: 'falsy' }).isMongoId(),
  body('payload').optional({ values: 'falsy' }).isObject(),
  body('payload.entityType').optional({ values: 'falsy' }).isString().isLength({ max: 64 }),
  body('payload.entityId').optional({ values: 'falsy' }).isMongoId(),
  body('payload.deeplink').optional({ values: 'falsy' }).isString().isLength({ max: 256 }),
  body('vars').optional({ values: 'falsy' }).isObject(),
  body('scheduledFor').optional({ values: 'falsy' }).isISO8601()
]

// R-3602 /notifications/me
exports.listMe = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('status').optional({ values: 'falsy' }).isIn(['unread', 'read', 'archived']),
  query('archived').optional({ values: 'falsy' }).isIn(['true', 'false']),
  query('activeStudentId').optional({ values: 'falsy' }).isMongoId()
]

// R-3603 /notifications/me/unread-count
exports.unreadCount = [
  query('activeStudentId').optional({ values: 'falsy' }).isMongoId()
]

// R-3604 / R-3606
exports.byId = [
  param('id').isMongoId()
]

// R-3608 /notifications/me/preferences GET 无 body
// R-3609 /notifications/me/preferences PUT
exports.updatePreferences = [
  body('globalEnabled').optional().isBoolean(),
  body('categories').optional({ values: 'falsy' }).isObject(),
  body('channels').optional({ values: 'falsy' }).isObject(),
  body('quietHours').optional({ values: 'falsy' }).isObject()
]

// R-3611 /notifications/templates/:type/:channel
exports.upsertTemplate = [
  param('type').isString().isLength({ min: 3, max: 64 }),
  param('channel').isIn(['inbox', 'wechatMini', 'wechatPublic', 'sms', 'push']),
  body('title').isString().isLength({ min: 1, max: 256 }),
  body('body').isString().isLength({ min: 1, max: 1024 }),
  body('wechatTemplateId').optional({ values: 'falsy' }).isString().isLength({ max: 128 }),
  body('smsTemplateCode').optional({ values: 'falsy' }).isString().isLength({ max: 128 }),
  body('isActive').optional().isBoolean()
]

// R-3617 /notifications/templates/:type/:channel DELETE
// 2026-07-14 新增: 机构自定义重置为平台默认 (幂等)
exports.removeTemplate = [
  param('type').isString().isLength({ min: 3, max: 64 }),
  param('channel').isIn(['inbox', 'wechatMini', 'wechatPublic', 'sms', 'push'])
]

// R-3612 /notifications/admin/logs
exports.listLogs = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('channel').optional({ values: 'falsy' }).isString(),
  query('status').optional({ values: 'falsy' }).isString()
]