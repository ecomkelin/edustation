'use strict'

const mongoose = require('mongoose')
const Game = require('@models/Game.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')

async function publicList({ tag, difficulty, page, pageSize }) {
  const p = normalizePagination({ page, pageSize, defaultPageSize: 12 })
  const filter = { isPublished: true, org: null }
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

async function publicDetail(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Game.findOne({ _id: id, isPublished: true, org: null })
    .populate('coverFile', 'url mime size')
    .lean()
  if (!doc) throw ApiError.notFound('游戏不存在或已下架')
  return doc
}

// 启动计数, 不强制登录
async function bumpPlayCount({ id }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Game.findOneAndUpdate(
    { _id: id, isPublished: true, org: null },
    { $inc: { playCount: 1 } },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('游戏不存在或已下架')
  return { ok: true, playCount: doc.playCount, launchUrl: doc.launchUrl }
}

// ───── admin 端 ─────

async function adminList({ isPublished, keyword, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: null }
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

async function create({ payload, userId }) {
  if (!payload.launchUrl) throw ApiError.badRequest('launchUrl 必填')
  const doc = await Game.create({
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

async function update({ id, payload, userId }) {
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
  const doc = await Game.findByIdAndUpdate(id, update, { new: true }).lean()
  if (!doc) throw ApiError.notFound('游戏不存在')
  return doc
}

async function softRemove({ id, userId }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('id 非法')
  const doc = await Game.findByIdAndUpdate(
    id,
    { isPublished: false, updatedBy: userId },
    { new: true }
  ).lean()
  if (!doc) throw ApiError.notFound('游戏不存在')
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
