'use strict'

const ApiResponse = require('@utils/ApiResponse')

/**
 * 经营看板 controller
 *
 * 5 个端点全部 GET，统一把 req.orgId + req.query 透传给 service 做多租户隔离 + range 解析。
 * 入参 `?range=today|week|month|custom&from=ISO&to=ISO`（可选；默认 month）；
 * 后端忽略未识别值，回落 month。
 *
 * 2026-06 重构：service 拆成 5 个文件 + report.shared.js；本文件仅承担 require 路由 + 透传职责。
 */

const services = {
  overview:            require('./overview.service'),
  lessonConsumption:   require('./lessonConsumption.service'),
  roomUtilization:     require('./roomUtilization.service'),
  teacherProductivity: require('./teacherProductivity.service'),
  pointsActivity:      require('./pointsActivity.service'),
  recruit:             require('./recruit.service')   // 2026-06 招生看板
}

exports.overview = async (req, res) => {
  const data = await services.overview({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.lessonConsumption = async (req, res) => {
  const data = await services.lessonConsumption({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.roomUtilization = async (req, res) => {
  const data = await services.roomUtilization({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.teacherProductivity = async (req, res) => {
  const data = await services.teacherProductivity({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.pointsActivity = async (req, res) => {
  const data = await services.pointsActivity({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

// ─── 招生看板 (2026-06 新增) ─────────────────────
exports.recruitPromoter = async (req, res) => {
  const data = await services.recruit.recruitPromoter({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.recruitTeacherConversion = async (req, res) => {
  const data = await services.recruit.recruitTeacherConversion({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}
