'use strict'

const s = require('./financeAccount.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await s.listAccounts(req.orgId, req.query)
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  res.json(ApiResponse.ok(await s.getAccount(req.orgId, req.params.id)))
}

exports.create = async (req, res) => {
  const data = await s.createAccount(req.orgId, req.body, req.user && (req.user._id || req.user.id))
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  res.json(ApiResponse.ok(await s.updateAccount(req.orgId, req.params.id, req.body)))
}

// 物理删除：超管+密码二次确认 (requirePlatformPassword, 路由层)
// 业务硬门挡 balance !== 0 + isPrimary; 互锁检查 FinanceTransaction.account
exports.remove = async (req, res) => {
  res.json(ApiResponse.ok(await s.removeAccount(req.orgId, req.params.id)))
}

exports.removableCheck = async (req, res) => {
  res.json(ApiResponse.ok(await s.removableCheck(req.orgId, req.params.id)))
}

exports.getPrimary = async (req, res) => {
  const a = await s.getPrimaryAccount(req.orgId)
  res.json(ApiResponse.ok(a || null))
}
