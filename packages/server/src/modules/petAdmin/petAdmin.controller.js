'use strict'

const s = require('./petAdmin.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const { page, pageSize, state, tier, keyword } = req.query
  res.json(ApiResponse.ok(await s.list({
    orgId: req.orgId,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20,
    state: state || undefined,
    tier: tier || undefined,
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
  const { page, pageSize, petAccountId, studentId, type } = req.query
  res.json(ApiResponse.ok(await s.listEvents({
    orgId: req.orgId,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 30,
    petAccountId: petAccountId || undefined,
    studentId: studentId || undefined,
    type: type || undefined
  })))
}

exports.update = async (req, res) => {
  res.json(ApiResponse.ok(await s.update({
    orgId: req.orgId,
    petAccountId: req.params.id,
    operatorId: req.user?._id,
    payload: req.body || {}
  })))
}

// ─── 2026-06-21 pet-system-v2-ext：老师/admin 代操作 6 端点 ───

exports.adoptOnBehalf = async (req, res) => {
  res.status(201).json(ApiResponse.created(await s.adoptOnBehalf({
    orgId: req.orgId,
    studentId: req.body.studentId,
    operatorId: req.user?._id
  })))
}

exports.feedOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.feedOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    consumableKey: req.body.consumableKey,
    operatorId: req.user?._id
  })))
}

exports.hatchOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.hatchOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    operatorId: req.user?._id
  })))
}

exports.swapEggOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.swapEggOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    operatorId: req.user?._id
  })))
}

exports.tierDownOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.tierDownOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    targetTier: req.body.targetTier,
    operatorId: req.user?._id
  })))
}

exports.equipOnBehalf = async (req, res) => {
  res.json(ApiResponse.ok(await s.equipOnBehalf({
    orgId: req.orgId,
    petAccountId: req.params.id,
    slot: req.body.slot,
    itemKey: req.body.itemKey,
    operatorId: req.user?._id
  })))
}

// ─── 课堂展示页 polling 支持：按 studentId 拿 PetAccount ───

exports.getByStudent = async (req, res) => {
  res.json(ApiResponse.ok(await s.getByStudent({
    orgId: req.orgId,
    studentId: req.query.studentId
  })))
}
