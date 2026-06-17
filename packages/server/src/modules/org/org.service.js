'use strict'

const mongoose = require('mongoose')
const Org = require('@models/Org.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const positionService = require('@modules/position/position.service')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const { normalizePagination } = require('@utils/pagination')

const POPULATE_TYPE = { path: 'type', select: 'name model level' }
const POPULATE_REGION = { path: 'region', select: 'name code level' }
const POPULATE_PRINCIPAL = { path: 'principal', select: 'mobile realName' }

/* ─── 字段权限分层 (2026-06 引入) ───
 * Org 表上分三档权限:
 *   1. super-admin-only (合规/身份类): 仅平台超管可写
 *      - unicode / name / nameAbbreviation / socialCreditCode / legalPerson / licenseNumber
 *      - principal / type / region / establishedDate
 *   2. shared (展示/联系类): 平台超管 + 机构 admin 均可写
 *      - contactPerson / contactPhone / address / logo
 *   3. 不可写: isActive (走 toggle-active) / _id / timestamps
 *
 * 为什么在 service 层硬卡, 不依赖前端隐藏:
 *   - 前端可以绕过; 非法请求直接返回 403
 *   - "机构 admin 改基础信息" 这个功能未来若有需求, 加在 shared 即可, 老接口不变
 */
const SUPER_ADMIN_ONLY_FIELDS = new Set([
  'unicode',
  'name',
  'nameAbbreviation',
  'socialCreditCode',
  'legalPerson',
  'licenseNumber',
  'principal',
  'type',
  'region',
  'establishedDate'
])

async function list({ keyword, type, region, isActive, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = {}
  if (keyword) {
    filter.$or = [
      { name: { $regex: keyword, $options: 'i' } },
      { nameAbbreviation: { $regex: keyword, $options: 'i' } },
      { unicode: { $regex: keyword, $options: 'i' } },
      // 2026-06: 同时按对外信用代码搜索
      { socialCreditCode: { $regex: keyword, $options: 'i' } }
    ]
  }
  if (type) filter.type = type
  if (region) filter.region = region
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false

  const [items, total] = await Promise.all([
    Org.find(filter)
      .populate(POPULATE_TYPE)
      .populate(POPULATE_REGION)
      .populate(POPULATE_PRINCIPAL)
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Org.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id) {
  const org = await Org.findById(id)
    .populate(POPULATE_TYPE)
    .populate(POPULATE_REGION)
    .populate(POPULATE_PRINCIPAL)
    .lean()
  if (!org) throw ApiError.notFound('机构不存在')
  return org
}

async function create(payload, options = {}) {
  // options.fileBindOrgId —— 上传 logo 时用的源 org id（req.orgId）。
  // 重要：fileBind.diffSingle 的 orgId 是"文件归属校验"用的，应该是**上传时**的 org，
  // 而不是"新创建的 org"（创建场景下两者通常不同，会被 isOurFile 判定为跨租户而跳过）。
  // 校验 principal：创建阶段无 org 上下文，principal 创建后再校验归属；
  // 这里仅做 ObjectId 合法性校验（validator 已处理）
  const org = await Org.create(payload)
  // 机构落地后立刻建好默认职位（含 clientLevel=1 的「基础家长」位），
  // 这样 C 端家长注册、添加监护人等链路不需要再做条件补偿。
  try {
    await positionService.ensureDefaultPositions(org._id)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[org.create] ensureDefaultPositions failed: org=${org._id}`, e.message)
  }
  // 招生试听 (2026-06): 立刻建 [试听专用] CourseInstance, 让批量排课可即时使用
  try {
    const courseInstanceService = require('../courseInstance/courseInstance.service')
    await courseInstanceService.ensureTrialCourseInstance(org._id)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[org.create] ensureTrialCourseInstance failed: org=${org._id}`, e.message)
  }

  // 法律协议 (2026-06): 给新机构 seed 默认机构级协议 (购买协议 + 退费规则).
  // 失败不阻断创建 (协议可后续手动补)
  try {
    const orgDefaultLegal = require('./orgDefaultLegal')
    await orgDefaultLegal.seedDefaultLegalDocs(org._id)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[org.create] seedDefaultLegalDocs failed: org=${org._id}`, e.message)
  }

  // logo 字段在创建时也需要 fileBind 绑定。
  // 前端可能在新建时直接传 logo url（场景：上传完一张新 logo 后点"确定"创建机构）。
  // 若不绑定，File 文档会 refCount=0 / isOrphan=true，"文件管理"里出现孤儿。
  // update() 路径已用同样模式处理；create() 此处补齐。
  // orgId 参数用**上传时**的 org（即 options.fileBindOrgId），不是新建 org 自己。
  if (org.logo) {
    const { REF_ENTITY } = require('@models/File.model')
    const fileBind = require('@modules/storage/fileBind')
    try {
      await fileBind.diffSingle({
        orgId: options.fileBindOrgId || org._id,
        oldUrl: null,
        newUrl: org.logo,
        entity: REF_ENTITY.ORG,
        entityId: org._id,
        field: 'logo'
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[org.create] logo diffSingle FAILED:', e)
    }
  }

  return Org.findById(org._id)
    .populate(POPULATE_TYPE)
    .populate(POPULATE_REGION)
    .populate(POPULATE_PRINCIPAL)
    .lean()
}

async function update(id, payload, options = {}) {
  // 2026-06: 字段权限分层。options.isPlatformAdmin=false 时, 拒绝任何 super-admin-only 字段
  // (前端隐藏是 UX, 这里硬卡是安全)
  const isSuperAdmin = options.isPlatformAdmin === true
  if (!isSuperAdmin) {
    const attempted = Object.keys(payload).filter((k) => SUPER_ADMIN_ONLY_FIELDS.has(k))
    if (attempted.length > 0) {
      throw ApiError.forbidden(`以下字段仅平台超管可改: ${attempted.join(', ')}`)
    }
  }

  // principal 必须属于本机构
  if (payload.principal) {
    const rel = await UserOrgRel.findOne({ user: payload.principal, org: id }).select('_id').lean()
    if (!rel) throw ApiError.badRequest('负责人必须属于本机构')
  }

  // 兼容传入 null 来清空
  if (payload.principal === null || payload.principal === '') {
    payload.principal = null
  }

  // logo 字段更新 → fileBind diff。
  // 关键：orgId 用**上传时**的 org（即 options.fileBindOrgId，对应 req.orgId），
  // 而不是被编辑 org 的 id。平台超管在"绵阳 scope"下编辑"梓潼"时，logo 是用绵阳
  // 的 x-org-id 上传的，File.org=绵阳，绑 file 时必须用 fileBindOrgId=绵阳；
  // 用 id=梓潼 调 diffSingle 会被 isOurFile 误判为跨租户而跳过 → 孤儿。
  let prevLogo = null
  if (Object.prototype.hasOwnProperty.call(payload, 'logo')) {
    const prev = await Org.findById(id).select('logo').lean()
    prevLogo = prev ? prev.logo : null
  }

  const org = await Org.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
    .populate(POPULATE_TYPE)
    .populate(POPULATE_REGION)
    .populate(POPULATE_PRINCIPAL)
    .lean()
  if (!org) throw ApiError.notFound('机构不存在')

  if (Object.prototype.hasOwnProperty.call(payload, 'logo')) {
    const { REF_ENTITY } = require('@models/File.model')
    const fileBind = require('@modules/storage/fileBind')
    await fileBind.diffSingle({
      orgId: options.fileBindOrgId || id,
      oldUrl: prevLogo,
      newUrl: org.logo,
      entity: REF_ENTITY.ORG,
      entityId: org._id,
      field: 'logo'
    })
  }

  return org
}

// 机构不允许物理删除（由 routes 层去掉 DELETE 路由体现）。
// 启用/停用机构请走 toggleActive()。

/**
 * 敏感操作：启用/停用机构。需校验当前登录用户自己的密码。
 */
async function toggleActive(id, operatorId, plainPassword) {
  if (!operatorId) throw ApiError.unauthorized()
  if (!plainPassword) throw ApiError.badRequest('请输入密码')

  const operator = await User.findById(operatorId).select('+passwordHash').lean()
  if (!operator) throw ApiError.unauthorized('账号不存在')

  const ok = await password.verify(operator.passwordHash, plainPassword)
  if (!ok) throw ApiError.unauthorized('密码错误')

  const current = await Org.findById(id).select('isActive').lean()
  if (!current) throw ApiError.notFound('机构不存在')

  const org = await Org.findByIdAndUpdate(id, { isActive: !current.isActive }, { new: true })
    .populate(POPULATE_TYPE)
    .populate(POPULATE_REGION)
    .populate(POPULATE_PRINCIPAL)
    .lean()
  return org
}

/**
 * 本机构可选负责人列表：所有属于该机构、状态活跃的 User。
 * 供平台超管在编辑机构时选用。
 */
async function candidatePrincipals(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('机构 id 不合法')
  const org = await Org.findById(id).select('_id').lean()
  if (!org) throw ApiError.notFound('机构不存在')

  const rels = await UserOrgRel.find({ org: id })
    .populate({ path: 'user', match: { isActive: true }, select: 'mobile realName avatar isActive' })
    .lean()
  return rels
    .filter((r) => r.user)
    .map((r) => ({
      id: String(r.user._id),
      mobile: r.user.mobile,
      realName: r.user.realName,
      isMain: r.isMain
    }))
}

module.exports = { list, detail, create, update, toggleActive, candidatePrincipals }
