'use strict'

const fs = require('fs')
const path = require('path')
const multer = require('multer')
const LessonWork = require('@models/LessonWork.model')
const ApiError = require('@utils/ApiError')
const config = require('@config/index')

if (!fs.existsSync(config.upload.dir)) {
  fs.mkdirSync(config.upload.dir, { recursive: true })
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const sub = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const dir = path.join(config.upload.dir, sub)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/[^\w-]/g, '_')
    cb(null, `${Date.now()}_${base}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize }
})

async function list({ orgId, lessonSchedule, student }) {
  const filter = { org: orgId }
  if (lessonSchedule) filter.lessonSchedule = lessonSchedule
  if (student) filter.student = student
  return LessonWork.find(filter)
    .populate('student', 'name')
    .populate('lessonSchedule', 'plannedStartTime title')
    .populate('uploadedBy', 'realName mobile')
    .sort({ createdAt: -1 })
    .lean()
}

async function create({ orgId, lessonSchedule, student, title, description, fileUrls, uploadedBy }) {
  if (!fileUrls || fileUrls.length === 0) throw ApiError.badRequest('至少上传一个文件')
  const doc = await LessonWork.create({ org: orgId, lessonSchedule, student, title, description, fileUrls, uploadedBy })
  return doc.toObject()
}

/**
 * 物理删除作品。作品是孤儿数据(无其他实体引用),但因为:
 *   1) 作品通常含图片/视频(隐私相关)
 *   2) 删除是「不可逆」
 * 仍走「超管+密码」二次确认,与其他破坏性操作保持一致节奏。
 */
async function remove({ id, orgId }) {
  const doc = await LessonWork.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('作品不存在')
  await doc.deleteOne()
  // 可选：清理本地文件 (阶段 2)
  return { success: true }
}

module.exports = { upload, list, create, remove }
