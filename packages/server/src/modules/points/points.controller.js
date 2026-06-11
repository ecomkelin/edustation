'use strict'

const s = require('./points.service')
const ApiResponse = require('@utils/ApiResponse')

exports.me = async (req, res) => {
  const student = req.query.student || req.activeStudentId
  res.json(ApiResponse.ok(await s.me({ orgId: req.orgId, student })))
}

exports.earn = async (req, res) => res.json(ApiResponse.ok(await s.earn({ orgId: req.orgId, ...req.body })))

exports.transactions = async (req, res) => {
  const student = req.query.student || req.activeStudentId
  res.json(ApiResponse.ok(await s.transactions({ orgId: req.orgId, student })))
}
