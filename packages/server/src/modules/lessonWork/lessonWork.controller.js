'use strict'

const path = require('path')
const s = require('./lessonWork.service')
const ApiResponse = require('@utils/ApiResponse')
const config = require('@config/index')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))

/**
 * 上传：接收 multipart files + 业务字段
 * files 转 fileUrls 写入 LessonWork
 */
exports.upload = async (req, res) => {
  const { lessonSchedule, student, title, description } = req.body
  if (!lessonSchedule || !student || !title) {
    // 422 业务字段缺失
    return res.status(400).json(ApiResponse.fail('lessonSchedule / student / title 必填', 400))
  }
  const fileUrls = (req.files || []).map((f) => {
    // /uploads/YYYY-MM-DD/xxx.png
    const rel = path.relative(config.upload.dir, f.path).replace(/\\/g, '/')
    return config.upload.baseUrl + '/' + rel
  })
  const doc = await s.create({
    orgId: req.orgId,
    lessonSchedule,
    student,
    title,
    description,
    fileUrls,
    uploadedBy: req.user.id
  })
  res.status(201).json(ApiResponse.created(doc))
}

exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.remove({ id: req.params.id, orgId: req.orgId })))
