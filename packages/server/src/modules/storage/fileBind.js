'use strict'

const { File } = require('@models/File.model')
const ApiError = require('@utils/ApiError')

/**
 * 文件 ↔ 业务实体 绑定 / 解绑工具。
 *
 * 设计目的：
 *  - 业务模块（StudentWork/User/Pet/Org/...）不直接操作 File.refs；
 *    统一调 fileBind，避免重复实现 refCount / isOrphan 维护逻辑。
 *  - bind/unbind 都要校验"文件属于 orgId"，防越权。
 *  - 同一 (entity, entityId, field) 重复 bind 是幂等的（不会重复计数）。
 *
 * 业务模块典型用法：
 *
 *   // 单值字段（avatar / logo）
 *   await fileBind.diffSingle({
 *     orgId,
 *     oldUrl: prev.avatar,
 *     newUrl: next.avatar,
 *     entity: REF_ENTITY.USER,
 *     entityId: userId,
 *     field: 'avatar'
 *   })
 *
 *   // 数组字段（fileUrls / attachments / materials）
 *   await fileBind.diffArray({
 *     orgId,
 *     oldUrls: prev.fileUrls,
 *     newUrls: next.fileUrls,
 *     entity: REF_ENTITY.STUDENT_WORK,
 *     entityId: workId,
 *     field: 'fileUrls'
 *   })
 *
 *   // 物理删除业务实体时
 *   await fileBind.unbindAll({ orgId, urls: doc.fileUrls, entity, entityId, field })
 */

function isOurFile(doc, orgId) {
  if (!doc) return false
  if (doc.org && orgId && String(doc.org) !== String(orgId)) return false
  return true
}

/**
 * 解析 URL → File 文档。
 * 由于 url 是 driver 给出的可访问 URL，不一定可反查 key；
 * 阶段 1 策略：url 在 File.url 中唯一索引（去重），但写入时只存 url；
 * 解析时直接按 url 查 File。
 *
 * 返回 null 表示该 URL 不是我们的文件（外部链接 / 旧数据），应静默跳过。
 */
async function findFileByUrl(url, orgId) {
  if (!url) return null
  const doc = await File.findOne({ url, deletedAt: null })
  if (!isOurFile(doc, orgId)) return null
  return doc
}

/**
 * 把"旧 urls / 新 urls"做 diff，决定要 bind 哪些、unbind 哪些。
 * 注意：相同 URL 保留，不会触发任何变更。
 */
async function diffUrls({ orgId, oldUrls = [], newUrls = [] }, opts) {
  const oldSet = new Set((oldUrls || []).filter(Boolean))
  const newSet = new Set((newUrls || []).filter(Boolean))
  const toAdd = [...newSet].filter((u) => !oldSet.has(u))
  const toRemove = [...oldSet].filter((u) => !newSet.has(u))
  if (toAdd.length) {
    await bindUrls({ orgId, urls: toAdd, ...opts })
  }
  if (toRemove.length) {
    await unbindUrls({ orgId, urls: toRemove, ...opts })
  }
}

/**
 * 绑定一组 url 到 (entity, entityId, field)。
 * 幂等：已存在的 (entity, entityId, field) 不重复计数。
 */
async function bindUrls({ orgId, urls, entity, entityId, field }) {
  if (!urls || !urls.length) return
  if (!entity || !entityId || !field) {
    throw new Error('fileBind.bindUrls: entity / entityId / field 必填')
  }
  const files = await File.find({ url: { $in: urls }, deletedAt: null })
  for (const f of files) {
    if (!isOurFile(f, orgId)) continue
    const has = (f.refs || []).some(
      (r) => r.entity === entity && String(r.entityId) === String(entityId) && r.field === field
    )
    if (has) continue
    f.refs.push({ entity, entityId, field, boundAt: new Date() })
    f.refCount = f.refs.length
    f.isOrphan = false
    await f.save()
  }
}

/**
 * 解绑一组 url 的 (entity, entityId, field)。
 * 不存在的引用直接跳过。
 */
async function unbindUrls({ orgId, urls, entity, entityId, field }) {
  if (!urls || !urls.length) return
  if (!entity || !entityId || !field) {
    throw new Error('fileBind.unbindUrls: entity / entityId / field 必填')
  }
  const files = await File.find({ url: { $in: urls }, deletedAt: null })
  for (const f of files) {
    if (!isOurFile(f, orgId)) continue
    f.refs = (f.refs || []).filter(
      (r) => !(r.entity === entity && String(r.entityId) === String(entityId) && r.field === field)
    )
    f.refCount = f.refs.length
    f.isOrphan = f.refCount === 0
    await f.save()
  }
}

/**
 * 业务实体硬删时调用：把文件上所有指向 (entity, entityId) 的 ref 都解除
 * （不限 field——实体没了，所有字段上的引用都失效）
 */
