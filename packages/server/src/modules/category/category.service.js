'use strict'

const mongoose = require('mongoose')
const Category = require('@models/Category.model')
const Org = require('@models/Org.model')
const Student = require('@models/Student.model')
const Subject = require('@models/Subject.model')
const Parent = require('@models/Parent.model')
const PointsTransaction = require('@models/PointsTransaction.model')
const ApiError = require('@utils/ApiError')

/**
 * 2026-06 整改：
 *  - 4 个 model（Student/Subject/LeadTag/Channel）全部 per-org，加 `org` 字段隔离。
 *  - 2026-06-19 起 `org` 必填：所有 Category 必须归属某机构，平台级共享字典完全下线。
 *  - list/tree/detail 默认按 req.orgId 过滤；非平台超管不传 orgId 时强制要 x-org-id。
 *  - create 时 controller 强制 org=req.orgId；schema 校验拒绝任何缺 org 的 Category。
 *
 * 唯一索引 {org, model, name, parentCategory} 配合：
 *  - 同一 org 内同 model 同 parent 下 name 不可重复（自然约束）。
 *  - 跨 org 同名不冲突（家政服务 A 机构可以叫"VIP 客户"，B 机构也叫"VIP 客户"）。
 *  - 顶级 (parentCategory=null) 同 org 内同 model 下 name 也唯一。
 *
 * 不再保留 Org 类别（Org.type 已改为 String enum）；usageChecks 里的 Org 引用也下线。
 */

/**
 * Category.model 的 4 个 model 各自互不复用, model→引用方 service 列表 (用于 removable-check)
 * 注意: Subject 的 category 字段是 String 不是 ObjectId, 见 Subject.model.
 */
const MODEL_USAGE_CHECKS = {
  Student: [
    {
      model: Student,
      filter: {},  // 在调用方补 orgId
      label: '学员引用',
      hint: '该学员分类正在被本机构学员引用, 请先把学员分类改到其他类别后再删'
    }
  ],
  Subject: [
    // Subject.category 是 String (字段名, 不是 ObjectId), 见 Subject.model 的 category 字段定义.
    // removable-check 用客户端字符串检索; 在 service 里临时拼 filter.
  ],
  LeadTag: [
    {
      model: Parent,
      filter: {},  // tags 是 ObjectId 数组, 调用方拼 filter
      label: '家长引用',
      hint: '该家长标签正在被本机构家长引用, 请先把家长身上的此标签去掉后再删'
    }
  ],
  Channel: [
    {
      model: Parent,
      filter: {},  // source 是 ObjectId, 调用方拼 filter
      label: '家长渠道引用',
      hint: '该渠道正在被本机构家长引用, 请先把家长渠道改到其他渠道后再删'
    }
  ],
  // 2026-06-21: 积分原因被 PointsTransaction.reason 引用, 删前需查 transaction 数
  PointsReason: [
    {
      model: PointsTransaction,
      filter: { reason: '__ID__' },  // 调用方在 categoryUsageChecks 里覆盖
      label: '积分流水引用',
      hint: '已有积分流水引用该原因, 请先把流水原因改到其他分类或归档后删'
    }
  ]
}

/**
 * 拼装 usageChecks: 所有引用都按本 org 过滤, 避免跨 org 误判.
 * @param {String} orgId   本机构 id
 * @param {Object} doc     Category 文档 (含 model 字段)
 * @param {String} id      Category._id
 */
function categoryUsageChecks(orgId, doc, id) {
  const checks = [
    {
      model: Category,
      filter: { parentCategory: id, org: orgId },
      label: '子级类别',
      hint: '请先删除子级类别后再删'
    }
  ]
  const extras = MODEL_USAGE_CHECKS[doc.model] || []
  for (const ex of extras) {
    if (ex.model === Student) {
      checks.push({ ...ex, filter: { org: orgId, type: id } })
    } else if (ex.model === Parent) {
      // Parent.tags 数组 + Parent.source 单值
      if (doc.model === 'LeadTag') {
        checks.push({ ...ex, filter: { org: orgId, tags: id } })
      } else if (doc.model === 'Channel') {
        checks.push({ ...ex, filter: { org: orgId, source: id } })
      }
    } else if (ex.model === PointsTransaction) {
      // PointsTransaction.reason 直接替换 __ID__ 占位符
      const f = { ...ex.filter }
      for (const k of Object.keys(f)) {
        if (f[k] === '__ID__') f[k] = id
      }
      checks.push({ ...ex, filter: { org: orgId, ...f } })
    }
  }
  return checks
}

/**
 * 把"模型字符串"映射到 controller 用的写权限码（一个 Category 业务域可能对应多个调用方权限）。
 * 写 Category 不需要单独权限码，复用引用方的写权限：
 *   - Student  → student.write
 *   - Subject  → subject.write
 *   - LeadTag  → recruit.write
 *   - Channel  → recruit.write
 */
const MODEL_WRITE_PERM = {
  Student: 'student.write',
  Subject: 'subject.write',
  LeadTag: 'recruit.write',
  Channel: 'recruit.write',
  // 2026-06-21: 积分原因走 points.write (管理员/教务手动调整积分时维护原因字典)
  PointsReason: 'points.write'
}

