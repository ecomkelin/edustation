'use strict'

const service = require('./notification.service')
const prefService = require('./notificationPreference.service')
const tplService = require('./notificationTemplate.service')
const ApiResponse = require('@utils/ApiResponse')

// R-3601 POST /notifications/publish —— 内部发布（employee/admin 调用）
exports.publish = async (req, res) => {
  const data = await service.publish({
    orgId: req.orgId,
    recipientId: req.body.recipientId,
    // 2026-07-13: 透传 recipientRole 给 service, 默认 'parent'; 员工侧触发点传 'staff'
    recipientRole: req.body.recipientRole,
    type: req.body.type,
    activeStudentId: req.body.activeStudentId,
    payload: req.body.payload,
    vars: req.body.vars,
    scheduledFor: req.body.scheduledFor ? new Date(req.body.scheduledFor) : null,
    source: req.body.source || 'manual'
  })
  res.status(201).json(ApiResponse.created(data))
}

// R-3602 GET /notifications/me
exports.listMe = async (req, res) => {
  const data = await service.listMe(req.user.id, {
    page: req.query.page,
    pageSize: req.query.pageSize,
    status: req.query.status,
    archived: req.query.archived,
    activeStudentId: req.query.activeStudentId
  })
  res.json(ApiResponse.ok(data))
}

// R-3603 GET /notifications/me/unread-count
exports.unreadCount = async (req, res) => {
  const data = await service.unreadCount(req.user.id, {
    activeStudentId: req.query.activeStudentId
  })
  res.json(ApiResponse.ok(data))
}

// R-3604 POST /notifications/:id/read
exports.markRead = async (req, res) => {
  const data = await service.markRead(req.user.id, req.params.id)
  res.json(ApiResponse.ok(data))
}

// R-3605 POST /notifications/me/read-all
exports.markAllRead = async (req, res) => {
  const data = await service.markAllRead(req.user.id, {
    activeStudentId: req.query.activeStudentId
  })
  res.json(ApiResponse.ok(data))
}

// R-3606 POST /notifications/:id/archive
exports.archive = async (req, res) => {
  const data = await service.archive(req.user.id, req.params.id)
  res.json(ApiResponse.ok(data))
}

// R-3607 POST /notifications/me/archive-all
exports.archiveAll = async (req, res) => {
  const data = await service.archiveAll(req.user.id, {
    activeStudentId: req.query.activeStudentId
  })
  res.json(ApiResponse.ok(data))
}

// R-3608 GET /notifications/me/preferences
exports.getPreferences = async (req, res) => {
  const data = await prefService.getOrCreate(req.orgId, req.user.id)
  res.json(ApiResponse.ok(data))
}

// R-3609 PUT /notifications/me/preferences
exports.updatePreferences = async (req, res) => {
  const data = await prefService.update(req.orgId, req.user.id, req.body || {})
  res.json(ApiResponse.ok(data))
}

// R-3610 GET /notifications/templates —— 管理后台
exports.listTemplates = async (req, res) => {
  const data = await tplService.list(req.orgId)
  res.json(ApiResponse.ok(data))
}

// R-3611 PUT /notifications/templates/:type/:channel
exports.upsertTemplate = async (req, res) => {
  const data = await tplService.upsert(req.orgId, req.params.type, req.params.channel, req.body || {})
  res.json(ApiResponse.ok(data))
}

// R-3612 GET /notifications/admin/logs —— 管理后台发送流水
exports.listLogs = async (req, res) => {
  const data = await service.listLogs(req.orgId, {
    page: req.query.page,
    pageSize: req.query.pageSize,
    channel: req.query.channel,
    status: req.query.status
  })
  res.json(ApiResponse.ok(data))
}