'use strict'

const config = require('@config/index')
const ApiError = require('@utils/ApiError')

/**
 * 通用 per-IP 限流中间件 (2026-08)
 *
 * 复用 loginRateLimit 的"固定窗口 + 触发即封"算法, 但只走 IP 线。
 * 用于 wx-login / wx-bind / wx-refresh —— 这些端点 body 无 mobile,
 * loginRateLimit 从 req.body.mobile 取 key 会空跑, 故独立一个轻量限流。
 *
 * 微信侧 code 一次性 + 自身频控已防单账号爆破, 这里只防 IP 爆刷。
 *
 * 配置: config.rateLimit.wx (env: WX_RL_*)
 * 部署: 进程内 Map, 单实例 (多实例需换 Redis, 同 loginRateLimit)。
 *
 * 用法: router.post('/wx-login', ipRateLimit(), asyncHandler(c.wxLogin))
 *       不同端点可传 { max, windowMs, lockMs } 覆盖默认值。
 */
const buckets = new Map() // ip -> { count, windowStart, blockedUntil }

function getBucket(ip) {
  let b = buckets.get(ip)
  if (!b) {
    b = { count: 0, windowStart: 0, blockedUntil: 0 }
    buckets.set(ip, b)
  }
  return b
}

function check(ip, max, windowMs, lockMs) {
  const now = Date.now()
  const b = getBucket(ip)
  // 还在锁定期: 直接拒绝, 不计数
  if (b.blockedUntil > now) {
    return { allowed: false, retryAfterMs: b.blockedUntil - now }
  }
  // 进入新窗口: 重置计数
  if (now - b.windowStart >= windowMs) {
    b.count = 0
    b.windowStart = now
  }
  b.count += 1
  if (b.count > max) {
    b.blockedUntil = now + lockMs
    return { allowed: false, retryAfterMs: lockMs }
  }
  return { allowed: true }
}

module.exports = function ipRateLimit(opts = {}) {
  const max = opts.max || config.rateLimit.wx.ipMax
  const windowMs = opts.windowMs || config.rateLimit.wx.windowMs
  const lockMs = opts.lockMs || config.rateLimit.wx.ipLockMs

  return function ipRateLimitMiddleware(req, res, next) {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown'
    const result = check(ip, max, windowMs, lockMs)
    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000))
      const minutes = Math.max(1, Math.ceil(result.retryAfterMs / 60_000))
      return next(
        ApiError.tooManyRequests(`请求过于频繁，请 ${minutes} 分钟后再试`, {
          reason: 'ip',
          retryAfterMs: result.retryAfterMs
        })
      )
    }
    next()
  }
}

// 测试用: 重置所有桶
module.exports._reset = () => buckets.clear()
