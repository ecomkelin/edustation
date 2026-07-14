'use strict'

const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')
const s = require('./agentConfig.service')

/**
 * R-2840 GET /agent/config — 公开给登录用户
 * 返回 DB 行; DB 无行时返「空 + env 默认」展示态, 便于前端表单渲染初始值.
 */
exports.get = async (req, res) => {
  res.json(ApiResponse.ok(await s.get()))
}

/**
 * R-2841 PUT /agent/config — 仅平台超管
 * 路由层已挂 requirePlatformAdmin, 这里二次校验保险.
 */
exports.update = async (req, res) => {
  if (!req.user.isPlatformAdmin) throw ApiError.forbidden('仅平台超管可修改')
  res.json(ApiResponse.ok(await s.update(req.body || {})))
}