async function unbindEntity({ orgId, urls, entity, entityId }) {
  if (!urls || !urls.length) return
  const files = await File.find({ url: { $in: urls }, deletedAt: null })
  for (const f of files) {
    if (!isOurFile(f, orgId)) continue
    f.refs = (f.refs || []).filter(
      (r) => !(r.entity === entity && String(r.entityId) === String(entityId))
    )
    f.refCount = f.refs.length
    f.isOrphan = f.refCount === 0
    await f.save()
  }
}

/**
 * 单值字段 diff（avatar / logo 等）。
 *  - 旧值是空、新值是空：no-op
 *  - 旧值空、新值非空：bind
 *  - 旧值非空、新值空：unbind
 *  - 旧值新值都非空且不同：先 unbind 旧，再 bind 新（节省一次 set）
 *  - 相同：no-op
 */
async function diffSingle({ orgId, oldUrl, newUrl, entity, entityId, field }) {
  const oldU = oldUrl || null
  const newU = newUrl || null
  if (!oldU && !newU) return
  if (oldU && oldU === newU) return
  if (oldU && newU) {
    await unbindUrls({ orgId, urls: [oldU], entity, entityId, field })
    await bindUrls({ orgId, urls: [newU], entity, entityId, field })
    return
  }
  if (newU) {
    await bindUrls({ orgId, urls: [newU], entity, entityId, field })
  } else {
    await unbindUrls({ orgId, urls: [oldU], entity, entityId, field })
  }
}

/**
 * 数组字段 diff（fileUrls / attachments / materials）。
 * 见 diffUrls 实现。
 */
async function diffArray(args) {
  return diffUrls(args, { entity: args.entity, entityId: args.entityId, field: args.field })
}

/**
 * ObjectId 数组字段 diff —— 用于 attachments / materials 这类直接存 [ObjectId] 的字段。
 *
 * 先把 oldIds/newIds 解析成对应 url 数组，再走 diffArray。
 * 严格模式：任何 newIds 解析不到 url（即不属于本 org / 已删除）都抛 400，
 *   防止"前端瞎传 fileId 但被静默吞掉 → 数据脏"。
 * 旧 ids 解析不到 → 静默跳过（防止"历史脏数据导致更新失败"）。
 */
async function diffArrayById({ orgId, oldIds = [], newIds = [], entity, entityId, field }) {
  const oldSet = new Set((oldIds || []).filter((x) => x != null).map((x) => String(x)))
  const newSet = new Set((newIds || []).filter((x) => x != null).map((x) => String(x)))
  if (oldSet.size === 0 && newSet.size === 0) return

  // 旧 id 解析（容错）
  let oldUrls = []
  if (oldSet.size > 0) {
    const oldIdToUrl = await idsToUrlsMap(orgId, [...oldSet])
    oldUrls = [...oldSet].map((id) => oldIdToUrl.get(id)).filter(Boolean)
  }

  // 新 id 解析（严格）
  let newUrls = []
  if (newSet.size > 0) {
    const newIdToUrl = await idsToUrlsMap(orgId, [...newSet])
    const missing = [...newSet].filter((id) => !newIdToUrl.has(id))
    if (missing.length > 0) {
      throw ApiError.badRequest(`附件中有 ${missing.length} 个 fileId 不存在或不属于本机构`)
    }
    newUrls = [...newSet].map((id) => newIdToUrl.get(id))
  }

  return diffArray({ orgId, oldUrls, newUrls, entity, entityId, field })
}

/**
 * ObjectId 数组 → url 列表（顺序与 ids 一致；找不到的 id 跳过）
 */
async function idsToUrls(orgId, ids) {
  const m = await idsToUrlsMap(orgId, ids)
  return ids.map((id) => m.get(String(id))).filter(Boolean)
}

async function idsToUrlsMap(orgId, ids) {
  const valid = (ids || []).filter((x) => x != null).map((x) => String(x))
  if (valid.length === 0) return new Map()
  const { File } = require('@models/File.model')
  const filter = { _id: { $in: valid }, deletedAt: null }
  // 跨机构实体（user.avatar / pet.avatar）传 orgId=null 时跳过 org 校验
  if (orgId) filter.org = orgId
  const files = await File.find(filter).select('_id url').lean()
  return new Map(files.map((f) => [String(f._id), f.url]))
}

module.exports = {
  findFileByUrl,
  bindUrls,
  unbindUrls,
  unbindEntity,
  diffSingle,
  diffArray,
  diffArrayById
}

// 内部用，避免循环依赖
module.exports.isOurFile = isOurFile
// 暴露 ApiError 给业务模块（如 user.service 用）
module.exports.ApiError = ApiError
