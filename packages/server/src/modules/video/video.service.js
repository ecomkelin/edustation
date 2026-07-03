'use strict'

const mongoose = require('mongoose')
const Video = require('@models/Video.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')

/**
 * 关键点:
 *   - C 端只返 isPublished=true 的; admin 端不过滤
 *   - publicFeatured 返最新 1 个 (供探索 tab 英雄位)
 *   - publicList 全部按 publishedAt desc 倒序分页
 *   - 启动计数用 $inc 原子 +1, 失败不抛 (UI 不依赖)
 */

async function publicFeatured() {
  const doc = await Video.findOne({ isPublished: true, org: null })
    .populate('coverFile', 'url mime size')
    .sort({ publishedAt: -1 })
    .lean()
  return doc // 可能为 null, 客户端做空态兜底
}

async function publicList({ category, page, pageSize }) {
  const p = normalizePagination({ page, pageSize, defaultPageSize: 12 })
  const filter = { isPublished: true, org: null }
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

async function publicDetail(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOne({ _id: id, isPublished: true, org: null })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('视频不存在或已下架')
  return doc
}

async function bumpViewCount(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findOneAndUpdate(
    { _id: id, isPublished: true, org: null },
    { $inc: { viewCount: 1 } },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在或已下架')
  return { ok: true, viewCount: doc.viewCount }
}

// ───── admin 端 ─────

async function adminList({ isPublished, category, keyword, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: null }
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
  const doc = await Video.findByIdAndUpdate(id, update, { new: true }).lean()
  if (!doc) throw ApiError.notFound('视频不存在')
  return doc
}

// 软下架: isPublished=false (避免物理删除, 草稿态可恢复)
async function softRemove({ id, userId }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Video.findByIdAndUpdate(
    id,
    { isPublished: false, updatedBy: userId },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('视频不存在')
  return { ok: true, id: String(doc._id) }
}

module.exports = {
  publicFeatured,
  publicList,
  publicDetail,
  bumpViewCount,
  adminList,
  create,
  update,
  softRemove
}
