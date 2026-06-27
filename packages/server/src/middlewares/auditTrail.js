'use strict'

const AuditLog = require('@models/AuditLog.model')

/**
 * 操作留痕中间件 (auditTrail, 2026-06-27 立项)
 *
 * 设计原则:
 *   - 只写中间件, controller 不动: 挂在 routers/index.js 顶部 (`authenticate` 之后),
 *     全部业务路由自动覆盖
 *   - 异步 fire-and-forget: res.on('finish') + setImmediate, 不阻塞业务响应
 *   - 失败不抛业务: 写库失败 → errorLog 丢, 不影响 controller
 *
 * 字段映射 (req 已有 + res 快照):
 *   - method      ← req.method
 *   - path        ← req.path (without query string)
 *   - query       ← req.query
 *   - params      ← req.params
 *   - body        ← maskBody(req.body), 截断 2KB
 *   - statusCode  ← res.statusCode
 *   - durationMs  ← Date.now() - t0
 *   - actor       ← req.user (id, realName, mobile 脱敏)
 *   - org         ← req.orgId + Org.name (异步查一次, 缓存到 req._orgName)
 *   - ip          ← req.ip
 *   - userAgent   ← 截断 500
 *   - requestId   ← req.id
 *
 * 跳过规则:
 *   - !req.user (登录失败/匿名)            ← 用户决策 2026-06-27: 不记
 *   - !req.orgId (跨平台超管无 org 上下文)  ← 用户决策 2026-06-27: 不记
 *   - path 在黑名单 (health, refresh, login, audit-logs 自身)
 *   - method == GET && path 不在敏感 GET 前缀
 *   - method 不在 [POST/PUT/PATCH/DELETE]
 *
 * 性能:
 *   - 同步判断 skip → 没必要的请求不挂 finish 钩子
 *   - Org name 走 req._orgName 缓存, 同请求多次访问只查一次
 *   - finish 时 setImmediate 让出主线程, 不阻塞响应 send
 */

const BODY_MAX = 2 * 1024
const UA_MAX = 500

// 敏感 GET 路径前缀 (GET 也记的; 用 startsWith 匹配)
const SENSITIVE_GET_PREFIXES = [
  '/students',
  '/student-products',
  '/finance',
  '/reports',
  '/orders',
  '/users',
  '/positions',
  '/agents'
]

// 全部跳过 (黑名单; 不区分 method)
const SKIP_PATH_PREFIXES = [
  '/health',
  '/auth/refresh',
  '/auth/login', // 登录成功有自己的业务留痕 + 失败不记, 这里跳过避免污染
  '/audit-logs' // 审计自身不审计 (防递归 + 平台超管筛审计会刷一堆)
]

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function shouldSkip(method, path) {
  if (SKIP_PATH_PREFIXES.some(p => path.startsWith(p))) return true
  if (method === 'GET') {
    return !SENSITIVE_GET_PREFIXES.some(p => path.startsWith(p))
  }
  return !WRITE_METHODS.has(method)
}

module.exports.shouldSkip = shouldSkip

async function getOrgNameCached(req, orgId) {
  if (req._orgName !== undefined) return req._orgName
  if (!orgId) { req._orgName = ''; return '' }
  try {
    const Org = require('@models/Org.model')
    const org = await Org.findById(orgId).select('name').lean()
    req._orgName = (org && org.name) || ''
  } catch (_) {
    req._orgName = ''
  }
  return req._orgName
}

function maskMobile(mobile) {
  if (!mobile) return ''
  const s = String(mobile)
  if (s.length < 7) return '***'
  return s.slice(0, 3) + '****' + s.slice(-4)
}

module.exports = function auditTrail(req, res, next) {
  // 同步早退: 没必要挂 finish 钩子的请求直接放过 (路径/方法层面)
  // 注意: req.path 是动态属性, express 子 router 会改写 req.url 导致 finish 时 req.path 变化.
  // 必须在同步时把值快照到本地变量, finish 闭包用本地值.
  const pathAtMount = req.path
  const methodAtMount = req.method
  const originalUrlAtMount = req.originalUrl
  const requestIdAtMount = req.id
  if (shouldSkip(methodAtMount, pathAtMount)) return next()

  const t0 = Date.now()

  res.on('finish', () => {
    setImmediate(async () => {
      try {
        // 异步检查 user/orgId: 此时中间件链已跑完, authenticate/requireOrg 已注入.
        // 匿名请求 (登录失败等) → 跳过 (用户决策 2026-06-27: 不记)
        if (!req.user || !req.orgId) return

        // 二次确认: 路径/方法 (用快照值)
        if (shouldSkip(methodAtMount, pathAtMount)) return

        // mongoose 断开时不阻塞业务响应, 静默丢 (不重试)
        const mongoose = require('mongoose')
        if (mongoose.connection.readyState !== 1) {
          // eslint-disable-next-line no-console
          console.error('[auditTrail] mongoose not ready, drop', { path: pathAtMount, requestId: requestIdAtMount })
          return
        }

        const orgName = await getOrgNameCached(req, req.orgId)
        const body = AuditLog.maskBody(req.body)
        const bodyJson = body ? JSON.stringify(body) : null
        const bodyTruncated = bodyJson && bodyJson.length > BODY_MAX
          ? { _truncated: true, _originalLength: bodyJson.length, _preview: bodyJson.slice(0, BODY_MAX) }
          : body
        const ua = (req.headers['user-agent'] || '').slice(0, UA_MAX)

        await AuditLog.create({
          method: methodAtMount,
          // 存完整路径 (含 /api/v1), 方便审查时一眼看出哪个 API
          path: originalUrlAtMount.split('?')[0],
          query: req.query || null,
          params: req.params || null,
          body: bodyTruncated,
          statusCode: res.statusCode,
          durationMs: Date.now() - t0,
          actor: {
            _id: req.user.id,
            name: req.user.realName || '',
            mobile: maskMobile(req.user.mobile)
          },
          org: { _id: req.orgId, name: orgName },
          ip: req.ip || '',
          userAgent: ua,
          requestId: requestIdAtMount
        })
      } catch (err) {
        // 审计失败不抛业务 (fire-and-forget)
        // eslint-disable-next-line no-console
        console.error('[auditTrail] write failed:', err && err.message, {
          path: pathAtMount,
          method: methodAtMount,
          requestId: requestIdAtMount
        })
      }
    })
  })

  next()
}