function writePermFor(model) {
  return MODEL_WRITE_PERM[model] || null
}

async function list({ model, level, parent, keyword, isActive, orgId }) {
  const filter = {}
  if (model) filter.model = model
  // 2026-06 整改: per-org 隔离; orgId 缺省走 caller 传值 (controller 从 req.orgId 取)
  if (orgId) filter.org = orgId
  if (level !== undefined && level !== null && level !== '') filter.level = Number(level)
  if (parent === 'null' || parent === '' || parent === undefined) {
    // 不传 parent 视为不过滤
  } else if (parent === '0') {
    filter.parentCategory = null
  } else if (parent) {
    filter.parentCategory = parent
  }
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }

  return Category.find(filter)
    .populate('parentCategory', 'name model level')
    .sort({ model: 1, level: 1, sort: 1, createdAt: 1 })
    .lean()
}

async function tree({ model, orgId }) {
  const filter = {}
  if (model) filter.model = model
  if (orgId) filter.org = orgId
  const all = await Category.find(filter)
    .sort({ model: 1, level: 1, sort: 1, createdAt: 1 })
    .lean()

  // 按 model 分组，然后每组按 parentCategory 嵌套
  const byModel = new Map()
  for (const c of all) {
    if (!byModel.has(c.model)) byModel.set(c.model, [])
    byModel.get(c.model).push({ ...c, id: String(c._id), children: [] })
  }

  const result = []
  for (const [, arr] of byModel) {
    const idMap = new Map(arr.map((n) => [String(n._id), n]))
    const roots = []
    for (const n of arr) {
      const pid = n.parentCategory ? String(n.parentCategory) : null
      if (pid && idMap.has(pid)) {
        idMap.get(pid).children.push(n)
      } else {
        roots.push(n)
      }
    }
    result.push(...roots)
  }
  return result
}

async function detail(id, orgId) {
  const filter = { _id: id }
  if (orgId) filter.org = orgId
  const c = await Category.findOne(filter).populate('parentCategory', 'name model level').lean()
  if (!c) throw ApiError.notFound('类别不存在')
  return c
}

/**
 * 创建类别。
 * @param {Object} payload     body 数据 (含 model / name / parentCategory / code / sort / isActive)
 * @param {String} orgId       本机构 id (controller 从 req.orgId 注入)
 */
async function create(payload, orgId) {
  if (!orgId) {
    // 平台级 Category 已完全下线 (2026-06-19): 4 个 model 都必须是 per-org
    throw ApiError.badRequest('类别字典必须归属某个机构')
  }
  // parent 必须同 org + 同 model
  if (payload.parentCategory) {
    const parent = await Category.findById(payload.parentCategory)
      .select('model level org')
      .lean()
    if (!parent) throw ApiError.badRequest('父级类别不存在')
    if (parent.model !== payload.model) throw ApiError.badRequest('父级类别 model 不一致')
    if (String(parent.org) !== String(orgId)) throw ApiError.badRequest('父级类别必须属于本机构')
    payload.level = parent.level + 1
  } else {
    payload.level = payload.level || 0
  }
  payload.org = orgId
  const doc = await Category.create(payload)
  return doc.toObject()
}

async function update(id, payload, orgId) {
  const filter = { _id: id }
  if (orgId) filter.org = orgId
  const doc = await Category.findOne(filter)
  if (!doc) throw ApiError.notFound('类别不存在')

  // 变更 parent 时重新计算 level
  if (Object.prototype.hasOwnProperty.call(payload, 'parentCategory')) {
    if (payload.parentCategory) {
      const parent = await Category.findById(payload.parentCategory)
        .select('model level org')
        .lean()
      if (!parent) throw ApiError.badRequest('父级类别不存在')
      if (parent.model !== doc.model) throw ApiError.badRequest('父级类别 model 不一致')
      if (String(parent.org) !== String(orgId)) throw ApiError.badRequest('父级类别必须属于本机构')
      // 防成环
      if (String(parent._id) === String(doc._id)) throw ApiError.badRequest('不能将自身设为父级')
      payload.level = parent.level + 1
    } else {
      payload.level = 0
    }
  }
  Object.assign(doc, payload)
  await doc.save()
  return doc.toObject()
}

async function remove(id, orgId) {
  const filter = { _id: id }
  if (orgId) filter.org = orgId
  const c = await Category.findOne(filter)
  if (!c) throw ApiError.notFound('类别不存在')

  // 互锁:用统一工具. usageChecks 内所有 filter 都已按本 org 隔离
  const { assertUnused } = require('@utils/removable')
  await assertUnused(orgId, categoryUsageChecks(orgId, c, id))

  await c.deleteOne()
  return { success: true }
}

async function removableCheck(id, orgId) {
  const filter = { _id: id }
  if (orgId) filter.org = orgId
  const c = await Category.findOne(filter).select('_id model').lean()
  if (!c) {
    return { canRemove: false, blockers: [{ entity: 'Category', label: '类别', count: 0, hint: '该类别不存在或不属于本机构' }] }
  }
  const { check } = require('@utils/removable')
  return check(orgId, categoryUsageChecks(orgId, c, id))
}

module.exports = {
  list,
  tree,
  detail,
  create,
  update,
  remove,
  removableCheck,
  writePermFor
}
