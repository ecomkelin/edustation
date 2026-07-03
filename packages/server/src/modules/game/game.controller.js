'use strict'

const s = require('./game.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const r = await s.publicList({
    tag: req.query.tag,
    difficulty: req.query.difficulty,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.detail = async (req, res) => {
  const r = await s.publicDetail(req.params.id)
  res.json(ApiResponse.ok(r))
}

exports.play = async (req, res) => {
  const r = await s.bumpPlayCount({ id: req.params.id, userId: req.user && req.user.id })
  res.json(ApiResponse.ok(r))
}

// admin 端

exports.adminList = async (req, res) => {
  const r = await s.adminList({
    isPublished: req.query.isPublished,
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
  const r = await s.softRemove({ id: req.params.id, userId: req.user.id })
  res.json(ApiResponse.ok(r))
}
