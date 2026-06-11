'use strict'

const service = require('./auth.service')
const ApiResponse = require('@utils/ApiResponse')
const config = require('@config/index')

exports.login = async (req, res) => {
  const ip = req.ip
  const ua = req.headers['user-agent'] || ''
  const result = await service.login({
    mobile: req.body.mobile,
    password: req.body.password,
    ip,
    userAgent: ua
  })
  setRefreshCookie(res, result.refreshToken)
  res.json(ApiResponse.ok({
    accessToken: result.accessToken,
    user: result.user
  }))
}

exports.refresh = async (req, res) => {
  const token = req.cookies[config.cookie.name]
  const result = await service.refresh({
    refreshToken: token,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || ''
  })
  setRefreshCookie(res, result.refreshToken)
  res.json(ApiResponse.ok({ accessToken: result.accessToken }))
}

exports.logout = async (req, res) => {
  const token = req.cookies[config.cookie.name]
  await service.logout({ refreshToken: token })
  // 清理 cookie
  res.clearCookie(config.cookie.name, { path: config.cookie.path })
  res.json(ApiResponse.ok())
}

exports.me = async (req, res) => {
  const data = await service.me(req.user.id)
  res.json(ApiResponse.ok(data))
}

function setRefreshCookie(res, token) {
  res.cookie(config.cookie.name, token, {
    httpOnly: config.cookie.httpOnly,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: config.cookie.path,
    maxAge: config.cookie.maxAgeMs
  })
}
