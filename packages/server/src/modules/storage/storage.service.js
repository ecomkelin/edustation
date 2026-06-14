'use strict'

const crypto = require('crypto')
const path = require('path')
const mongoose = require('mongoose')
const { File, FILE_SCOPE, REF_ENTITY } = require('@models/File.model')
const config = require('@config/index')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const { getDriver, buildKey } = require('./drivers')

/**
 * 存储服务（storage.service）
 *
 * 职责：
 *  - upload(single/many)：落 driver + 写 File 文档
 *  - list/detail：分页 + 多维过滤
 *  - bind/unbind：手动绑定 / 解绑
 *  - remove：refCount=0 才删；>0 抛 422 + blockers
 *  - removableCheck：返回 blockers 列表
 *
 * 跨租户隔离：
 *  - 列表：只返回 org=req.orgId 的文件（平台超管可选 null 看全部）
 *  - 单文件读：File.org 必须 === req.orgId（除非平台超管）
 *  - 写：只允许上传到 req.orgId
 */

const REF_ENTITY_LABELS = {
  [REF_ENTITY.USER]: '用户',
  [REF_ENTITY.STUDENT_WORK]: '学生作品',
  [REF_ENTITY.PET]: '宠物',
  [REF_ENTITY.ORG]: '机构',
  [REF_ENTITY.COURSE_PRODUCT]: '课程产品',
  [REF_ENTITY.LESSON_SCHEDULE]: '排课'
}

/**
 * 校验 scope / mime / size。
 * 抛 ApiError 4xx。
 */
function validateUploadInput({ scope, mime, size }) {
  if (!Object.values(FILE_SCOPE).includes(scope)) {
    throw ApiError.badRequest(`scope 非法,允许: ${Object.values(FILE_SCOPE).join(', ')}`)
  }
  if (mime && !config.storage.allowedMime.includes(mime)) {
    throw ApiError.badRequest(`不支持的文件类型: ${mime}`)
  }
  if (size != null && size > config.storage.maxFileSize) {
    throw ApiError.badRequest(`文件超过最大限制 ${Math.round(config.storage.maxFileSize / 1024 / 1024)}MB`)
  }
}

/**
 * 单文件上传（从 buffer 入参）。
 * routes 层会先用 multer 解析 multipart，再调本函数。
 */
async function uploadOne({ orgId, uploaderId, scope, buffer, originalName, mime, size }) {
  validateUploadInput({ scope, mime, size })
  const ext = path.extname(originalName || '').replace(/^\./, '') || mime.split('/')[1] || ''
  const key = buildKey({ scope, originalName, ext })
  const driver = getDriver()
  const { url, size: writtenSize } = await driver.putObject({ key, buffer, mime })

  // sha256（防重复 + 完整性校验）
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

  // 同 org + 同 sha256 已存在 → 复用，不重复落盘
  const exist = await File.findOne({ org: orgId || null, sha256, deletedAt: null })
  if (exist) {
    return { id: exist._id, url: exist.url, scope: exist.scope, mime: exist.mime, size: exist.size, dedup: true }
  }

  const doc = await File.create({
    org: orgId || null,
    scope,
    uploader: uploaderId,
    driver: driver.name,
    key,
    url,
    originalName: originalName || null,
    mime,
    size: writtenSize,
    sha256,
    refs: [],
    refCount: 0,
    isOrphan: true // 上传时没引用即孤儿，等业务模块 bind
  })
  return { id: doc._id, url: doc.url, scope: doc.scope, mime: doc.mime, size: doc.size, dedup: false }
}

/**
 * 多文件上传（最多 maxFilesPerUpload 个）。
 */
