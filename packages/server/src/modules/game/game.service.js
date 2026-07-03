'use strict'

const mongoose = require('mongoose')
const Game = require('@models/Game.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')

/**
 * 关键点:
 *   - 2026-07-03 内容下放到 per-org: 所有 filter 加 org = <req.orgId>
 *   - public/admin 端都强制 req.orgId; null/undefined 直接 400
 *   - playCount 用 $inc 原子更, 不加事务
 */

async function publicList({ orgId, tag, difficulty, page, pageSize }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  const p = normalizePagination({ page, pageSize, defaultPageSize: 12 })
  const filter = { isPublished: true, org: orgId }
  if (tag) filter.tags = tag
  if (difficulty) filter.difficulty = difficulty
  const [items, total] = await Promise.all([
    Game.find(filter)
      .populate('coverFile', 'url mime size')
      .sort({ publishedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Game.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function publicDetail({ id, orgId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Game.findOne({ _id: id, isPublished: true, org: orgId })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('游戏不存在或已下架')
  return doc
}

// 启动计数, 不强制登录
async function bumpPlayCount({ id, orgId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Game.findOneAndUpdate(
    { _id: id, isPublished: true, org: orgId },
    { $inc: { playCount: 1 } },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('游戏不存在或已下架')
  return { ok: true, playCount: doc.playCount, launchUrl: doc.launchUrl }
}

// ───── admin 端 ─────

async function adminList({ orgId, isPublished, keyword, page, pageSize }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (isPublished !== undefined && isPublished !== '') {
    filter.isPublished = isPublished === 'true' || isPublished === true
  }
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  const [items, total] = await Promise.all([
    Game.find(filter)
      .populate('coverFile', 'url mime size')
      .sort({ updatedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Game.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function create({ orgId, payload, userId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!payload.launchUrl) throw ApiError.badRequest('launchUrl 必填')
  const doc = await Game.create({
    org: orgId,
    name: payload.name,
    intro: payload.intro || '',
    launchUrl: payload.launchUrl,
    coverFile: payload.coverFile || null,
    coverUrl: payload.coverUrl || '',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    difficulty: payload.difficulty || '',
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
  if (payload.name !== undefined) update.name = payload.name
  if (payload.intro !== undefined) update.intro = payload.intro
  if (payload.launchUrl !== undefined) update.launchUrl = payload.launchUrl
  if (payload.coverFile !== undefined) update.coverFile = payload.coverFile
  if (payload.coverUrl !== undefined) update.coverUrl = payload.coverUrl
  if (payload.tags !== undefined) update.tags = Array.isArray(payload.tags) ? payload.tags : []
  if (payload.difficulty !== undefined) update.difficulty = payload.difficulty
  if (payload.isPublished !== undefined) {
    update.isPublished = !!payload.isPublished
    if (payload.isPublished) update.publishedAt = new Date()
  }
  const doc = await Game.findOneAndUpdate(
    { _id: id, org: orgId },
    update,
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('游戏不存在或无权修改')
  return doc
}

async function softRemove({ id, orgId, userId }) {
  if (!orgId) throw ApiError.badRequest('请指定机构 (x-org-id)')
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Game.findOneAndUpdate(
    { _id: id, org: orgId },
    { isPublished: false, updatedBy: userId },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('游戏不存在或无权操作')
  return { ok: true, id: String(doc._id) }
}

module.exports = {
  publicList,
  publicDetail,
  bumpPlayCount,
  adminList,
  create,
  update,
  softRemove
}
