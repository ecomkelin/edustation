'use strict'

const path = require('path')
const s = require('./studentWork.service')
const ApiResponse = require('@utils/ApiResponse')
const config = require('@config/index')

exports.list = async (req, res) =>
  res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))

exports.detail = async (req, res) =>
  res.json(ApiResponse.ok(await s.detail({ id: req.params.id, orgId: req.orgId })))

/**
 * 上传：接收 multipart files + 业务字段
 *   必填：lessonAttendance, title
 *   可选：description, level (1~5)
 *   files: ≥1
 *
 * fileUrls 落盘后写入 StudentWork。4 个 snapshot 字段由 service 从
 * lessonAttendance → lessonSchedule → courseInstance → subject 推导。
 */
exports.upload = async (req, res) => {
  const { lessonAttendance, title, description, level } = req.body
  if (!lessonAttendance || !title) {
    return res.status(400).json(ApiResponse.fail('lessonAttendance / title 必填', 400))
  }
  const fileUrls = (req.files || []).map((f) => {
    // /uploads/YYYY-MM-DD/xxx.png
    const rel = path.relative(config.upload.dir, f.path).replace(/\\/g, '/')
    return config.upload.baseUrl + '/' + rel
  })
  const doc = await s.create({
    orgId: req.orgId,
    operatorId: req.user.id,
    lessonAttendance,
    title,
    description,
    fileUrls,
    level: level === undefined || level === '' ? undefined : Number(level)
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