async function uploadMany({ orgId, uploaderId, scope, files }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw ApiError.badRequest('files 不能为空')
  }
  if (files.length > config.storage.maxFilesPerUpload) {
    throw ApiError.badRequest(`单次最多上传 ${config.storage.maxFilesPerUpload} 个文件`)
  }
  const out = []
  for (const f of files) {
    out.push(await uploadOne({
      orgId,
      uploaderId,
      scope,
      buffer: f.buffer,
      originalName: f.originalname,
      mime: f.mimetype,
      size: f.size
    }))
  }
  return out
}

/**
 * 列表 + 多维过滤。
 *
 * 入参（query 形式）：
 *   scope, mime, originalName (模糊), uploader, isOrphan,
 *   from (Date), to (Date), page, pageSize
 */
async function list({ orgId, isPlatformAdmin, ...query }) {
  const p = normalizePagination({ page: query.page, pageSize: query.pageSize })
  const filter = { deletedAt: null }

  // 跨租户隔离
  if (isPlatformAdmin && query.orgId === 'all') {
    // 平台超管显式请求全部
  } else {
    filter.org = orgId || null
  }

  if (query.scope) {
    if (!Object.values(FILE_SCOPE).includes(query.scope)) {
      throw ApiError.badRequest('scope 非法')
    }
    filter.scope = query.scope
  }
  if (query.uploader && mongoose.isValidObjectId(query.uploader)) {
    filter.uploader = query.uploader
  }
  if (query.isOrphan === true || query.isOrphan === 'true') {
    filter.isOrphan = true
    filter.refCount = 0
  } else if (query.isOrphan === false || query.isOrphan === 'false') {
    filter.isOrphan = false
  }
  if (query.originalName) {
    filter.originalName = { $regex: query.originalName, $options: 'i' }
  }
  if (query.mime) {
    filter.mime = query.mime
  }
  if (query.from || query.to) {
    filter.createdAt = {}
    if (query.from) filter.createdAt.$gte = new Date(query.from)
    if (query.to) filter.createdAt.$lte = new Date(query.to)
  }

  const [items, total] = await Promise.all([
    File.find(filter)
      .populate('uploader', 'realName mobile')
      .populate('org', 'name')
      .sort({ createdAt: -1 })
      .skip((p.page - 1) * p.limit)
      .limit(p.limit)
      .lean(),
    File.countDocuments(filter)
  ])
  // 把 refs 里的 entity 名映射成中文 label
  const decorated = items.map((d) => ({
    ...d,
    refs: (d.refs || []).map((r) => ({ ...r, label: REF_ENTITY_LABELS[r.entity] || r.entity }))
  }))
  return { items: decorated, total, page: p.page, pageSize: p.limit }
}

/**
 * 单文件详情（含 refs 列表）。
 */
async function detail({ id, orgId, isPlatformAdmin }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('文件不存在')
  const doc = await File.findOne({ _id: id, deletedAt: null })
    .populate('uploader', 'realName mobile')
    .populate('org', 'name')
    .lean()
  if (!doc) throw ApiError.notFound('文件不存在')
  if (!isPlatformAdmin && doc.org && String(doc.org._id) !== String(orgId)) {
    throw ApiError.notFound('文件不存在') // 跨租户隐藏
  }
  doc.refs = (doc.refs || []).map((r) => ({ ...r, label: REF_ENTITY_LABELS[r.entity] || r.entity }))
  return doc
}

/**
 * 显式 bind（前端在"上传后写入业务表"路径用）。
 */
async function bind({ id, orgId, isPlatformAdmin, refs }) {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw ApiError.badRequest('refs 必填')
  }
  const doc = await File.findOne({ _id: id, deletedAt: null })
  if (!doc) throw ApiError.notFound('文件不存在')
  if (!isPlatformAdmin && doc.org && String(doc.org) !== String(orgId)) {
    throw ApiError.forbidden('无权操作其他机构的文件')
  }
  for (const r of refs) {
    const { entity, entityId, field } = r
    if (!entity || !entityId || !field) {
      throw ApiError.badRequest('refs 每项需含 entity / entityId / field')
    }
    const has = (doc.refs || []).some(
      (x) => x.entity === entity && String(x.entityId) === String(entityId) && x.field === field
    )
    if (has) continue
    doc.refs.push({ entity, entityId, field, boundAt: new Date() })
  }
  doc.refCount = doc.refs.length
  doc.isOrphan = doc.refCount === 0
  await doc.save()
  return detail({ id: doc._id, orgId, isPlatformAdmin })
}

