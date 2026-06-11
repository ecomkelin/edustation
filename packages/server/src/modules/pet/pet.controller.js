'use strict'

const s = require('./pet.service')
const ApiResponse = require('@utils/ApiResponse')

exports.me = async (req, res) => {
  const student = req.query.student || req.activeStudentId
  res.json(ApiResponse.ok(await s.me({ orgId: req.orgId, student })))
}

exports.feed = async (req, res) => {
  const student = req.body.student || req.activeStudentId
  res.json(ApiResponse.ok(await s.feed({ orgId: req.orgId, student })))
}
