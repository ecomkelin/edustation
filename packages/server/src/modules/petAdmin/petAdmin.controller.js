'use strict'

const s = require('./petAdmin.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const { page, pageSize, state, keyword } = req.query
  res.json(ApiResponse.ok(await s.list({
    orgId: req.orgId,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20,
    state: state || undefined,
    keyword: keyword || undefined
  })))
}

exports.get = async (req, res) => {
  res.json(ApiResponse.ok(await s.get({
    orgId: req.orgId,
    petAccountId: req.params.id
  })))
}

exports.listEvents = async (req, res) => {
  const { petAccountId, studentId, type, cursor, limit } = req.query
  res.json(ApiResponse.ok(await s.listEvents({
    orgId: req.orgId,
    petAccountId: petAccountId || undefined,
    studentId: studentId || undefined,
    type: type || undefined,
    cursor: cursor || undefined,
    limit: limit ? Number(limit) : 30
  })))
}

exports.update = async (req, res) => {
  res.json(ApiResponse.ok(await s.update({
    orgId: req.orgId,
    petAccountId: req.params.id,
    operatorId: req.user?.id,
    payload: req.body || {}
  })))
}

// ─── 老师/admin 代操作（去 swap/tier/equip） ───

exports.adoptOnBehalf = async (req, res) => {
  res.status(201).json(ApiResponse.created(await s.adoptOnBehalf({
    orgId: req.orgId,
    studentId: req.body.studentId,
    operatorId: req.user?.id
  })))
}

exports.feedOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.feedOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    consumableKey: req.body.consumableKey,
    operatorId: req.user?.id
  })))
}

exports.hatchOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.hatchOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    operatorId: req.user?.id
  })))
}

exports.setDefaultOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.setDefaultOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    operatorId: req.user?.id
  })))
}

// ─── 课堂展示页 polling 支持：按 studentId 拿 PetAccount ───

exports.getByStudent = async (req, res) => {
  res.json(ApiResponse.ok(await s.getByStudent({
    orgId: req.orgId,
    studentId: req.query.studentId
  })))
}
