'use strict'

const s = require('./pointsAdmin.service')
const ApiResponse = require('@utils/ApiResponse')

exports.listAccounts = async (req, res) => {
  const { page, pageSize, keyword, sortBy } = req.query
  const data = await s.listAccounts({ orgId: req.orgId, page, pageSize, keyword, sortBy })
  res.json(ApiResponse.ok(data))
}

exports.getAccount = async (req, res) => {
  const data = await s.getAccount({ orgId: req.orgId, studentId: req.params.studentId })
  res.json(ApiResponse.ok(data))
}

exports.adjust = async (req, res) => {
  const data = await s.adjust({
    orgId: req.orgId,
    studentId: req.params.studentId,
    operatorId: req.user && req.user.id,
    body: req.body
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.listTransactions = async (req, res) => {
  const { page, pageSize, studentId, trigger, from, to } = req.query
  const data = await s.listTransactions({ orgId: req.orgId, page, pageSize, studentId, trigger, from, to })
  res.json(ApiResponse.ok(data))
}

exports.listReasons = async (req, res) => {
  const data = await s.listReasons({ orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}
