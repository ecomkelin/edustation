'use strict'

const s = require('./studentWork.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 列表：透传所有 query 参数到 service.list；
 * service 层负责白名单校验。
 */
exports.list = async (req, res) =>
  res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))

/**
 * 单条详情。
 * 2026-07-08: ?includeArchived=true 才能看已归档作品
 */
exports.detail = async (req, res) =>
  res.json(ApiResponse.ok(await s.detail({
    id: req.params.id,
    orgId: req.orgId,
    includeArchived: req.query.includeArchived === 'true' || req.query.includeArchived === true
  })))

/**
 * R-1670 GET /student-works/me (2026-07-01 立项)
 * C 端家长：当前 active child 的全部作品。
 * 复用 service.list，强制 student=req.activeStudentId，避免越权读到别人孩子的作品。
 */
exports.mine = async (req, res) =>
  res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, student: req.activeStudentId, ...req.query })))

/**
 * R-1606 GET /student-works/stats (2026-07-01 立项)
 * 顶部 KPI 聚合：本期作品数 / 已评数 / 未评数 / 平均等级，对比上一期。
 * 不传 createdAtFrom/createdAtTo 时默认本期=本月1号~当前；上一期=上月同时长。
 */
exports.stats = async (req, res) =>
  res.json(ApiResponse.ok(await s.stats({ orgId: req.orgId, ...req.query })))

/**
 * R-1640 GET /student-works/export.csv (2026-07-01 立项)
 * CSV 导出 (BOM + ; 分隔, Excel 友好)。复用 AuditLogs.exportCsv 范式。
 * 不分页，按当前过滤条件把所有作品写到 CSV（最多 MAX_PAGE_SIZE 行以保护后端）。
 */
exports.exportCsv = async (req, res) => {
  const csv = await s.exportCsv({ orgId: req.orgId, ...req.query })
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="student-works-${Date.now()}.csv"`)
  // BOM 让 Excel 识别 UTF-8
  res.write('﻿')
  res.end(csv)
}

/**
 * 创建作品（JSON 入参，不再接 multipart）。
 *
 * 入参：
 *   - lessonAttendance: 必填
 *   - title: 必填
 *   - description / level: 可选
 *   - fileIds: 必填，数组，每项是 File._id
 *     （前端先调 POST /api/v1/storage/upload?scope=work 拿到 fileIds 后再调本端点）
 *
 * 行为：
 *   1. 校验 fileIds 全部属于 req.orgId
 *   2. resolveSnapshots 推 4 个 snapshot 字段
 *   3. 把 fileIds 对应的 url 拍平写到 fileUrls（保持 schema 兼容）
 *   4. fileBind.bindUrls(..., entity='StudentWork', field='fileUrls') 自动维护 refCount
 *   5. 写入 StudentWork 文档
 */
exports.upload = async (req, res) => {
  const { lessonAttendance, title, description, level, fileIds } = req.body || {}
  if (!lessonAttendance) return res.status(400).json(ApiResponse.fail('lessonAttendance 必填', 400))
  if (!title) return res.status(400).json(ApiResponse.fail('title 必填', 400))
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json(ApiResponse.fail('fileIds 必填且至少 1 个', 400))
  }
  const doc = await s.create({
    orgId: req.orgId,
    operatorId: req.user.id,
    lessonAttendance,
    title,
    description,
    level: level === undefined || level === '' || level === null ? undefined : Number(level),
    fileIds
  })
  res.status(201).json(ApiResponse.created(doc))
}

/**
 * 更新作品（员工操作）：改 title / description / fileUrls / level。
 * 4 个 snapshot 字段不可改（service 层强制 strip）。
 *
 * 权限：studentWork.write（与创建同权限）
 *  老师 / 教务 / 管理员 均可调用
 */
exports.update = async (req, res) => {
  const doc = await s.update({
    id: req.params.id,
    orgId: req.orgId,
    payload: req.body || {}
  })
  res.json(ApiResponse.ok(doc))
}

exports.remove = async (req, res) =>
  res.json(ApiResponse.ok(await s.remove({ id: req.params.id, orgId: req.orgId })))

exports.removableCheck = async (req, res) =>
  res.json(ApiResponse.ok(await s.removableCheck({ id: req.params.id, orgId: req.orgId })))

// 2026-07-08: 归档 / 取消归档 (复用 studentWork.write 权限, 不需要超管+密码)
exports.archive = async (req, res) =>
  res.json(ApiResponse.ok(await s.archive({ id: req.params.id, orgId: req.orgId, actor: req.user })))

exports.unarchive = async (req, res) =>
  res.json(ApiResponse.ok(await s.unarchive({ id: req.params.id, orgId: req.orgId, actor: req.user })))
