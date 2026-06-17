'use strict'

const config = require('@config/index')
const ApiError = require('@utils/ApiError')

/**
 * 登录防刷中间件 (2026-06)
 *
 * 两条独立限流线, 任意一条超阈值即 429:
 *  - per-mobile: 防针对某账号的暴力破解 (阈值更严)
 *  - per-ip:     防分布式 / 同源多账号扫     (阈值更宽)
 *
 * 算法: 固定窗口 + 触发即封 lockMs.
 *  - 当前窗口计数 > max → blockedUntil = now + lockMs, 期间内该 key 所有 /login 请求直接 429
 *  - 跨窗口自动重置计数
 *  - 成功登录: 走 req.loginRateLimit.clearMobile() 清掉该 mobile 桶
 *    (不清 IP 桶 —— 一个 IP 用 1 真账号 + N 假账号扫也应被卡)
 *
 * 关键约束: 必须挂在 `v.loginVD` + `mws.validateRequest` **之后**, 否则攻击者用
 * 垃圾 mobile 也能把任意号码的桶打满 (DoS 正常用户). 校验通过的请求才计数.
 *
 * 部署: 进程内 Map, 单实例. 多实例部署需换 Redis (TODO 阶段 2).
 *
 * 配置: config.rateLimit.login (env: LOGIN_RL_*)
 *
 * 失败响应:
 *  - 429 + Retry-After 头 (秒)
 *  - 错误 data 含 { reason: 'mobile' | 'ip', retryAfterMs }
 */
module.exports = function loginRateLimit(req, res, next) {
  const c = config.rateLimit.login
  // validator 已在前置中间件里 trim 过, 这里能直接拿到
  const mobile = req.body && req.body.mobile
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown'

  // per-mobile 检查
  let mobileResult = { allowed: true }
  if (mobile) {
    mobileResult = checkAndRecord('mobile', mobile, c.mobileMax, c.windowMs, c.mobileLockMs)
  }
  // per-ip 检查
  const ipResult = checkAndRecord('ip', ip, c.ipMax, c.windowMs, c.ipLockMs)

  // 响应头: 让前端 / 调试者能直接看到当前计数 (即使在允许时)
  // - X-RateLimit-Limit: 当前 key 类型下的总阈值
  // - X-RateLimit-Remaining: 窗口内剩余次数
  // - X-RateLimit-Reset: 窗口 / 锁定期结束的 unix 秒
  const activeKind = !mobileResult.allowed ? 'mobile' : !ipResult.allowed ? 'ip' : null
  const activeResult = activeKind === 'mobile' ? mobileResult : activeKind === 'ip' ? ipResult : null
  const activeMax = activeKind === 'mobile' ? c.mobileMax : c.ipMax
  if (activeKind) {
    res.setHeader('X-RateLimit-Limit', String(activeMax))
    res.setHeader('X-RateLimit-Remaining', '0')
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((Date.now() + activeResult.retryAfterMs) / 1000)))
  } else {
    // 允许通过时, 反映 mobile 桶 (更严的那条线) 的剩余
    const refKind = mobile ? 'mobile' : 'ip'
    const refMax = mobile ? c.mobileMax : c.ipMax
    const refResult = mobile ? mobileResult : ipResult
    const refBucket = getBucket(refKind, refKind === 'mobile' ? mobile : ip)
    res.setHeader('X-RateLimit-Limit', String(refMax))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, refMax - refBucket.count)))
  }

  // 给 controller / service 用的钩子 (2026-06 滑块验证需要 failure count)
  req.loginRateLimit = {
    /** 成功登录后调用: 清掉该 mobile 桶 (attempts + failures 一起清) */
    clearMobile() {
      if (mobile) buckets.mobile.delete(mobile)
    },
    /** 密码错误后调用: 增加该 mobile 的 failure 计数 (用于触发滑块验证) */
    recordMobileFailure() {
      if (!mobile) return
      const b = getBucket('mobile', mobile)
      // 复用同一窗口判定逻辑: 跨窗口先重置
      const now = Date.now()
      if (now - b.windowStart >= c.windowMs) {
        b.failureCount = 0
        b.windowStart = now
      }
      b.failureCount = (b.failureCount || 0) + 1
    },
    /** 当前 mobile 的失败次数 (service 据此判断是否要弹滑块) */
    getMobileFailureCount() {
      if (!mobile) return 0
      const b = getBucket('mobile', mobile)
      const now = Date.now()
      if (now - b.windowStart >= c.windowMs) return 0
      return b.failureCount || 0
    }
  }

  if (!mobileResult.allowed) {
    res.setHeader('Retry-After', Math.ceil(mobileResult.retryAfterMs / 1000))
    const minutes = Math.max(1, Math.ceil(mobileResult.retryAfterMs / 60_000))
    return next(ApiError.tooManyRequests(
      `登录尝试过于频繁，请 ${minutes} 分钟后再试`,
      { reason: 'mobile', retryAfterMs: mobileResult.retryAfterMs }
    ))
  }
  if (!ipResult.allowed) {
    res.setHeader('Retry-After', Math.ceil(ipResult.retryAfterMs / 1000))
    const minutes = Math.max(1, Math.ceil(ipResult.retryAfterMs / 60_000))
    return next(ApiError.tooManyRequests(
      `当前网络登录尝试过于频繁，请 ${minutes} 分钟后再试`,
      { reason: 'ip', retryAfterMs: ipResult.retryAfterMs }
    ))
  }

  next()
}

// ===== 内部: 桶存储与算法 =====

const buckets = {
  mobile: new Map(), // mobile -> { count, failureCount, windowStart, blockedUntil }
  ip: new Map()
}

function getBucket(kind, key) {
  const m = buckets[kind]
  let b = m.get(key)
  if (!b) {
    b = { count: 0, failureCount: 0, windowStart: 0, blockedUntil: 0 }
    m.set(key, b)
  }
  return b
}

function checkAndRecord(kind, key, max, windowMs, lockMs) {
  const now = Date.now()
  const b = getBucket(kind, key)
  // 还在锁定期: 直接拒绝, 不计数
  if (b.blockedUntil > now) {
    return { allowed: false, retryAfterMs: b.blockedUntil - now }
  }
  // 锁定期已过, 但进入新窗口: 重置计数
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

// 定期清理: 把 windowStart 已过 + 锁定期也过 + 计数为 0 的空桶清掉, 防内存涨
const SWEEP_INTERVAL_MS = 5 * 60 * 1000 // 5 min
const sweepTimer = setInterval(() => {
  const now = Date.now()
  for (const m of [buckets.mobile, buckets.ip]) {
    for (const [key, b] of m) {
      if (b.blockedUntil <= now && b.count === 0 && (b.failureCount || 0) === 0) m.delete(key)
    }
  }
}, SWEEP_INTERVAL_MS)
sweepTimer.unref() // 不阻塞进程退出

// 测试 / 运维用: 重置所有桶
module.exports._reset = function () {
  buckets.mobile.clear()
  buckets.ip.clear()
}
// 测试用: 窥探当前桶状态
module.exports._peek = function () {
  return {
    mobile: buckets.mobile.size,
    ip: buckets.ip.size
  }
}
