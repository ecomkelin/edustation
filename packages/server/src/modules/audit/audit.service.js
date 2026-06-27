'use strict'

const AuditLog = require('@models/AuditLog.model')

/**
 * Audit 服务 (2026-06-27 立项)
 *
 * 鉴权: 不引入 audit.read 权限码, 仅平台超管 (requirePlatformAdmin 硬门).
 *   决策 2026-06-27: 用户原话"审查日志 超管可见".
 *
 * 不依赖: finance 那种 account-ledger 范式, 单一 collection 直接查.
 */

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseListQuery(q) {
  const page = Math.max(1, parseInt(q.page, 10) || DEFAULT_PAGE)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.pageSize, 10) || DEFAULT_PAGE_SIZE))
  const filter = {}

  if (q.method) filter.method = String(q.method).toUpperCase()
  if (q.statusCode) {
    const sc = String(q.statusCode)
    // 桶筛选: 2xx → 200-299, 4xx → 400-499, 5xx → 500-599
    const bucketMatch = sc.match(/^([245])xx$/i)
    if (bucketMatch) {
      const base = parseInt(bucketMatch[1], 10) * 100
      filter.statusCode = { $gte: base, $lt: base + 100 }
    } else {
      const n = parseInt(sc, 10)
      if (Number.isFinite(n)) filter.statusCode = n
    }
  }
  if (q.userId) filter['actor._id'] = q.userId
  if (q.orgId) filter['org._id'] = q.orgId
  if (q.requestId) filter.requestId = String(q.requestId)
  if (q.path) {
    const p = String(q.path)
    filter.path = p.startsWith('/') ? p : '/' + p
  }
  if (q.q) {
    const re = new RegExp(escapeRegex(String(q.q)), 'i')
    filter.$or = [{ path: re }, { 'actor.name': re }, { 'org.name': re }]
  }
  if (q.from || q.to) {
    filter.createdAt = {}
    if (q.from) filter.createdAt.$gte = new Date(q.from)
    if (q.to) filter.createdAt.$lte = new Date(q.to)
  }
  return { page, pageSize, filter }
}

exports.list = async (q) => {
  const { page, pageSize, filter } = parseListQuery(q)
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    AuditLog.countDocuments(filter)
  ])
  return { items, total, page, pageSize }
}

exports.detail = async (id) => {
  return AuditLog.findById(id).lean()
}

exports.stats = async (q) => {
  const match = {}
  if (q.from) match.createdAt = { $gte: new Date(q.from) }
  if (q.to) {
    match.createdAt = { ...(match.createdAt || {}), $lte: new Date(q.to) }
  }
  const groups = await AuditLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: { method: '$method', status: '$statusCode' },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ])
  return groups
}

exports.options = async () => {
  const [methods, paths, statusCodes, users] = await Promise.all([
    AuditLog.distinct('method'),
    AuditLog.distinct('path'),
    AuditLog.distinct('statusCode'),
    AuditLog.aggregate([
      { $group: { _id: '$actor._id', name: { $first: '$actor.name' } } },
      { $project: { _id: 1, name: 1 } },
      { $limit: 500 },
      { $sort: { name: 1 } }
    ])
  ])
  return {
    methods: methods.filter(Boolean).sort(),
    paths: paths.filter(Boolean).sort(),
    statusCodes: statusCodes.filter(c => Number.isFinite(c)).sort((a, b) => a - b),
    users: users
      .filter(u => u._id)
      .map(u => ({ id: String(u._id), name: u.name || '' }))
  }
}

exports.exportCsv = async (q) => {
  const { filter } = parseListQuery({ ...q, pageSize: MAX_PAGE_SIZE })
  const items = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(MAX_PAGE_SIZE)
    .lean()

  const headers = [
    'createdAt', 'method', 'path', 'statusCode', 'durationMs',
    'actorName', 'actorMobile', 'orgName', 'ip', 'requestId'
  ]
  const lines = [headers.join(';')]
  for (const it of items) {
    lines.push([
      it.createdAt ? new Date(it.createdAt).toISOString() : '',
      it.method,
      it.path,
      it.statusCode,
      it.durationMs,
      (it.actor && it.actor.name) || '',
      (it.actor && it.actor.mobile) || '',
      (it.org && it.org.name) || '',
      it.ip,
      it.requestId
    ].map(v => String(v).replace(/[\r\n;]/g, ' ')).join(';'))
  }
  return lines.join('\n')
}
