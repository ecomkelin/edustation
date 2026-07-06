'use strict'

const mongoose = require('mongoose')
const Org = require('@models/Org.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const positionService = require('@modules/position/position.service')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const { normalizePagination } = require('@utils/pagination')

const POPULATE_REGION = { path: 'region', select: 'name code level' }
const POPULATE_PRINCIPAL = { path: 'principal', select: 'mobile realName' }

/**
 * 2026-06: Org.type 已从 ObjectId(Category) 改成 String enum (10 种),
 * 不再需要 populate。type 字段值见 @shared/enums#ORG_TYPES / ORG_TYPE_LABELS.
 */

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
    .populate({ path: 'user', match: { isActive: true }, select: 'mobile realName avatarSvgKey isActive' })
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

/**
 * R-0932 公开机构主页 (2026-07-02 立项, 2026-07-03 扩展学科/老师/课包)
 *
 * 输入:
 *   - id (Org._id)
 *
 * 行为:
 *   1. 校验 id 合法, 找到 org (停用也算找到, 但前端自行判断是否展示)
 *   2. populate region (只取 name + code, 不暴露 full region)
 *   3. 并发拉 OrgPromotion (lazy require, 避免循环引用)
 *   4. 并发拉学科 (Category, model=Subject) + 教师列表 (User, roleScope=staff) + 上架课程产品 (CourseProduct)
 *   5. 输出白名单字段 + 拼装 promotionSummary
 *
 * 不输出 (PII / 合规):
 *   - socialCreditCode, legalPerson, licenseNumber (平台超管专属)
 *   - principal (User ref)
 *   - meta (Mixed)
 *   - 教师 mobile / passwordHash / position 等敏感字段
 *
 * 返回:
 *   {
 *     id, name, nameAbbreviation, type, logo, address,
 *     establishedDate, isActive,     // 基础信息
 *     region: { name, code },        // 简化 Region (无 parent 链)
 *     contact: { person, phone },    // 联系方式
 *     promotionSummary: { ... },
 *     subjects: [{key, name}],       // 学科字典 (per-org 切片 + 平台默认合并, dedup by key)
 *     teachers: [{id, realName, avatar, title, bio}],
 *     products: [{id, name, subject, cover, totalLessons, price, originalPrice, promotionActive, promotionPrice}]
 *   }
 */
async function publicOrg(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('机构 id 不合法')
  const org = await Org.findById(id)
    .populate({ path: 'region', select: 'name code level' })
    .lean()
  if (!org) throw ApiError.notFound('机构不存在')

  // lazy require 防循环依赖
  const OrgPromotion = require('@models/OrgPromotion.model')
  const Category = require('@models/Category.model')
  const UserOrgRel = require('@models/UserOrgRel.model')
  const CourseProduct = require('@models/CourseProduct.model')

  const [promo, subjectCats, teacherRels, products] = await Promise.all([
    OrgPromotion.findOne({ org: org._id }).lean(),
    // 学科: per-org Category (model=Subject) + platform 默认 (org=null OR $exists:false),
    // dedup by key, 机构优先
    Category.find({
      model: 'Subject',
      isActive: true,
      $or: [{ org: org._id }, { org: null }, { org: { $exists: false } }]
    })
      .select('key name org')
      .lean(),
    // 教师: UserOrgRel (showAsTeacher=true) → populate User 取公共画像
    // 注意: 不限定 isMain, 因为兼职老师 isMain=false (main 留给校长/管理员),
    // 但作为该机构的"名师"展示与主岗无关。
    // 同时 populate rel.positions 拿 clientLevel, 用来在 service 层 filter 掉纯家长 (clientLevel > 0)
    UserOrgRel.find({ org: org._id, showAsTeacher: true })
      .populate({ path: 'user', select: 'realName avatarSvgKey title bio isActive' })
      .populate({ path: 'positions', select: 'clientLevel name' })
      .lean(),
    // 上架课程产品: isActive=true, 按创建时间倒序, 取前 20 防止首屏过载
    // 注意: CourseProduct 字段名是 subjects (数组复数) 不是 subject
    CourseProduct.find({ org: org._id, isActive: true })
      .populate({ path: 'subjects', select: 'key name' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
  ])

  // 拼装白名单 (避免直接 spread 全字段, 防止后续 schema 加新字段自动外漏)
  const out = {
    id: String(org._id),
    name: org.name,
    nameAbbreviation: org.nameAbbreviation,
    type: org.type,
    logo: org.logo,
    address: org.address || '',
    establishedDate: org.establishedDate,
    isActive: org.isActive,
    region: org.region
      ? { name: org.region.name, code: org.region.code, level: org.region.level }
      : null,
    contact: {
      person: org.contactPerson || '',
      phone: org.contactPhone || ''
    },
    promotionSummary: promo
      ? {
          description: promo.description || '',
          brandStory: promo.brandStory || '',
          teachingFeatures: promo.teachingFeatures || [],
          facultyIntro: promo.facultyIntro || '',
          businessHours: promo.businessHours || '',
          businessScope: promo.businessScope || [],
          hotline: promo.hotline || '',
          serviceWechat: promo.serviceWechat || '',
          serviceQq: promo.serviceQq || '',
          email: promo.email || '',
          website: promo.website || '',
          wechatPublic: promo.wechatPublic || '',
          douyin: promo.douyin || '',
          xiaohongshu: promo.xiaohongshu || '',
          videoAccount: promo.videoAccount || '',
          longitude: promo.longitude,
          latitude: promo.latitude,
          nearbyLandmark: promo.nearbyLandmark || '',
          registeredCapital: promo.registeredCapital || '',
          honors: promo.honors || []
        }
      : null,
    // 学科字典 (dedup by key: 机构 per-org 覆盖平台默认)
    subjects: (() => {
      const map = new Map()
      for (const c of subjectCats) {
        if (!c.key) continue
        // 机构优先 (org === orgId 的覆盖 org=null 的)
        if (!map.has(c.key) || String(c.org) === String(org._id)) {
          map.set(c.key, { key: c.key, name: c.name })
        }
      }
      return Array.from(map.values())
    })(),
    // 教师列表 (三层防护: 总开关 + 行级勾选 + 岗位 clientLevel 兜底拦截纯家长)
    // 1) Org.showTeacherTeam 总开关: false 直接不放
    // 2) query 已经加了 showAsTeacher=true (上面)
    // 3) service 兜底: rel.positions 里只要有一个 clientLevel > 0 (家长岗), 就排除
    //    (员工岗 clientLevel=0; 混合岗按"含家长岗"处理 → 不展示)
    teachers: org.showTeacherTeam
      ? (teacherRels || [])
          .filter((r) => {
            if (!r.user || r.user.isActive === false) return false
            const positions = Array.isArray(r.positions) ? r.positions : []
            // 兜底拦截纯家长 (或兼任家长岗的复合身份)
            const isGuardian = positions.some((p) => Number(p.clientLevel) > 0)
            return !isGuardian
          })
          .map((r) => ({
            id: String(r.user._id),
            realName: r.user.realName || '老师',
            avatarSvgKey: r.user.avatarSvgKey || null,
            title: r.user.title || '',
            bio: r.user.bio || ''
          }))
      : [],
    // 课程产品 (即"课包"; isActive, 限前 20 按 createdAt 倒序)
    // CourseProduct.subjects 是数组; 业务上首页只展示第 1 个作为代表
    products: (products || []).map((p) => {
      const firstSubject = Array.isArray(p.subjects) ? p.subjects[0] : null
      return {
        id: String(p._id),
        name: p.name,
        subject: firstSubject ? { key: firstSubject.key, name: firstSubject.name } : null,
        subjectKeys: Array.isArray(p.subjects) ? p.subjects.map((s) => s.key).filter(Boolean) : [],
        totalLessons: p.totalLessons || 0,
        price: p.price || 0,
        originalPrice: p.originalPrice || p.price || 0,
        promotionActive: !!p.promotionActive,
        promotionPrice: p.promotionPrice || 0
      }
    })
  }
  return out
}

module.exports = { list, detail, create, update, toggleActive, candidatePrincipals, public: publicOrg }
