'use strict'

const s = require('./financeTransaction.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await s.listTransactions(req.orgId, req.query)
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  res.json(ApiResponse.ok(await s.getTransaction(req.orgId, req.params.id)))
}

exports.create = async (req, res) => {
  const data = await s.recordTransaction(req.orgId, {
    ...req.body,
    operator: req.user && (req.user._id || req.user.id)
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.transfer = async (req, res) => {
  const data = await s.transferAccounts(req.orgId, {
    ...req.body,
    operator: req.user && (req.user._id || req.user.id)
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.summary = async (req, res) => {
  res.json(ApiResponse.ok(await s.getSummary(req.orgId, req.query)))
}
