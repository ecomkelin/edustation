'use strict'

const service = require('./auth.service')
const wxAuthService = require('./wx-auth.service')
const ApiResponse = require('@utils/ApiResponse')
const config = require('@config/index')

exports.login = async (req, res) => {
  const ip = req.ip
  const ua = req.headers['user-agent'] || ''
  const result = await service.login({
    mobile: req.body.mobile,
    password: req.body.password,
    ip,
    userAgent: ua,
    captchaPass: req.body.captchaPass,
    rateLimit: req.loginRateLimit
  })
  // 登录成功 → 清掉该 mobile 的限流桶 (登录防刷, 2026-06)
  // IP 桶不清, 防 "1 真账号 + N 假账号" 混合扫绕过
  if (req.loginRateLimit && typeof req.loginRateLimit.clearMobile === 'function') {
    req.loginRateLimit.clearMobile()
  }
  setRefreshCookie(res, result.refreshToken)
  res.json(ApiResponse.ok({
    accessToken: result.accessToken,
    user: result.user,
    // 招生试听 (2026-06): 试听转化建的家长账号首登强改; 前端拦截器据此跳改密页
    requirePasswordChange: result.requirePasswordChange,
    // 法律协议 (2026-06): 平台级未对齐版本协议清单 (登录时机构未确定, 只算平台级)
    pendingConsents: result.pendingConsents || []
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
  // 法律协议 (2026-06): 透传 req.orgId 让 service 把"该机构内未对齐的协议"也算进
  // pendingConsents. /me 路由不要求 requireOrg, 所以 orgId 可能为 undefined → 只算平台级.
  const data = await service.me(req.user.id, { orgId: req.orgId || null })
  res.json(ApiResponse.ok(data))
}

// 自助修改资料：只允许 realName / avatar / idCard / region
exports.updateMe = async (req, res) => {
  // 透传当前 orgId 给 service.me, 保证 update 后返回的 pendingConsents 含机构维度
  const data = await service.updateMe(req.user.id, req.body, { orgId: req.orgId || null })
  res.json(ApiResponse.ok(data))
}

// 自助修改密码：oldPassword + newPassword
exports.changePassword = async (req, res) => {
  await service.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword)
  res.json(ApiResponse.ok())
}

// ─── 微信小程序登录 (2026-08) ───
// 小程序不依赖 cookie: refresh token 走响应体, 由客户端 storage 自管。
// service 返回 { status, accessToken?, refreshToken?, user? }, controller 原样透传。

// R-0106 微信静默登录 (老用户; 未绑定返 need_bind)
exports.wxLogin = async (req, res) => {
  const result = await wxAuthService.wxLogin({
    code: req.body.code,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || ''
  })
  res.json(ApiResponse.ok(result))
}

// R-0107 微信绑定 / 自助注册
exports.wxBind = async (req, res) => {
  const result = await wxAuthService.wxBind({
    loginCode: req.body.loginCode,
    phoneCode: req.body.phoneCode,
    scene: req.body.scene,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || ''
  })
  res.json(ApiResponse.ok(result))
}

// R-0108 微信刷新 (复用 service.refresh, 但从 body 读 token、不写 cookie、新 token 回 body)
exports.wxRefresh = async (req, res) => {
  const result = await service.refresh({
    refreshToken: req.body.refreshToken,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || ''
  })
  res.json(ApiResponse.ok({ accessToken: result.accessToken, refreshToken: result.refreshToken }))
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
