'use strict'

/**
 * 微信小程序开放接口封装 (2026-08)
 *
 * 后端调用微信平台的三个接口:
 *   - jscode2session      wx.login 的 code → openid
 *   - getuserphonenumber  getPhoneNumber 的 code → 手机号 (新版, 不需 session_key 解密)
 *   - getwxacodeunlimit   生成带参小程序码 (P1 邀请码入口用)
 *
 * 设计:
 *   - 全部用原生 fetch (Node18+ 全局; 对齐 agent.service.js 的用法)
 *   - 平台 access_token 进程内缓存 (提前 5 分钟续; 多实例部署需换 Redis)
 *   - 微信 errcode 永不透传前端, 统一抛 ApiError.badRequest('微信服务异常')
 *     (原始 errmsg 仅打 warn 日志, 防信息泄漏)
 *   - WX_MINI_APPID/SECRET 未配置时抛 503 (不崩进程, 不进 envValidator REQUIRED)
 *
 * 文档:
 *   - https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
 *   - https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-info/getPhoneNumber.html
 *   - https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/getwxacodeunlimit.html
 */

const ApiError = require('@utils/ApiError')
const config = require('@config/index')

const BASE_URL = 'https://api.weixin.qq.com'

// 平台 access_token 缓存 (进程内)
let _accessToken = { token: '', expiresAt: 0 }

function ensureConfig() {
  const { appId, secret } = config.wechat.mini
  if (!appId || !secret) {
    throw new ApiError(503, '微信小程序未配置 (WX_MINI_APPID/SECRET)', { reason: 'wx_not_configured' })
  }
  return { appId, secret }
}

/**
 * 微信接口统一错误处理: errcode !== 0 → 抛 ApiError。
 * 注意 jscode2session / token 成功时不带 errcode (视为 0)。
 */
function assertWxOk(json, fallbackMsg) {
  const errcode = json && typeof json.errcode === 'number' ? json.errcode : 0
  if (errcode !== 0) {
    // eslint-disable-next-line no-console
    console.warn(`[wechat] 微信接口错误: errcode=${errcode} errmsg=${json && json.errmsg}`)
    throw ApiError.badRequest(fallbackMsg || '微信服务异常,请稍后重试')
  }
}

async function fetchJson(url, options, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal })
    let json
    try {
      json = await resp.json()
    } catch (_) {
      throw ApiError.internal(`微信响应非 JSON (HTTP ${resp.status})`)
    }
    return json
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (e.name === 'AbortError') throw ApiError.internal('微信请求超时')
    throw ApiError.internal(`微信请求失败: ${e.message}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 获取平台 access_token (getuserphonenumber / getwxacodeunlimit 共用)。
 * 缓存到 expiresAt 前 5 分钟, 避免临界过期。
 */
async function getPlatformAccessToken() {
  const now = Date.now()
  if (_accessToken.token && now < _accessToken.expiresAt - 5 * 60 * 1000) {
    return _accessToken.token
  }
  const { appId, secret } = ensureConfig()
  const url =
    `${BASE_URL}/cgi-bin/token?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`
  const json = await fetchJson(url, { method: 'GET' })
  assertWxOk(json, '微信 access_token 获取失败')
  _accessToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in || 7200) * 1000
  }
  return _accessToken.token
}

/**
 * jscode2session: wx.login 的 code 换 openid。
 * session_key / unionid 用后即弃 (本项目只用 openid 做身份标识;
 * 不绑微信开放平台, 不依赖 unionid 做跨端打通)。
 *
 * @param {string} code - wx.login 返回的 code (一次性, 5 分钟有效)
 * @returns {Promise<{ openid: string }>}
 */
async function jscode2session(code) {
  const { appId, secret } = ensureConfig()
  const url =
    `${BASE_URL}/sns/jscode2session?grant_type=authorization_code` +
    `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}`
  const json = await fetchJson(url, { method: 'GET' })
  assertWxOk(json, '微信登录 code 无效或已过期')
  return { openid: json.openid }
}

/**
 * getuserphonenumber: <button open-type="getPhoneNumber"> 的 code 换手机号。
 * 手机号由后端向微信换取, 永不信任客户端提交的明文手机号。
 *
 * @param {string} phoneCode - getPhoneNumber 事件 e.detail.code
 * @returns {Promise<string>} 纯净大陆 11 位手机号
 */
async function getPhoneNumber(phoneCode) {
  const accessToken = await getPlatformAccessToken()
  const url = `${BASE_URL}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`
  const json = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: phoneCode })
  })
  assertWxOk(json, '微信手机号授权失败')
  const mobile = json.phone_info && json.phone_info.phoneNumber
  if (!mobile || !/^1[3-9]\d{9}$/.test(mobile)) {
    throw ApiError.badRequest('微信返回的手机号格式异常')
  }
  return mobile
}

/**
 * getWXACodeUnlimit: 生成带参小程序码 (P1 邀请码入口用)。
 * scene 最长 32 字节; 成功返回 PNG buffer, 失败返回 JSON。
 *
 * @param {string} scene  - 小程序码携带的 scene 参数 (如邀请短码)
 * @param {string} page   - 落地页 (如 'pages/auth/login')
 * @returns {Promise<Buffer>} PNG 图片 buffer
 */
async function getWXACodeUnlimit(scene, page, envVersion) {
  const accessToken = await getPlatformAccessToken()
  const url = `${BASE_URL}/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`
  const body = { scene, page, check_path: false }
  if (envVersion) body.envVersion = envVersion

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (e) {
    if (e.name === 'AbortError') throw ApiError.internal('微信小程序码请求超时')
    throw ApiError.internal(`微信小程序码请求失败: ${e.message}`)
  } finally {
    clearTimeout(timer)
  }

  const buffer = Buffer.from(await resp.arrayBuffer())
  // 失败时微信返回 JSON (content-type: application/json), 成功返回 image/*
  const contentType = resp.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    let json
    try {
      json = JSON.parse(buffer.toString('utf8'))
    } catch (_) {
      json = {}
    }
    assertWxOk(json, '微信小程序码生成失败')
  }
  return buffer
}

module.exports = {
  jscode2session,
  getPhoneNumber,
  getPlatformAccessToken,
  getWXACodeUnlimit
}
