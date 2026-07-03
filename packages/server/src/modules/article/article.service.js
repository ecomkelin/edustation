'use strict'

const mongoose = require('mongoose')
const Article = require('@models/Article.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const { compileMarkdownSafe } = require('@utils/markdown')

/**
 * 关键点:
 *   - C 端只返 isPublished=true 的; admin 端不过滤
 *   - markdown -> html 在 service 层做一次, 前端详情页直接 v-html contentHtml
 *   - publicList 不返 contentHtml (避免大字段); publicDetail 单独返
 *   - viewCount 用 $inc 原子更, 不加事务
 */

async function publicList({ category, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { isPublished: true, org: null }
  if (category) filter.category = category
  const [items, total] = await Promise.all([
    Article.find(filter, { contentMarkdown: 0, contentHtml: 0 })
      .sort({ publishedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Article.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function publicDetail(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Article.findOne({ _id: id, isPublished: true, org: null })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('文章不存在或已下架')
  return doc
}

async function bumpViewCount(id) {
  if (!mongoose.isValidObjectId(id)) return
  await Article.updateOne({ _id: id }, { $inc: { viewCount: 1 } })
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
    Article.find(filter, { contentMarkdown: 0, contentHtml: 0 })
      .sort({ updatedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Article.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function create({ payload, userId }) {
  const contentMarkdown = payload.contentMarkdown || ''
  const contentHtml = compileMarkdownSafe(contentMarkdown)
  const doc = await Article.create({
    title: payload.title,
    summary: payload.summary || '',
    contentMarkdown,
    contentHtml,
    coverFile: payload.coverFile || null,
    category: payload.category || '',
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
  if (payload.summary !== undefined) update.summary = payload.summary
  if (payload.contentMarkdown !== undefined) {
    update.contentMarkdown = payload.contentMarkdown
    update.contentHtml = compileMarkdownSafe(payload.contentMarkdown)
  }
  if (payload.coverFile !== undefined) update.coverFile = payload.coverFile
  if (payload.category !== undefined) update.category = payload.category
  if (payload.isPublished !== undefined) {
    update.isPublished = !!payload.isPublished
    // 从草稿 → 发布时设 publishedAt = now; 已发布保留原时间
    if (payload.isPublished) update.publishedAt = new Date()
  }
  const doc = await Article.findByIdAndUpdate(id, update, { new: true }).lean()
  if (!doc) throw ApiError.notFound('文章不存在')
  return doc
}

// 软下架: isPublished=false (避免物理删除, 草稿态可恢复)
async function softRemove({ id, userId }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Article.findByIdAndUpdate(
    id,
    { isPublished: false, updatedBy: userId },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('文章不存在')
  return { ok: true, id: String(doc._id) }
}

module.exports = {
  publicList,
  publicDetail,
  bumpViewCount,
  adminList,
  create,
  update,
  softRemove
}
