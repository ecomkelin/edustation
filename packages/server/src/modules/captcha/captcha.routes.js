'use strict'

const router = require('express').Router()
const c = require('./captcha.controller')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')

// 2026-08-05: per-IP 限流 (审计 M15 装饰性被绕过堵口)
//   之前 /challenge /verify 完全开放, 脚本可循环 GET challenge → 暴力枚举 x (容差 10px, 230px 宽,
//   约 8.7% 命中 ≈ 12 次尝试过 1 次) → 解锁 per-mobile 锁定后继续暴破 /auth/login.
//   现在 per-IP 固定窗口限流: 5 分钟内 60 次 challenge/verify, 超即 429.
//   注意: 部署多实例需换 Redis (与 loginRateLimit 同样 TODO).
const CAPTCHA_RL_MAX = Number(process.env.CAPTCHA_RL_IP_MAX || 60)
const CAPTCHA_RL_WINDOW_MS = Number(process.env.CAPTCHA_RL_WINDOW_MS || 5 * 60 * 1000)
const ipBuckets = new Map() // ip -> { count, windowStart }

function captchaRateLimit(req, res, next) {
  const ip = req.ip || 'unknown'
  const now = Date.now()
  let b = ipBuckets.get(ip)
  if (!b || (now - b.windowStart) >= CAPTCHA_RL_WINDOW_MS) {
    b = { count: 0, windowStart: now }
    ipBuckets.set(ip, b)
  }
  b.count += 1
  if (b.count > CAPTCHA_RL_MAX) {
    const retryAfterMs = Math.max(0, CAPTCHA_RL_WINDOW_MS - (now - b.windowStart))
    res.set('Retry-After', Math.ceil(retryAfterMs / 1000))
    return next(ApiError.tooManyRequests('captcha 请求过于频繁, 请稍后再试', { retryAfterMs }))
  }
  next()
}

// 定时清理过期桶 (1h 一次)
setInterval(() => {
  const cutoff = Date.now() - CAPTCHA_RL_WINDOW_MS
  for (const [ip, b] of ipBuckets.entries()) {
    if (b.windowStart < cutoff) ipBuckets.delete(ip)
  }
}, 60 * 60 * 1000).unref()

// 挑战: 前端调用拿到 SVG + token
// R-0110 GET /captcha/challenge
router.get('/challenge', captchaRateLimit, asyncHandler(c.issue))
// 校验: 前端拖完提交答案
// R-0111 POST /captcha/verify
router.post('/verify', captchaRateLimit, asyncHandler(c.verify))

module.exports = router
