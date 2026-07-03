'use strict'

const s = require('./video.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * C 端公开端点
 */

// R-3800 英雄位: 返回最新 1 个发布的视频
exports.featured = async (req, res) => {
  const r = await s.publicFeatured()
  res.json(ApiResponse.ok(r))
}

// R-3801 C 端公开列表 (published + 分页)
exports.list = async (req, res) => {
  const r = await s.publicList({
    category: req.query.category,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

// R-3802 C 端公开详情 (+1 viewCount)
exports.detail = async (req, res) => {
  const r = await s.publicDetail(req.params.id)
  // 详情时也 bump 一次, 失败不影响返回
  s.bumpViewCount(req.params.id).catch(() => {})
  res.json(ApiResponse.ok(r))
}

// R-3803 C 端播放/启动计数 (+1, 需鉴权)
exports.play = async (req, res) => {
  const r = await s.bumpViewCount(req.params.id)
  res.json(ApiResponse.ok(r))
}

/**
 * admin 端 CRUD
 */

exports.adminList = async (req, res) => {
  const r = await s.adminList({
    isPublished: req.query.isPublished,
    category: req.query.category,
    keyword: req.query.keyword,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.create = async (req, res) => {
  const r = await s.create({
    payload: req.body,
    userId: req.user.id
  })
  res.status(201).json(ApiResponse.created(r))
}

exports.update = async (req, res) => {
  const r = await s.update({
    id: req.params.id,
    payload: req.body,
    userId: req.user.id
  })
  res.json(ApiResponse.ok(r))
}

exports.remove = async (req, res) => {
  const r = await s.softRemove({
    id: req.params.id,
    userId: req.user.id
  })
  res.json(ApiResponse.ok(r))
}
