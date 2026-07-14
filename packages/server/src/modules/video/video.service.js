'use strict'

const mongoose = require('mongoose')
const Video = require('@models/Video.model')
const ContentEngagement = require('@models/ContentEngagement.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { normalizePagination } = require('@utils/pagination')

/**
 * 平台科普视频 (Video) — 2026-07-14 内容回退 platform-only
 *
 * 关键点:
 *   - 平台级 (org=null): 跨机构对所有 C 端家长可见
 *   - service 不再校验 orgId; 公开端点无需 x-org-id header
 *   - viewCount 用 $inc 原子更, 失败不抛 (UI 不依赖)
 *   - 物理删除互锁 ContentEngagement: event 归孩子所属 org, filter 直接 contentId 命中
 *     (与 Article 同款; 内容 platform-only + engagement per-org)
 */

async function publicFeatured() {
  const doc = await Video.findOne({ isPublished: true })
    .populate('coverFile', 'url mime size')
    .sort({ publishedAt: -1 })
    .lean()
  return doc
}

async function publicList({ category, page, pageSize }) {
  const p = normalizePagination({ page, pageSize, defaultPageSize: 12 })
  const filter = { isPublished: true }
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

async function publicDetail({ id }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOne({ _id: id, isPublished: true })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('视频不存在或已下架')
  return doc
}

async function bumpViewCount({ id }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOneAndUpdate(
    { _id: id, isPublished: true },
    { $inc: { viewCount: 1 } },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在或已下架')
  return { ok: true, viewCount: doc.viewCount }
}

// ───── admin 端 ─────

async function adminList({ isPublished, category, keyword, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = {}
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

async function create({ payload, userId }) {
  if (!payload.videoUrl) throw ApiError.badRequest('videoUrl 必填')
  const doc = await Video.create({
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

async function update({ id, payload, userId }) {
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
    { _id: id },
    update,
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在')
  return doc
}

async function softRemove({ id, userId }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOneAndUpdate(
    { _id: id },
    { isPublished: false, updatedBy: userId },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在')
  return { ok: true, id: String(doc._id) }
}

// =====================================================================
// 物理删除 (2026-07-04 立项, 平台超管专属, 走 requirePlatformPassword)
//  2026-07-14 改造: 内容回退 platform-only, usageChecks filter 不带 org
// =====================================================================

function videoUsageChecks(videoId) {
  return [
    {
      model: ContentEngagement,
      filter: { contentType: 'video', contentId: videoId },
      label: '用户行为事件',
      hint: '存在 C 端家长孩子的播放/观看时长记录, 请先评估影响或保留视频'
    }
  ]
}

async function remove(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOne({ _id: id }).select('_id').lean()
  if (!doc) throw ApiError.notFound('视频不存在')

  await removable.assertUnused(null, videoUsageChecks(id))

  await Video.deleteOne({ _id: id })
  return { success: true, id }
}

async function removableCheck(id) {
  if (!mongoose.isValidObjectId(id)) {
    return { canRemove: false, blockers: [{ entity: 'Video', label: '视频', count: 0, hint: 'id 非法' }] }
  }
  const doc = await Video.findOne({ _id: id }).select('_id').lean()
  if (!doc) {
    return { canRemove: false, blockers: [{ entity: 'Video', label: '视频', count: 0, hint: '该视频不存在' }] }
  }
  return removable.check(null, videoUsageChecks(id))
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
