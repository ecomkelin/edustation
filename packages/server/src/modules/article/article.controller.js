'use strict'

const s = require('./article.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * C 端公开端点
 */
exports.list = async (req, res) => {
  const r = await s.publicList({
    category: req.query.category,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.detail = async (req, res) => {
  const r = await s.publicDetail(req.params.id)
  // +1 viewCount (原子更新, 失败不影响详情返回)
  s.bumpViewCount(req.params.id).catch(() => {})
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
