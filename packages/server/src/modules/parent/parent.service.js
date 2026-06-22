'use strict'

const Parent = require('@models/Parent.model')
const ChildLead = require('@models/ChildLead.model')
const LeadActivity = require('@models/LeadActivity.model')
const TrialBooking = require('@models/TrialBooking.model')
const Category = require('@models/Category.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const removable = require('@utils/removable')
const parentProfile = require('@modules/parent/parent.profile')

/* ─── 看全部的职位名 (与系统默认职位绑定) ───────────
 * 业务约定: 招生模块"看全部" = 管理员 / 教务 系统职位.
 * 销售/地推若只用 '招生专员' 类自定义职位, 默认只看自己录入的.
 * 这条白名单与 DEFAULT_POSITIONS 中两个系统职位名一一对应, 不能改字面量 (前端 Position 管理也用).
 * 平台超管天然拥有"看全部"权限 (跨机构视角).
 */
const FULL_VIEW_POSITION_NAMES = ['管理员', '教务']
async function canSeeAllParents(currentUser, orgId) {
  if (!currentUser) return false
  if (currentUser.isPlatformAdmin) return true
  if (!orgId) return false
  const rel = await UserOrgRel.findOne({ user: currentUser._id || currentUser.id, org: orgId })
    .select('positions')
    .populate({ path: 'positions', select: 'name isSystem' })
    .lean()
  if (!rel || !rel.positions) return false
  return rel.positions.some((p) => p.isSystem && FULL_VIEW_POSITION_NAMES.includes(p.name))
}

/* ─── 默认渠道 (Channel = '地推') ───────────────────── */

/**
 * 解析默认渠道 ID (业务约定: 地推)
 *   - 套 Category 字典, model='Channel' (org-agnostic, 全局唯一)
 *   - 缓存到模块内, 减少 DB 查询 (写操作很少, 启动时一次就够)
 *   - 若字典未初始化 (admin 还没跑 channel.seed), 返回 null, 由调用方回退到 '不设'
 */
let _defaultChannelIdCache = null
async function getDefaultChannelId() {
  if (_defaultChannelIdCache) return _defaultChannelIdCache
  const c = await Category.findOne({ model: 'Channel', name: '地推' })
    .select('_id')
    .lean()
  _defaultChannelIdCache = c ? c._id : null
  return _defaultChannelIdCache
}

// 暴露给其他模块 (渠道字典被修改时, 清缓存)
function _resetDefaultChannelCache() { _defaultChannelIdCache = null }

/**
 * 招生试听 - 家长账户 (Parent) 业务逻辑
 *
 * 关键设计 (2026-06 重构, 替代原 lead.service 部分职责):
 *   - Parent 是**业务档案**, 与 User (登录账号) 解耦
 *     - 创建 Parent 不需要 User 存在
 *     - 首个 ChildLead 转化时 (trialBooking.service.convert) 才 upsert User 并回填 Parent.user
 *   - 1 家长带多孩 = 1 Parent : N ChildLead
 *   - 软唯一 phone: 同 org 下 phone 唯一, 命中 → 返回 { duplicate: true, parent }
 *     (1 家长带多孩, 走 "加一个孩子" 接口而不是"建家长")
 *   - 家长 lifecycle 状态机: new/partial/full/lost/dormant
 *     - 手动重算: POST /parents/:id/recompute-lifecycle
 *     - 自动触发: childLead.service.createActivity (pending→contacted) + trialBooking.service.convert
 *   - 触点: LeadActivity 跟 ChildLead 走; Parent.lastContactedAt/By 由
 *     childLead.service.createActivity 同步刷
 *   - 标签: Category(model='LeadTag') 字典; 加 '已流失' 标签 → lifecycle='lost' 强制
 */

/* ─── lifecycle 重算工具 (供 convert/unconvert/手动调用) ──────── */

async function recomputeLifecycle(parentId) {
  const total = await ChildLead.countDocuments({ parent: parentId })
  // 2026-06-16: lifecycle 推导改为"数真正转化的" (convertedStudent != null)
  // 之前数 status=converted 会把 auto-mark 的兄弟也算进去, 虚高 lifecycle
  // 去掉 auto-mark 后, status=converted 和 convertedStudent != null 理论上等价,
  // 但 convertedStudent 字段是真正的"已建学员档案"标志, 语义更准
  const converted = await ChildLead.countDocuments({ parent: parentId, convertedStudent: { $ne: null } })
  const lost = await ChildLead.countDocuments({ parent: parentId, status: 'lost' })
  let lifecycle
  if (total === 0 || converted === 0) lifecycle = 'new'
  else if (converted < total) lifecycle = 'partial'
  else lifecycle = 'full'
  // 若有 'lost' 标签, 优先 'lost'
  const parent = await Parent.findById(parentId).select('tags lifecycle').lean()
  if (parent) {
    const isLostTagged = await isParentLostTagged(parent.tags)
    if (isLostTagged && lifecycle !== 'lost') {
      lifecycle = 'lost'
    }
  }
  if (lost === total && total > 0) lifecycle = 'lost'  // 全 lost 也算
  await Parent.updateOne({ _id: parentId }, { $set: { lifecycle } })
  return lifecycle
}

async function isParentLostTagged(tags) {
  if (!tags || tags.length === 0) return false
  const Category = require('@models/Category.model')
  const lostTag = await Category.findOne({ model: 'LeadTag', name: '已流失', _id: { $in: tags } })
    .select('_id')
    .lean()
  return !!lostTag
}

/* ─── 列表 / 详情 ─────────────────────────────────── */

async function list({ orgId, currentUser, scope, lifecycle, keyword, phone, tag, source, promoteBy, from, to, page, pageSize }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId (前端未传 x-org-id header)')
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  // 销售/教务分级: 管理员/教务/平台超管 → 看全部; 销售(招生专员等自定义职位) → 仅看自己录入
  // 2026-06 修复: 之前只判 isPlatformAdmin, 把"非超管的管理员"也当销售看, 导致校长进潜客管理看到 total=0
  const canSeeAll = await canSeeAllParents(currentUser, orgId)
  const effectiveScope = canSeeAll ? (scope || 'all') : 'mine'
  if (effectiveScope === 'mine' && currentUser) {
    filter.promoteBy = currentUser.id
  }
  if (lifecycle) {
    const arr = String(lifecycle).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 1) filter.lifecycle = { $in: arr }
    else if (arr.length === 1) filter.lifecycle = arr[0]
  }
  if (phone) filter.phone = phone
  if (tag) filter.tags = tag
  if (source) filter.source = source
  if (promoteBy) filter.promoteBy = promoteBy
  // 2026-06-21: 删 consultant 过滤 (Parent.consultant 字段已删; 谈单老师挂到 TrialBooking)
  if (keyword) {
    const kw = String(keyword).trim()
    if (kw) filter.remark = { $regex: kw, $options: 'i' }
  }
  if (from || to) {
    // 2026-06-16: 改查 updatedAt (业务上"最近变动"比"创建时间"对销售更有意义;
    //   创建 1 年前但昨天打了触点的家长, 也应该出现在 '近 7 天' 列表里)
    filter.updatedAt = {}
    if (from) filter.updatedAt.$gte = new Date(from)
    if (to) filter.updatedAt.$lte = new Date(to)
  }

  const [items, total] = await Promise.all([
    Parent.find(filter)
      .populate('promoteBy', 'mobile realName')
      .populate('tags', 'name model')
      .populate('source', 'name model')
      // 2026-06-16: 排序改 updatedAt desc (时间越晚越靠上)
      .sort({ updatedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Parent.countDocuments(filter)
  ])

  // 派生: 孩子数 + 转化数 (前端列表展示用)
  if (items.length > 0) {
    const parentIds = items.map((p) => p._id)
    const stats = await ChildLead.aggregate([
      { $match: { parent: { $in: parentIds } } },
      {
        $group: {
          _id: '$parent',
          total: { $sum: 1 },
          converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', ['pending', 'contacted', 'scheduled', 'tried']] }, 1, 0] } },
          // 拉孩子名 (按 createdAt 升序, 第一个最老的排前面)
          names: { $push: { $cond: [{ $ifNull: ['$name', false] }, '$name', '$$REMOVE'] } }
        }
      },
      {
        // names 已经是按 $push 顺序的, 这里只 sort 一次确保稳态
        $project: {
          total: 1,
          converted: 1,
          pending: 1,
          names: 1
        }
      }
    ])
    // 再按孩子 createdAt 升序拉一次, 把 names 按时间排好
    const childMeta = await ChildLead.find({ parent: { $in: parentIds } })
      .select('parent name status createdAt')
      .sort({ createdAt: 1 })
      .lean()
    const namesByParent = new Map()
    for (const c of childMeta) {
      const key = String(c.parent)
      if (!namesByParent.has(key)) namesByParent.set(key, [])
      namesByParent.get(key).push({ name: c.name, status: c.status })
    }

    const byParent = new Map(stats.map((s) => [String(s._id), s]))
    for (const p of items) {
      const s = byParent.get(String(p._id))
      if (s) {
        p.childCount = s.total
        p.convertedCount = s.converted
        p.activeChildCount = s.pending
        // 孩子名数组 + 状态 (前 3 个展示, 多了折叠)
        p.children = (namesByParent.get(String(p._id)) || []).map((c) => ({ name: c.name, status: c.status }))
      } else {
        p.childCount = 0
        p.convertedCount = 0
        p.activeChildCount = 0
        p.children = []
      }
    }
    // 最近一次试听
    const recent = await TrialBooking.aggregate([
      { $match: { org: require('mongoose').Types.ObjectId.createFromHexString(String(orgId)), parent: { $in: parentIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$parent',
          doc: { $first: '$$ROOT' }
        }
      }
    ])
    const recByParent = new Map(recent.map((r) => [String(r._id), r.doc]))
    for (const p of items) {
      const b = recByParent.get(String(p._id))
      if (b) {
        p.latestBooking = {
          id: String(b._id),
          attemptNo: b.attemptNo,
          status: b.status,
          scheduledAt: b.scheduledAt
        }
      }
    }
  }

  // 2026-06: 增补 hasProfile (任一画像字段非空 → true, 前端列表可显示 ✓ 标记)
  // 2026-06-16 重构: 字段从 UserOrgRel 搬到 Parent, 直接从 items 读 Parent 文档字段
  //   - Parent 字段有 default: '', 老文档不会是 undefined (不像 UserOrgRel 老文档那样 $ne:'' 误判)
  //   - 不需要再走 UserOrgRel 二次查询
  for (const p of items) {
    p.hasProfile = !!(
      (p.commStyle && p.commStyle !== '') ||
      (p.familyBg && p.familyBg !== '') ||
      (p.childFocus && p.childFocus !== '') ||
      (p.followUp && p.followUp !== '')
    )
  }

  return { items, total, page: p.page, pageSize: p.pageSize, scope: effectiveScope }
}

async function detail(id, orgId) {
  const parent = await Parent.findOne({ _id: id, org: orgId })
    .populate('promoteBy', 'mobile realName')
    .populate('user', 'mobile realName requirePasswordChange')
    .populate('tags', 'name model')
    .populate('source', 'name model')
    .populate('referrer', 'phone lifecycle')
    .populate('createdBy', 'mobile realName')
    .lean()
  if (!parent) throw ApiError.notFound('家长账户不存在')

  // 全部 ChildLead (按 createdAt 升序, 第 1/2/3 个孩子自然排出来)
  const childLeads = await ChildLead.find({ parent: parent._id, org: orgId })
    .populate('school', 'name')
    .populate('trialSubject', 'name')
    .populate('inviteTeacher', 'mobile realName')
    .populate('createdBy', 'mobile realName')
    .populate('convertedStudent', 'name')
    .sort({ createdAt: 1 })
    .lean()

  // 聚合: 全部触点 (按时间倒序, limit 50)
  const activities = await LeadActivity.find({ lead: { $in: childLeads.map((c) => c._id) }, org: orgId })
    .populate('byUser', 'mobile realName')
    .populate('lead', 'name')
    .sort({ at: -1 })
    .limit(50)
    .lean()

  // 全部 TrialBooking (按 createdAt desc)
  const bookings = await TrialBooking.find({ parent: parent._id, org: orgId })
    .populate('preStudent', 'name')
    .populate('teacher', 'mobile realName')
    .populate('subject', 'name')
    .sort({ createdAt: -1 })
    .lean()

  parent.childLeads = childLeads
  parent.activities = activities
  parent.bookings = bookings

  // 2026-06: 增补家长沟通画像 (Parent 上的 4 字段, 跨机构独立; 2026-06-16 从 UserOrgRel 搬过来)
  // 直接从 parent 文档读, 任何阶段 (潜客 / 已转化) 都有值
  const fresh = await Parent.findById(parent._id)
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  parent.profile = parentProfile.shapeProfile(fresh)

  return parent
}

/* ─── 创建家长 + 第一个孩子 (单 API 核心) ─────────── */

async function withChild({ orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  // 软唯一: phone 命中检查
  if (!body.force) {
    const existing = await Parent.findOne({ org: orgId, phone: body.phone }).lean()
    if (existing) {
      return { duplicate: true, parent: existing }
    }
  }
  // 解析试听科目类别数组 (2026-06-18: 改用 Category(model='Subject'))
  const rawSubjects = Array.isArray(body.trialSubjects) && body.trialSubjects.length > 0
    ? body.trialSubjects
    : (body.trialSubject ? [body.trialSubject] : [])
  const subjectIds = [...new Set(rawSubjects.filter(Boolean).map((s) => String(s)))]
  if (subjectIds.length > 0) {
    const Category = require('@models/Category.model')
    const validCount = await Category.countDocuments({
      _id: { $in: subjectIds },
      org: orgId,
      model: 'Subject'
    })
    if (validCount !== subjectIds.length) {
      throw ApiError.badRequest('试听科目类别包含不存在或不属于本机构的项')
    }
  }

  // 1) 建 Parent
  // source 默认 = 地推 (Channel 字典 _id); admin 未跑 channel.seed 时为 null
  // 2026-06-21: 删 consultant (谈单老师挂到 TrialBooking.consultant, 不在 Parent 上)
  const defaultChannelId = await getDefaultChannelId()
  const parent = await Parent.create({
    org: orgId,
    phone: body.phone,
    source: body.source || defaultChannelId || null,
    sourceDetail: body.sourceDetail || '',
    promoteBy: body.promoteBy || currentUser.id,
    referrer: body.referrer || null,
    remark: body.remark || '',
    createdBy: currentUser.id,
    lifecycle: 'new'
  })

  // 2) 建 ChildLead
  // trialFee 默认 19.90 元 (单次试听标准价, 纯记账不接支付)
  // source 优先用 body.source (用户可在录入时改); 否则继承 parent.source
  const child = await ChildLead.create({
    org: orgId,
    parent: parent._id,
    name: body.name,
    gender: body.gender || null,
    age: body.age || null,
    school: body.school || null,
    grade: body.grade || '',
    className: body.className || '',
    trialSubject: subjectIds[0] || null,
    trialSubjects: subjectIds,
    trialFee: body.trialFee != null && body.trialFee !== '' ? body.trialFee : 19.90,
    inviteTeacher: body.inviteTeacher || currentUser.id,
    expectedTime: body.expectedTime || '',
    specificDate: body.specificDate || null,
    source: body.source || parent.source || defaultChannelId || null,
    remark: body.remark || '',
    createdBy: currentUser.id,
    status: 'pending'
  })

  // 3) 按 subjectIds 长度自动建 N 笔 TrialBooking
  // 2026-06-21: 删 joinMode 字段 (attached 模式下线, 试听课不再走排课系统)
  const bookingCount = Math.max(subjectIds.length, 1)
  const bookings = []
  for (let i = 0; i < bookingCount; i++) {
    bookings.push({
      org: orgId,
      preStudent: child._id,
      parent: parent._id,
      attemptNo: i + 1,
      status: 'awaiting_schedule',
      subject: subjectIds[i] || null,
      createdBy: currentUser.id
    })
  }
  if (bookings.length > 0) await TrialBooking.insertMany(bookings)

  return { duplicate: false, parent: parent.toObject(), childLead: child.toObject() }
}

/* ─── 录入同家长其他孩子 ─────────────────────────── */

async function addChild({ orgId, currentUser, id, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const parent = await Parent.findOne({ _id: id, org: orgId }).lean()
  if (!parent) throw ApiError.notFound('家长账户不存在')

  // 解析试听科目类别数组 (2026-06-18: 改用 Category(model='Subject'))
  const rawSubjects = Array.isArray(body.trialSubjects) && body.trialSubjects.length > 0
    ? body.trialSubjects
    : (body.trialSubject ? [body.trialSubject] : [])
  const subjectIds = [...new Set(rawSubjects.filter(Boolean).map((s) => String(s)))]
  if (subjectIds.length > 0) {
    const Category = require('@models/Category.model')
    const validCount = await Category.countDocuments({
      _id: { $in: subjectIds },
      org: orgId,
      model: 'Subject'
    })
    if (validCount !== subjectIds.length) {
      throw ApiError.badRequest('试听科目类别包含不存在或不属于本机构的项')
    }
  }

  // 1) 建 ChildLead
  // trialFee 默认 19.90 元 (单次试听标准价, 纯记账不接支付)
  // source: 优先 body.source → 继承 parent.source → 兜底 defaultChannel
  const defaultChannelId = await getDefaultChannelId()
  const child = await ChildLead.create({
    org: orgId,
    parent: parent._id,
    name: body.name,
    gender: body.gender || null,
    age: body.age || null,
    school: body.school || null,
    grade: body.grade || '',
    className: body.className || '',
    trialSubject: subjectIds[0] || null,
    trialSubjects: subjectIds,
    trialFee: body.trialFee != null && body.trialFee !== '' ? body.trialFee : 19.90,
    inviteTeacher: body.inviteTeacher || currentUser.id,
    expectedTime: body.expectedTime || '',
    specificDate: body.specificDate || null,
    source: body.source || parent.source || defaultChannelId || null,
    sameAs: Array.isArray(body.sameAs) ? body.sameAs : [],
    remark: body.remark || '',
    createdBy: currentUser.id,
    status: 'pending'
  })

  // 2) 自动建 N 笔 TrialBooking
  // 2026-06-21: 删 joinMode 字段 (attached 模式下线, 试听课不再走排课系统)
  const bookingCount = Math.max(subjectIds.length, 1)
  const bookings = []
  for (let i = 0; i < bookingCount; i++) {
    bookings.push({
      org: orgId,
      preStudent: child._id,
      parent: parent._id,
      attemptNo: i + 1,
      status: 'awaiting_schedule',
      subject: subjectIds[i] || null,
      createdBy: currentUser.id
    })
  }
  if (bookings.length > 0) await TrialBooking.insertMany(bookings)

  // 3) Parent.lifecycle 重算 (新加孩子不算报名, 仍是 'new' 或 'partial')
  await recomputeLifecycle(parent._id)

  return child.toObject()
}

/* ─── 批量导入潜客 (Excel 上传后, 前端调用) ───────────
 * 设计 (2026-06-20 升级):
 *   - 部分成功: 单行失败不抛错, 收集到 results
 *   - 复用 withChild / addChild 避免重写业务逻辑
 *   - 幂等: 同 phone+name 跳过 (不报错也不更新)
 *   - 顺序处理, 避免瞬时连接池压力
 *   - **新字段 name→id 批量解析** (避免 N+1):
 *       school (School.name) / trialSubject (Category.model='Subject'.name)
 *       inviteTeacher (User.realName OR User.mobile, 本 org 内)
 *   - **age 兜底试听科目**: <6 → 大颗粒, 6-8 → Spike, 其他 → Scratch
 *       用户填的名称在字典中查不到时触发, 仍写空 trialSubject (前端要看到 status)
 *   - **inviteTeacher 兜底**: 查不到 User 时回退为上传人 (currentUser)
 *   - school 找不到时**不报错**, 留空
 *
 * 单行处理流程:
 *   1) 解析字段 (name→id + 兜底) → 组装 childBody
 *   2) 查 Parent by (org, phone) → 不存在 → 调 withChild
 *   3) 存在 → 查 ChildLead.findOne({parent, name}) → 存在 → 跳过 (skip)
 *   4) 不存在 → 调 addChild (自动 recompute lifecycle)
 *   5) 任一步 throw → 收集 error, 继续下一行
 */
async function bulkImport({ orgId, currentUser, rows }) {
  if (!currentUser) throw ApiError.unauthorized()
  if (!Array.isArray(rows) || rows.length === 0) {
    throw ApiError.badRequest('rows 不能为空')
  }

  // ─── 1) 批量预解析 (避免 N+1) ──────────────────────
  const School = require('@models/School.model')
  const User = require('@models/User.model')

  // 收集唯一值
  const schoolNames = [...new Set(
    rows.map((r) => String(r.school || '').trim()).filter(Boolean)
  )]
  const subjectNames = [...new Set(
    rows.map((r) => String(r.trialSubject || '').trim()).filter(Boolean)
  )]
  const teacherKeys = [...new Set(
    rows.map((r) => String(r.inviteTeacher || '').trim()).filter(Boolean)
  )]

  // 学校 name → id (按本 org)
  /** @type {Map<string, any>} */
  const schoolMap = new Map()
  if (schoolNames.length > 0) {
    const schools = await School.find({ org: orgId, name: { $in: schoolNames } })
      .select('_id name').lean()
    for (const s of schools) schoolMap.set(s.name, s._id)
  }

  // 试听科目 name → id (Category model='Subject', 按本 org)
  /** @type {Map<string, any>} */
  const subjectMap = new Map()
  if (subjectNames.length > 0) {
    const cats = await Category.find({
      org: orgId,
      model: 'Subject',
      name: { $in: subjectNames }
    }).select('_id name').lean()
    for (const c of cats) subjectMap.set(c.name, c._id)
  }

  // 年龄兜底科目 (大颗粒 / Spike / Scratch) — 全局查 (Category 是 per-org, 但若本 org 没 seed 这些, fallback 也找不到)
  //   业务上兜底项是平台通用, 用 name 全局匹配
  /** @type {Map<string, any>} */
  const defaultSubjectMap = new Map()
  {
    const ds = await Category.find({
      model: 'Subject',
      name: { $in: ['大颗粒', 'Spike', 'Scratch'] }
    }).select('_id name').lean()
    for (const s of ds) defaultSubjectMap.set(s.name, s._id)
  }

  // 老师 name/mobile → id (User, 限本 org)
  /** @type {Map<string, any>} */
  const teacherMap = new Map()
  if (teacherKeys.length > 0) {
    // 1) 先按 realName / mobile 找 User (不限 org)
    const users = await User.find({
      isActive: true,
      $or: [
        { realName: { $in: teacherKeys } },
        { mobile: { $in: teacherKeys } }
      ]
    }).select('_id realName mobile').lean()

    if (users.length > 0) {
      // 2) 过滤出本 org 关联过的 (避免跨 org 误命中)
      const userIds = users.map((u) => u._id)
      const rels = await UserOrgRel.find({
        org: orgId,
        user: { $in: userIds }
      }).select('user').lean()
      const inOrgUserIds = new Set(rels.map((r) => String(r.user)))
      for (const u of users) {
        if (!inOrgUserIds.has(String(u._id))) continue
        // 双键: realName 和 mobile 都可查
        if (u.realName) teacherMap.set(u.realName, u._id)
        if (u.mobile) teacherMap.set(u.mobile, u._id)
      }
    }
  }

  // ─── 2) 行循环 (复用 withChild / addChild) ──────────
  const results = []
  let created = 0         // 新建 Parent
  let addedToExisting = 0 // 已有 Parent, 新加 ChildLead
  let skipCount = 0       // 同 phone+name 跳过

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const phone = String(r.phone || '').trim()
    const name = String(r.name || '').trim()
    const baseRow = { rowNo: i + 1, phone, name }

    // ── 2a) 字段解析 (含兜底) ──
    const age = Number(r.age)
    const schoolName = String(r.school || '').trim()
    const subjectName = String(r.trialSubject || '').trim()
    const teacherKey = String(r.inviteTeacher || '').trim()
    const grade = String(r.grade || '').trim()
    const className = String(r.className || '').trim()

    // 试听科目: 用户填的有效名 → 用; 否则按 age 兜底
    let subjectId = null
    let subjectResolvedName = ''
    let subjectSource = ''
    if (subjectName && subjectMap.has(subjectName)) {
      subjectId = subjectMap.get(subjectName)
      subjectResolvedName = subjectName
      subjectSource = 'matched'
    } else {
      // age 兜底
      let defaultName
      if (age < 6) defaultName = '大颗粒'
      else if (age >= 6 && age <= 8) defaultName = 'Spike'
      else defaultName = 'Scratch'
      subjectId = defaultSubjectMap.get(defaultName) || null
      subjectResolvedName = subjectId ? defaultName : ''
      subjectSource = subjectId
        ? (subjectName ? `age-default:${defaultName} (input:"${subjectName}"未找到)` : `age-default:${defaultName}`)
        : 'unresolved'
    }

    // 学校: 找不到则空
    const schoolId = schoolName ? (schoolMap.get(schoolName) || null) : null
    const schoolSource = !schoolName
      ? 'empty'
      : (schoolId ? 'matched' : 'not-found-empty')

    // 邀约老师: 找不到则用上传人
    let teacherId = null
    let teacherSource = ''
    if (teacherKey) {
      teacherId = teacherMap.get(teacherKey) || null
      if (teacherId) {
        teacherSource = 'matched'
      } else {
        teacherId = currentUser.id || currentUser._id
        teacherSource = `fallback-uploader (input:"${teacherKey}"未找到)`
      }
    } else {
      teacherId = currentUser.id || currentUser._id
      teacherSource = 'empty-uploader'
    }

    // ── 2b) 写入 ──
    const childBody = {
      name,
      age,
      trialSubjects: subjectId ? [subjectId] : [],
      school: schoolId,
      grade,
      className,
      inviteTeacher: teacherId
    }

    try {
      const parent = await Parent.findOne({ org: orgId, phone }).lean()
      if (!parent) {
        const result = await withChild({
          orgId,
          currentUser,
          body: { phone, ...childBody }
        })
        created++
        results.push({
          ...baseRow, status: result.duplicate ? 'skipped' : 'created',
          resolved: {
            trialSubject: subjectResolvedName,
            school: schoolName || '',
            grade, className,
            inviteTeacher: teacherKey || '',
            trialSubjectSource: subjectSource,
            schoolSource, teacherSource
          }
        })
        continue
      }

      const existingChild = await ChildLead.findOne({ parent: parent._id, name }).lean()
      if (existingChild) {
        skipCount++
        results.push({
          ...baseRow, status: 'skipped',
          resolved: {
            trialSubject: subjectResolvedName,
            school: schoolName || '',
            grade, className,
            inviteTeacher: teacherKey || '',
            trialSubjectSource: subjectSource,
            schoolSource, teacherSource
          }
        })
        continue
      }

      await addChild({
        orgId,
        currentUser,
        id: parent._id,
        body: childBody
      })
      addedToExisting++
      results.push({
        ...baseRow, status: 'added',
        resolved: {
          trialSubject: subjectResolvedName,
          school: schoolName || '',
          grade, className,
          inviteTeacher: teacherKey || '',
          trialSubjectSource: subjectSource,
          schoolSource, teacherSource
        }
      })
    } catch (err) {
      const msg = err && err.message ? err.message : '未知错误'
      results.push({
        ...baseRow, status: 'failed', error: msg,
        resolved: {
          trialSubject: subjectResolvedName,
          school: schoolName || '',
          grade, className,
          inviteTeacher: teacherKey || '',
          trialSubjectSource: subjectSource,
          schoolSource, teacherSource
        }
      })
    }
  }

  const failCount = results.filter((x) => x.status === 'failed').length
  return {
    total: rows.length,
    successCount: created + addedToExisting + skipCount,
    skipCount,
    failCount,
    created,
    addedToExisting,
    rows: results
  }
}

/* ─── 更新 (基础信息) ─────────────────────────── */

async function update(id, orgId, body) {
  // phone 不允许改 (业务唯一键); user/tags/firstContactedAt 等走专门端点
  // lifecycle 2026-06-15 放开: 允许手动改, 但跟 '已流失' 标签 (addTag 强制 lost) 优先级不同
  //   - 手动改 lifecycle 后, '已流失' 标签会再次翻 lost
  //   - recompute-lifecycle (手动同步状态) 会覆盖手动值
  const safe = { ...body }
  delete safe.phone
  delete safe.user
  delete safe.tags
  delete safe.createdBy
  delete safe.firstContactedAt
  delete safe.lastContactedAt
  delete safe.lastContactedBy
  const doc = await Parent.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: safe },
    { new: true, runValidators: true }
  ).lean()
  if (!doc) throw ApiError.notFound('家长账户不存在')
  return doc
}

/* ─── lifecycle 重算 (手动) ───────────────────── */

async function recompute({ id, orgId }) {
  const parent = await Parent.findOne({ _id: id, org: orgId }).lean()
  if (!parent) throw ApiError.notFound('家长账户不存在')
  const lifecycle = await recomputeLifecycle(id)
  return { id: String(id), lifecycle }
}

/* ─── 标签 (加 / 删) ─────────────────────────── */

async function addTag(id, orgId, tagId) {
  const parent = await Parent.findOne({ _id: id, org: orgId })
  if (!parent) throw ApiError.notFound('家长账户不存在')
  const Category = require('@models/Category.model')
  const tag = await Category.findOne({ _id: tagId, model: 'LeadTag' }).lean()
  if (!tag) throw ApiError.badRequest('标签不存在或非 LeadTag 字典')
  // 校验不重复
  if (parent.tags.some((t) => String(t) === String(tagId))) {
    return { id: String(id), tag: tagId, duplicate: true }
  }
  parent.tags.push(tagId)
  await parent.save()
  // 若加 '已流失' 标签, 强制 lifecycle='lost'
  if (tag.name === '已流失') {
    parent.lifecycle = 'lost'
    await parent.save()
  }
  return { id: String(id), tag: tagId, duplicate: false }
}

async function removeTag(id, orgId, tagId) {
  const parent = await Parent.findOne({ _id: id, org: orgId })
  if (!parent) throw ApiError.notFound('家长账户不存在')
  parent.tags = parent.tags.filter((t) => String(t) !== String(tagId))
  await parent.save()
  // 重算 lifecycle (可能从 'lost' 恢复)
  await recomputeLifecycle(id)
  return { id: String(id), tag: tagId }
}

/* ─── 触点时间线 (聚合该家长下所有孩子的触点) ───── */

async function listActivities(id, orgId) {
  const parent = await Parent.findOne({ _id: id, org: orgId }).lean()
  if (!parent) throw ApiError.notFound('家长账户不存在')
  const childLeadIds = await ChildLead.find({ parent: parent._id }).select('_id').lean()
  const ids = childLeadIds.map((c) => c._id)
  if (ids.length === 0) return []
  return LeadActivity.find({ lead: { $in: ids }, org: orgId })
    .populate('byUser', 'mobile realName')
    .populate('lead', 'name')
    .sort({ at: -1 })
    .lean()
}

/* ─── 物理删除 (互锁) ───────────────────────── */

function parentUsageChecks(orgId, parentId) {
  // LeadActivity 引用通过 childLead 派生, service 内先查 childLeadIds 再 count
  return [
    {
      model: ChildLead,
      filter: { org: orgId, parent: parentId },
      label: '孩子潜客', hint: '请先删除该家长下的所有孩子'
    },
    {
      model: TrialBooking,
      filter: { org: orgId, parent: parentId },
      label: '试听记录', hint: '请先删除该家长的所有试听'
    }
  ]
}

async function remove({ id, orgId }) {
  const doc = await Parent.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('家长账户不存在')
  // 第三项 LeadActivity 互锁 (派生自 childLead)
  const childLeadIds = await ChildLead.find({ parent: id }).select('_id').lean()
  const ids = childLeadIds.map((c) => c._id)
  if (ids.length > 0) {
    await removable.assertUnused(orgId, [
      ...parentUsageChecks(orgId, id),
      {
        model: LeadActivity,
        filter: { org: orgId, lead: { $in: ids } },
        label: '触点日志', hint: '触点日志将一并删除'
      }
    ])
  } else {
    await removable.assertUnused(orgId, parentUsageChecks(orgId, id))
  }
  // 物理删除 (级联: childLeads + bookings + activities)
  if (ids.length > 0) {
    await LeadActivity.deleteMany({ lead: { $in: ids } })
    await TrialBooking.deleteMany({ parent: id })
    await ChildLead.deleteMany({ parent: id })
  }
  await Parent.deleteOne({ _id: id, org: orgId })
  return { id: String(id), deleted: true }
}

async function removableCheck({ id, orgId }) {
  const childLeadIds = await ChildLead.find({ parent: id }).select('_id').lean()
  const ids = childLeadIds.map((c) => c._id)
  const checks = ids.length > 0
    ? [
        ...parentUsageChecks(orgId, id),
        { model: LeadActivity, filter: { org: orgId, lead: { $in: ids } }, label: '触点日志', hint: '触点日志将一并删除' }
      ]
    : parentUsageChecks(orgId, id)
  return removable.check(orgId, checks)
}

module.exports = {
  list, detail, withChild, addChild, bulkImport, update, recompute,
  addTag, removeTag, listActivities,
  remove, removableCheck,
  recomputeLifecycle,    // 供 trialBooking/childLead 服务调用
  parentUsageChecks,
  getDefaultChannelId,   // 默认渠道解析
  _resetDefaultChannelCache
}
