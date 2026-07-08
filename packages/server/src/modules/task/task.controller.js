'use strict'

const s = require('./task.service')
const ApiResponse = require('@utils/ApiResponse')

// ─── 任务 CRUD ─────────────────────────────────

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({
  orgId: req.orgId,
  ...req.query,
  actor: req.user
})))

exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail({
  id: req.params.id,
  orgId: req.orgId,
  actor: req.user
})))

exports.create = async (req, res) => res.status(201).json(ApiResponse.created(await s.create({
  orgId: req.orgId,
  ...req.body,
  // 2026-07-08: 平台超管可选发起人 (默认 = 机构管理员); 普通员工只能 creator=self
  creator: (req.body.creator && req.user.isPlatformAdmin)
    ? req.body.creator
    : req.user.userId,
  // 2026-07-08: post-create detail() 必须用真实请求者 (req.user), 不能用新 creator
  //   否则 canViewTask 用新 creator 校验可见性, 她可能没 task.read 权限, 抛 403
  actor: req.user
})))

exports.update = async (req, res) => res.json(ApiResponse.ok(await s.update({
  id: req.params.id,
  orgId: req.orgId,
  body: req.body,
  actor: req.user
})))

exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.remove({
  id: req.params.id,
  orgId: req.orgId
})))

exports.removableCheck = async (req, res) => res.json(ApiResponse.ok(await s.removableCheck({
  id: req.params.id,
  orgId: req.orgId
})))

// ─── 状态机 ───────────────────────────────────

exports.submit = async (req, res) => res.json(ApiResponse.ok(await s.submit({
  id: req.params.id, orgId: req.orgId, actor: req.user
})))

exports.review = async (req, res) => res.json(ApiResponse.ok(await s.review({
  id: req.params.id,
  orgId: req.orgId,
  ...req.body,
  actor: req.user
})))

exports.cancel = async (req, res) => res.json(ApiResponse.ok(await s.cancel({
  id: req.params.id, orgId: req.orgId, ...req.body, actor: req.user
})))

// ─── 条目 ────────────────────────────────────

exports.addItem = async (req, res) => res.status(201).json(ApiResponse.created(await s.addItem({
  id: req.params.id, orgId: req.orgId, item: req.body, actor: req.user
})))

exports.toggleItem = async (req, res) => res.json(ApiResponse.ok(await s.toggleItem({
  id: req.params.id,
  itemId: req.params.itemId,
  orgId: req.orgId,
  done: req.body.done,
  assignee: req.body.assignee,
  actor: req.user
})))

// ─── 评论 ────────────────────────────────────

exports.addComment = async (req, res) => res.status(201).json(ApiResponse.created(await s.addComment({
  id: req.params.id, orgId: req.orgId, ...req.body, actor: req.user
})))

// ─── 看板 / 统计 ────────────────────────────

exports.kanban = async (req, res) => res.json(ApiResponse.ok(await s.kanban({
  orgId: req.orgId, ...req.query, actor: req.user
})))

exports.stats = async (req, res) => res.json(ApiResponse.ok(await s.stats({
  orgId: req.orgId, actor: req.user
})))

// ─── 模板 ───────────────────────────────────

exports.templateList = async (req, res) => res.json(ApiResponse.ok(await s.templateList({
  orgId: req.orgId, ...req.query
})))

exports.templateCreate = async (req, res) => res.status(201).json(ApiResponse.created(await s.templateCreate({
  orgId: req.orgId, body: req.body, actor: req.user
})))

exports.templateUpdate = async (req, res) => res.json(ApiResponse.ok(await s.templateUpdate({
  id: req.params.id, orgId: req.orgId, body: req.body
})))

exports.templateRemove = async (req, res) => res.json(ApiResponse.ok(await s.templateRemove({
  id: req.params.id, orgId: req.orgId
})))

exports.templateRunNow = async (req, res) => res.json(ApiResponse.ok(await s.templateRunNow({
  id: req.params.id, orgId: req.orgId, actor: req.user
})))

exports.templatePause = async (req, res) => res.json(ApiResponse.ok(await s.templatePause({
  id: req.params.id, orgId: req.orgId
})))

exports.templateResume = async (req, res) => res.json(ApiResponse.ok(await s.templateResume({
  id: req.params.id, orgId: req.orgId
})))