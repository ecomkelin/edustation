'use strict'

const mongoose = require('mongoose')
const Article = require('@models/Article.model')
const ContentEngagement = require('@models/ContentEngagement.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { normalizePagination } = require('@utils/pagination')
const { compileMarkdownSafe } = require('@utils/markdown')
// 2026-07-04 运营分析: detail 顺手记 engagement event; 2026-07-14 content record 改造, 内部反查 kid.org
const engagement = require('@modules/contentEngagement/contentEngagement.service')

/**
 * 平台科普文章 (Article) — 2026-07-14 内容回退 platform-only
 *
 * 关键点:
 *   - 平台级 (org=null): 跨机构对所有 C 端家长可见
 *   - service 不再校验 orgId; 公开端点无需 x-org-id header
 *   - 写操作 (admin CRUD) 走 routes requirePlatformAdmin; 物理删除走 requirePlatformPassword
 *   - markdown -> html 在 service 层做一次, 前端详情页直接 v-html contentHtml
 *   - publicList 不返 contentHtml (避免大字段); publicDetail 单独返
 *   - viewCount 用 $inc 原子更, 不加事务
 *   - 物理删除互锁 ContentEngagement: event 归孩子所属 org, filter 直接 contentId 命中
 *     （org 不再参与: 内容是平台级, 引用源全平台; 这与 CourseProduct per-org 不同）
 */

async function publicList({ category, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { isPublished: true }
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

async function publicDetail({ id }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Article.findOne({ _id: id, isPublished: true })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('文章不存在或已下架')
  return doc
}

async function bumpViewCount({ id, activeStudentId }) {
  if (!mongoose.isValidObjectId(id)) return
  await Article.updateOne({ _id: id }, { $inc: { viewCount: 1 } })
  // 2026-07-04 运营分析: 文章按 activeStudentId 记事件 (sessionMs=0)
  // 2026-07-14 改造: record 不再需 orgId, 内部从 activeStudentId 反查 kid.org
  engagement.record({
    contentType: 'article',
    contentId: id,
    activeStudentId,
    sessionMs: 0,
    source: 'client'
  }).catch(() => {})
}

// ───── admin 端 ─────

// 2026-07-04: admin 单条详情 — 不过滤 isPublished (草稿也能编辑), 含 contentMarkdown/contentHtml
// 2026-07-14: 平台级内容, 不再按 org 隔离
async function adminDetail(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Article.findOne({ _id: id })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('文章不存在')
  return doc
}

async function adminList({ isPublished, category, keyword, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = {}
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
  const doc = await Article.findOneAndUpdate(
    { _id: id },
    update,
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('文章不存在')
  return doc
}

// 软下架: isPublished=false (避免物理删除, 草稿态可恢复)
async function softRemove({ id, userId }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Article.findOneAndUpdate(
    { _id: id },
    { isPublished: false, updatedBy: userId },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('文章不存在')
  return { ok: true, id: String(doc._id) }
}

// =====================================================================
// 物理删除 (2026-07-04 立项, 平台超管专属 — 走 requirePlatformPassword 中间件)
//  - 2026-07-14 改造: 内容回退 platform-only, usageChecks filter 不带 org
//    (ContentEngagement 仍 per-org; event 归属哪个 org 与内容 org 无关, 平台级内容跨 org 引用)
//  - 互锁内容: 删除路线: findOne(存在) → assertUnused(挡下游引用) → deleteOne
//  - 不 cascade delete ContentEngagement, 走 CourseProduct 同款「先清理再删」挡板
//  - 互锁检查声明 articleUsageChecks 函数被 remove + removableCheck 共用
// =====================================================================

function articleUsageChecks(articleId) {
  return [
    {
      model: ContentEngagement,
      filter: { contentType: 'article', contentId: articleId },
      label: '用户行为事件',
      hint: '存在 C 端家长孩子的访问/阅读记录, 请先评估影响或保留文章'
    }
  ]
}

async function remove(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Article.findOne({ _id: id }).select('_id').lean()
  if (!doc) throw ApiError.notFound('文章不存在')

  await removable.assertUnused(null, articleUsageChecks(id))

  await Article.deleteOne({ _id: id })
  return { success: true, id }
}

async function removableCheck(id) {
  if (!mongoose.isValidObjectId(id)) {
    return { canRemove: false, blockers: [{ entity: 'Article', label: '文章', count: 0, hint: 'id 非法' }] }
  }
  const doc = await Article.findOne({ _id: id }).select('_id').lean()
  if (!doc) {
    return { canRemove: false, blockers: [{ entity: 'Article', label: '文章', count: 0, hint: '该文章不存在' }] }
  }
  return removable.check(null, articleUsageChecks(id))
}

module.exports = {
  publicList,
  publicDetail,
  bumpViewCount,
  adminList,
  adminDetail,    // 2026-07-04 新增: 含 markdown 大字段, 用于 edit dialog 回填
  create,
  update,
  softRemove,
  remove,
  removableCheck
}
