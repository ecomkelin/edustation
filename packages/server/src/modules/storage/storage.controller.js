'use strict'

const s = require('./storage.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 2026-07-12: 修中文文件名乱码
 *   multer 默认按 latin1 解码 multipart filename，但浏览器实际是 UTF-8 → 还原
 *   历史已上传的中文文件名仍乱码（DB 里存的就是错的）；此修仅对新上传生效
 */
function decodeOriginalName(name) {
  if (!name) return name
  return Buffer.from(name, 'latin1').toString('utf8')
}

exports.upload = async (req, res) => {
  const scope = req.query.scope || req.body.scope
  if (!scope) return res.status(400).json(ApiResponse.fail('缺少 scope', 400))
  if (!req.file) return res.status(400).json(ApiResponse.fail('缺少 file', 400))
  const result = await s.uploadOne({
    orgId: req.orgId,
    uploaderId: req.user.id,
    scope,
    buffer: req.file.buffer,
    originalName: decodeOriginalName(req.file.originalname),
    mime: req.file.mimetype,
    size: req.file.size
  })
  res.status(result.dedup ? 200 : 201).json(ApiResponse.created(result))
}

exports.uploadMany = async (req, res) => {
  const scope = req.query.scope || req.body.scope
  if (!scope) return res.status(400).json(ApiResponse.fail('缺少 scope', 400))
  if (!req.files || req.files.length === 0) return res.status(400).json(ApiResponse.fail('缺少 files', 400))
  // 2026-07-12: 批量上传每条文件名都要还原编码
  const files = req.files.map((f) => ({
    buffer: f.buffer,
    originalname: decodeOriginalName(f.originalname),
    mimetype: f.mimetype,
    size: f.size
  }))
  const items = await s.uploadMany({
    orgId: req.orgId,
    uploaderId: req.user.id,
    scope,
    files
  })
  res.status(201).json(ApiResponse.created({ items }))
}

exports.list = async (req, res) => {
  const data = await s.list({
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin,
    ...req.query
  })
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await s.detail({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(data))
}

exports.bind = async (req, res) => {
  const data = await s.bind({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin,
    refs: req.body.refs || []
  })
  res.json(ApiResponse.ok(data))
}

exports.unbind = async (req, res) => {
  const data = await s.unbind({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin,
    refs: req.body.refs || []
  })
  res.json(ApiResponse.ok(data))
}

exports.remove = async (req, res) => {
  const data = await s.remove({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(data))
}

exports.removableCheck = async (req, res) => {
  const data = await s.removableCheck({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(data))
}

/**
 * R-3010 GET /storage/files/:id/stream?disposition=inline|attachment&access_token=xxx
 * 2026-07-20: 给前端预览 PDF/视频/课件用 —— 默认 inline (浏览器内嵌展示而非下载)
 *
 * 注意：本端点不依赖 x-org-id header (iframe 端没法设) —— 租户隔离在 service.stream 里
 * 通过 file.org + req.user.id 查 user-org-rel 自己实现。
 */
exports.stream = async (req, res) => {
  const data = await s.stream({
    id: req.params.id,
    userId: req.user.id,
    isPlatformAdmin: req.user.isPlatformAdmin,
    disposition: req.query.disposition
  })
  const fs = require('fs')
  if (!fs.existsSync(data.absPath)) {
    return res.status(404).json(ApiResponse.fail('文件实体已丢失', 404))
  }
  // RFC 5987: 中文文件名用 UTF-8 + percent-encoded
  const asciiName = String(data.originalName).replace(/[^\x20-\x7E]/g, '_')
  const encodedName = encodeURIComponent(data.originalName)
  const disposition =
    data.disposition === 'attachment'
      ? `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
      : `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
  res.setHeader('Content-Type', data.mime)
  res.setHeader('Content-Length', data.size)
  res.setHeader('Content-Disposition', disposition)
  res.setHeader('Cache-Control', 'no-store, private, max-age=0')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  fs.createReadStream(data.absPath).pipe(res)
}
