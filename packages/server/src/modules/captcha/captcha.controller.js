'use strict'

const service = require('./captcha.service')
const ApiResponse = require('@utils/ApiResponse')

exports.issue = async (_req, res) => {
  const data = service.issue()
  res.json(ApiResponse.ok(data))
}

exports.verify = async (req, res) => {
  const { token, x, track } = req.body || {}
  const data = service.verify({ token, x, track })
  res.json(ApiResponse.ok(data))
}