async function unbind({ id, orgId, isPlatformAdmin, refs }) {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw ApiError.badRequest('refs 必填')
  }
  const doc = await File.findOne({ _id: id, deletedAt: null })
  if (!doc) throw ApiError.notFound('文件不存在')
  if (!isPlatformAdmin && doc.org && String(doc.org) !== String(orgId)) {
    throw ApiError.forbidden('无权操作其他机构的文件')
  }
  for (const r of refs) {
    const { entity, entityId, field } = r
    doc.refs = (doc.refs || []).filter(
      (x) => !(x.entity === entity && String(x.entityId) === String(entityId) && x.field === field)
    )
  }
  doc.refCount = doc.refs.length
  doc.isOrphan = doc.refCount === 0
  await doc.save()
  return detail({ id: doc._id, orgId, isPlatformAdmin })
}

/**
 * 预检：返回 canRemove + blockers 列表。
 * 业务模块 removableCheck 同款：refCount>0 → 挡。
 */
async function removableCheck({ id, orgId, isPlatformAdmin }) {
  if (!mongoose.isValidObjectId(id)) {
    return { canRemove: false, blockers: [{ entity: 'File', label: '文件', count: 0, hint: '文件不存在' }] }
  }
  const doc = await File.findOne({ _id: id, deletedAt: null }).select('org refCount refs').lean()
  if (!doc) {
    return { canRemove: false, blockers: [{ entity: 'File', label: '文件', count: 0, hint: '文件不存在或已删除' }] }
  }
  if (!isPlatformAdmin && doc.org && String(doc.org) !== String(orgId)) {
    return { canRemove: false, blockers: [{ entity: 'File', label: '文件', count: 0, hint: '文件不存在或不属于本机构' }] }
  }
  if (doc.refCount > 0) {
    // 把 refs 按 entity+field 聚合，给前端展示
    const byKey = new Map()
    for (const r of doc.refs || []) {
      const k = `${r.entity}::${r.field}`
      if (!byKey.has(k)) byKey.set(k, { entity: r.entity, field: r.field, label: REF_ENTITY_LABELS[r.entity] || r.entity, count: 0 })
      byKey.get(k).count++
    }
    const blockers = [...byKey.values()].map((b) => ({
      entity: b.entity,
      label: b.label,
      count: b.count,
      hint: `请先解除该文件在「${b.label}.${b.field}」上的引用（${b.count} 处）后再删`
    }))
    return { canRemove: false, blockers }
  }
  return { canRemove: true, blockers: [] }
}

/**
 * 物理删除。
 *  - refCount>0 → 422 + blockers（不让删）
 *  - 走 driver.removeObject
 *  - File 文档用 deleteOne（不留软删；图片磁盘可恢复性差，留着只是污染索引）
 */
async function remove({ id, orgId, isPlatformAdmin }) {
  const check = await removableCheck({ id, orgId, isPlatformAdmin })
  if (!check.canRemove) {
    throw ApiError.unprocessable('该文件仍被业务引用,无法删除', { blockers: check.blockers })
  }
  const doc = await File.findOne({ _id: id, deletedAt: null })
  if (!doc) throw ApiError.notFound('文件不存在')
  const driver = getDriver()
  await driver.removeObject(doc.key)
  await doc.deleteOne()
  return { success: true }
}

module.exports = {
  uploadOne,
  uploadMany,
  list,
  detail,
  bind,
  unbind,
  remove,
  removableCheck,
  REF_ENTITY_LABELS
}
