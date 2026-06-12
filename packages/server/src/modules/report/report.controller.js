'use strict'

const s = require('./report.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 经营看板 controller
 *
 * 5 个端点全部 GET，统一把 req.orgId 透传给 service 做多租户隔离。
 * 入参 `?range=today|week|month|custom&from=ISO&to=ISO`（可选；默认 month）；
 * 后端忽略未识别值，回落 month。
 */

exports.overview = async (req, res) => {
  const data = await s.overview({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.lessonConsumption = async (req, res) => {
  const data = await s.lessonConsumption({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.roomUtilization = async (req, res) => {
  const data = await s.roomUtilization({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.teacherProductivity = async (req, res) => {
  const data = await s.teacherProductivity({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.pointsActivity = async (req, res) => {
  const data = await s.pointsActivity({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}
