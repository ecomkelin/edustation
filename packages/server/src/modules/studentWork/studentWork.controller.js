'use strict'

const s = require('./studentWork.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) =>
  res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))

exports.detail = async (req, res) =>
  res.json(ApiResponse.ok(await s.detail({ id: req.params.id, orgId: req.orgId })))

/**
 * 创建作品（JSON 入参，不再接 multipart）。
 *
 * 入参：
 *   - lessonAttendance: 必填
 *   - title: 必填
 *   - description / level: 可选
 *   - fileIds: 必填，数组，每项是 File._id
 *     （前端先调 POST /api/v1/storage/upload-many?scope=work 拿到 fileIds 后再调本端点）
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
