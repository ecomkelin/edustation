'use strict'

const mongoose = require('mongoose')
const Video = require('@models/Video.model')
const ContentEngagement = require('@models/ContentEngagement.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { normalizePagination } = require('@utils/pagination')

/**
 * 关键点:
 *   - 2026-07-03 内容下放到 per-org: 所有 filter 加 org = <req.orgId>
 *   - public/admin 端都强制 req.orgId; null/undefined 直接 400
 *   - viewCount 用 $inc 原子 +1, 失败不抛 (UI 不依赖)
 */

async function publicFeatured({ orgId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  const doc = await Video.findOne({ isPublished: true, org: orgId })
    .populate('coverFile', 'url mime size')
    .sort({ publishedAt: -1 })
    .lean()
  return doc
}

async function publicList({ orgId, category, page, pageSize }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  const p = normalizePagination({ page, pageSize, defaultPageSize: 12 })
  const filter = { isPublished: true, org: orgId }
  if (category) filter.category = category
  const [items, total] = await Promise.all([
    Video.find(filter)
      .populate('coverFile', 'url mime size')
      .sort({ publishedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Video.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function publicDetail({ id, orgId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOne({ _id: id, isPublished: true, org: orgId })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('视频不存在或已下架')
  return doc
}

async function bumpViewCount({ id, orgId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOneAndUpdate(
    { _id: id, isPublished: true, org: orgId },
    { $inc: { viewCount: 1 } },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在或已下架')
  return { ok: true, viewCount: doc.viewCount }
}

// ───── admin 端 ─────

async function adminList({ orgId, isPublished, category, keyword, page, pageSize }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (isPublished !== undefined && isPublished !== '') {
    filter.isPublished = isPublished === 'true' || isPublished === true
  }
  if (category) filter.category = category
  if (keyword) filter.title = { $regex: keyword, $options: 'i' }
  const [items, total] = await Promise.all([
    Video.find(filter)
      .populate('coverFile', 'url mime size')
      .sort({ updatedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Video.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function create({ orgId, payload, userId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!payload.videoUrl) throw ApiError.badRequest('videoUrl 必填')
  const doc = await Video.create({
    org: orgId,
    title: payload.title,
    intro: payload.intro || '',
    videoUrl: payload.videoUrl,
    coverFile: payload.coverFile || null,
    coverUrl: payload.coverUrl || '',
    category: payload.category || '',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    durationSeconds: typeof payload.durationSeconds === 'number' ? payload.durationSeconds : 0,
    isPublished: !!payload.isPublished,
    publishedAt: payload.isPublished ? new Date() : null,
    createdBy: userId,
    updatedBy: userId
  })
  return doc.toObject()
}

async function update({ id, orgId, payload, userId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const update = { updatedBy: userId }
  if (payload.title !== undefined) update.title = payload.title
  if (payload.intro !== undefined) update.intro = payload.intro
  if (payload.videoUrl !== undefined) update.videoUrl = payload.videoUrl
  if (payload.coverFile !== undefined) update.coverFile = payload.coverFile
  if (payload.coverUrl !== undefined) update.coverUrl = payload.coverUrl
  if (payload.category !== undefined) update.category = payload.category
  if (payload.tags !== undefined) update.tags = Array.isArray(payload.tags) ? payload.tags : []
  if (payload.durationSeconds !== undefined) update.durationSeconds = payload.durationSeconds
  if (payload.isPublished !== undefined) {
    update.isPublished = !!payload.isPublished
    if (payload.isPublished) update.publishedAt = new Date()
  }
  const doc = await Video.findOneAndUpdate(
    { _id: id, org: orgId },
    update,
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在或无权修改')
  return doc
}

async function softRemove({ id, orgId, userId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOneAndUpdate(
    { _id: id, org: orgId },
    { isPublished: false, updatedBy: userId },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在或无权操作')
  return { ok: true, id: String(doc._id) }
}

// =====================================================================
// 物理删除 (2026-07-04 立项, 平台超管专属, 走 requirePlatformPassword)
//  互锁: ContentEngagement.contentId 引用存在则挡
// =====================================================================

function videoUsageChecks(orgId, videoId) {
  return [
    {
      model: ContentEngagement,
      filter: { org: orgId, contentType: 'video', contentId: videoId },
      label: '用户行为事件',
      hint: '存在 C 端家长孩子的播放/观看时长记录, 请先评估影响或保留视频'
    }
  ]
}

async function remove(id, orgId) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) throw ApiError.notFound('视频不存在')

  await removable.assertUnused(orgId, videoUsageChecks(orgId, id))

  await Video.deleteOne({ _id: id, org: orgId })
  return { success: true, id }
}

async function removableCheck(id, orgId) {
  if (!orgId) return { canRemove: false, blockers: [{ entity: 'Video', label: '视频', count: 0, hint: '请指定机构 (x-org-id)' }] }
  if (!mongoose.isValidObjectId(id)) {
    return { canRemove: false, blockers: [{ entity: 'Video', label: '视频', count: 0, hint: 'id 非法' }] }
  }
  const doc = await Video.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) {
    return { canRemove: false, blockers: [{ entity: 'Video', label: '视频', count: 0, hint: '该视频不存在或不属于本机构' }] }
  }
  return removable.check(orgId, videoUsageChecks(orgId, id))
}

module.exports = {
  publicFeatured,
  publicList,
  publicDetail,
  bumpViewCount,
  adminList,
  create,
  update,
  softRemove,
  remove,
  removableCheck
}
