'use strict'

const mongoose = require('mongoose')
const semver = (function () {
  // 极简 semver: 仅支持 'x.y.z' 字符串比较 + patch bump
  return {
    /** 'x.y.z' → [x, y, z] number 数组 */
    parse(v) {
      const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)$/)
      if (!m) return null
      return [Number(m[1]), Number(m[2]), Number(m[3])]
    },
    /** 比较: -1 / 0 / 1 */
    cmp(a, b) {
      const pa = this.parse(a) || [0, 0, 0]
      const pb = this.parse(b) || [0, 0, 0]
      for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
      }
      return 0
    },
    /** patch+1, 不存在则返回 '1.0.0' */
    bumpPatch(v) {
      const p = this.parse(v)
      if (!p) return '1.0.0'
      return `${p[0]}.${p[1]}.${p[2] + 1}`
    }
  }
})()

const LegalDoc = require('@models/LegalDoc.model')
const UserConsent = require('@models/UserConsent.model')
const ApiError = require('@utils/ApiError')
const legalCatalog = require('@utils/legalCatalog')
const { normalizePagination } = require('@utils/pagination')

/**
 * 法律协议业务逻辑
 *
 * 分平台级 (markdown 文件 + version) 与机构级 (LegalDoc collection).
 * UserConsent append-only, 记录"谁在何时同意了什么协议什么版本".
 */

const KEY_TITLES_DEFAULT = {
  'purchase-agreement': '课程购买协议',
  'refund-policy': '退费规则',
  'org-about': '关于本机构',
  'org-faq': '常见问题',
  'points-rule': '积分规则',
  'share-rule': '分享行为规范',
  'org-contact': '联系方式'
}

/* ───────────── 平台级 (markdown 文件) ───────────── */

function platformList() {
  return legalCatalog.list()
}

function platformGet(key) {
  const doc = legalCatalog.get(key)
  if (!doc) throw ApiError.notFound(`平台协议 ${key} 不存在`)
  return {
    key: doc.key,
    title: doc.frontmatter.title,
    version: doc.frontmatter.version,
    effectiveAt: doc.frontmatter.effectiveAt,
    required: doc.required,
    scope: doc.frontmatter.scope || 'platform',
    summary: doc.frontmatter.summary || '',
    markdown: doc.markdown,
    html: doc.html
  }
}

/* ───────────── 机构级 (LegalDoc collection) ───────────── */

async function orgList({ orgId, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId, isActive: true }
  const [items, total] = await Promise.all([
    LegalDoc.find(filter)
      .sort({ key: 1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    LegalDoc.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function orgGetActive(orgId, key) {
  if (!mongoose.isValidObjectId(orgId)) throw ApiError.badRequest('orgId 不合法')
  const doc = await LegalDoc.findOne({ org: orgId, key, isActive: true }).lean()
  if (!doc) throw ApiError.notFound(`本机构协议 ${key} 不存在`)
  return doc
}

async function orgHistory(orgId, key) {
  return LegalDoc.find({ org: orgId, key })
    .sort({ createdAt: -1 })
    .select('_id key title version isActive createdAt updatedAt updatedBy')
    .populate('updatedBy', 'realName mobile')
    .lean()
}

/**
 * 编辑(或首次创建)某机构某 key 的协议.
 * 行为:
 *   - 如果当前已有 isActive=true 的同 key 文档: 软停 (isActive=false), version 自动 patch+1, 再创建新版
 *   - 如果当前没有: 直接创建 version=1.0.0 (或调用方指定 nextVersion)
 *   - contentHtml 由服务端用 marked 编译 (避免前端污染 / XSS 走服务端 sanitize)
 */
async function orgUpsert({ orgId, key, payload, userId }) {
  if (!mongoose.isValidObjectId(orgId)) throw ApiError.badRequest('orgId 不合法')
  if (!payload.contentMarkdown) throw ApiError.badRequest('contentMarkdown 必填')

  const { marked } = require('marked')
  const contentHtml = marked.parse(payload.contentMarkdown)

  const current = await LegalDoc.findOne({ org: orgId, key, isActive: true })
  const nextVersion = payload.version || (current ? semver.bumpPatch(current.version) : '1.0.0')

  // 软停旧版
  if (current) {
    current.isActive = false
    await current.save()
  }

  const created = await LegalDoc.create({
    org: orgId,
    key,
    title: payload.title || (current && current.title) || KEY_TITLES_DEFAULT[key] || key,
    contentMarkdown: payload.contentMarkdown,
    contentHtml,
    version: nextVersion,
    isActive: true,
    isRequired: payload.isRequired != null ? payload.isRequired : (current ? current.isRequired : isRequiredByDefault(key)),
    requireScope: payload.requireScope || (current ? current.requireScope : requireScopeByDefault(key)),
    updatedBy: userId || null
  })
  return created.toObject()
}

function isRequiredByDefault(key) {
  return key === 'purchase-agreement' || key === 'refund-policy'
}
function requireScopeByDefault(key) {
  if (isRequiredByDefault(key)) return 'order'
  return 'none'
}

/**
 * 停用某机构某 key 当前生效版本 (软删, 不物理删).
 * 注: UserConsent 仍可指向旧版本, 不破坏审计链.
 */
async function orgDisable({ orgId, key }) {
  const r = await LegalDoc.findOneAndUpdate(
    { org: orgId, key, isActive: true },
    { $set: { isActive: false } },
    { new: true }
  ).lean()
  if (!r) throw ApiError.notFound('该协议无生效版本')
  return r
}

/* ───────────── UserConsent (同意记录) ───────────── */

/**
 * 计算用户当前需要重新同意的协议清单.
 *
 * 规则:
 *   1. 平台 required 列表 (来自 legalCatalog) 与 user 的 UserConsent(docType=platform) 对比;
 *      用户的 maxVersion < catalog 中 version → 该项进入 pending
 *   2. 如果传 orgId, 加上该机构 isRequired+requireScope='login' 的 LegalDoc;
 *      与 user 在该 org 的 UserConsent(docType=org) 对比; 同样的差集逻辑
 *
 * orgId 为空时 (例如平台超管未选机构): 只算平台级.
 *
 * @returns {Array<{ key, type, scope, version, title, summary, html }>}
 */
async function computePendingConsents({ userId, orgId }) {
  if (!userId) return []
  const pending = []

  // 平台级
  const platformRequired = legalCatalog.getRequired()
  const platformKeys = platformRequired.map((d) => d.key)
  const platformConsents = await UserConsent.find({
    user: userId,
    docType: 'platform',
    docKey: { $in: platformKeys }
  }).select('docKey version').lean()
  const platformMaxByKey = {}
  for (const c of platformConsents) {
    const cur = platformMaxByKey[c.docKey]
    if (!cur || semver.cmp(c.version, cur) > 0) platformMaxByKey[c.docKey] = c.version
  }
  for (const d of platformRequired) {
    const ver = d.frontmatter.version
    const userMax = platformMaxByKey[d.key]
    if (!userMax || semver.cmp(userMax, ver) < 0) {
      pending.push({
        key: d.key,
        type: 'platform',
        scope: 'login',
        version: ver,
        title: d.frontmatter.title,
        summary: d.frontmatter.summary || '',
        html: d.html
      })
    }
  }

  // 机构级 (仅 isRequired + requireScope='login' 才在登录时拦截)
  if (orgId && mongoose.isValidObjectId(orgId)) {
    const orgDocs = await LegalDoc.find({
      org: orgId,
      isActive: true,
      isRequired: true,
      requireScope: 'login'
    }).lean()
    if (orgDocs.length) {
      const orgKeys = orgDocs.map((d) => d.key)
      const orgConsents = await UserConsent.find({
        user: userId,
        org: orgId,
        docType: 'org',
        docKey: { $in: orgKeys }
      }).select('docKey version').lean()
      const orgMaxByKey = {}
      for (const c of orgConsents) {
        const cur = orgMaxByKey[c.docKey]
        if (!cur || semver.cmp(c.version, cur) > 0) orgMaxByKey[c.docKey] = c.version
      }
      for (const d of orgDocs) {
        const userMax = orgMaxByKey[d.key]
        if (!userMax || semver.cmp(userMax, d.version) < 0) {
          pending.push({
            key: d.key,
            type: 'org',
            scope: 'login',
            version: d.version,
            title: d.title,
            summary: '',
            html: d.contentHtml
          })
        }
      }
    }
  }

  return pending
}

/**
 * 批量写 UserConsent. payload.consents = [{ key, type, version, org? }]
 * 同一条 (user, docKey, version) 已存在则跳过 (unique 唯一索引 11000).
 */
async function recordConsents({ userId, ip, userAgent, consents }) {
  if (!Array.isArray(consents) || consents.length === 0) {
    throw ApiError.badRequest('consents 不能为空')
  }
  const docs = []
  for (const c of consents) {
    if (!c.key || !c.type || !c.version) {
      throw ApiError.badRequest('consent 缺少 key/type/version')
    }
    let title = ''
    if (c.type === 'platform') {
      const p = legalCatalog.get(c.key)
      if (!p) throw ApiError.badRequest(`平台协议 ${c.key} 不存在`)
      // 校验 version 真的是当前 catalog 版本 (防止旧版本写入)
      if (p.frontmatter.version !== c.version) {
        throw ApiError.badRequest(`协议 ${c.key} 当前版本是 ${p.frontmatter.version}, 不接受过期版本 ${c.version}`)
      }
      title = p.frontmatter.title
    } else if (c.type === 'org') {
      if (!c.org || !mongoose.isValidObjectId(c.org)) {
        throw ApiError.badRequest(`机构级 consent ${c.key} 缺少有效的 org`)
      }
      const orgDoc = await LegalDoc.findOne({ org: c.org, key: c.key, isActive: true }).lean()
      if (!orgDoc) throw ApiError.badRequest(`本机构协议 ${c.key} 无生效版本`)
      if (orgDoc.version !== c.version) {
        throw ApiError.badRequest(`协议 ${c.key} 当前版本是 ${orgDoc.version}, 不接受过期版本 ${c.version}`)
      }
      title = orgDoc.title
    } else {
      throw ApiError.badRequest(`consent.type 必须是 'platform' 或 'org'`)
    }
    docs.push({
      user: userId,
      org: c.type === 'org' ? c.org : null,
      docKey: c.key,
      docType: c.type,
      version: c.version,
      title,
      ip: ip || '',
      userAgent: userAgent || ''
    })
  }
  // insertMany ordered:false → 重复的 (user,docKey,version) 11000 被忽略, 其余仍然写入
  try {
    await UserConsent.insertMany(docs, { ordered: false })
  } catch (e) {
    // ordered:false + 11000 (E11000 duplicate key error) → 部分已经存在, 不算错
    if (e && e.code === 11000) {
      // pass
    } else {
      throw e
    }
  }
  return { success: true, count: docs.length }
}

async function myConsents({ userId, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { user: userId }
  const [items, total] = await Promise.all([
    UserConsent.find(filter)
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    UserConsent.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

module.exports = {
  // platform
  platformList,
  platformGet,
  // org-level
  orgList,
  orgGetActive,
  orgHistory,
  orgUpsert,
  orgDisable,
  // consent
  computePendingConsents,
  recordConsents,
  myConsents,
  // helpers (供 order.service / seed 用)
  isRequiredByDefault,
  requireScopeByDefault,
  KEY_TITLES_DEFAULT
}
