'use strict'

const mongoose = require('mongoose')
const CourseProduct = require('@models/CourseProduct.model')
const Subject = require('@models/Subject.model')
const Org = require('@models/Org.model')
const Order = require('@models/Order.model')
const StudentProduct = require('@models/StudentProduct.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')

/**
 * 把入参里的 subjects 字段规整成 ObjectId 数组。
 * 兼容旧版本：入参字段名仍允许是单值 `subject`，内部统一转成数组。
 */
function normalizeSubjects(input) {
  if (input === undefined) return undefined
  if (input === null) return []
  const arr = Array.isArray(input) ? input : [input]
  // 去重 + 仅保留合法 ObjectId
  const seen = new Set()
  const out = []
  for (const v of arr) {
    if (!v) continue
    const s = String(v)
    if (!mongoose.isValidObjectId(s)) {
      throw ApiError.badRequest('subjects 含非法 id')
    }
    if (seen.has(s)) continue
    seen.add(s)
    out.push(v)
  }
  return out
}

/**
 * 校验 subjects 数组中每个 id 都属于本机构。
 * 空数组（产品不挂学科）允许。
 */
async function assertSubjectsInOrg(orgId, subjects) {
  if (!subjects || subjects.length === 0) return
  const cnt = await Subject.countDocuments({ _id: { $in: subjects }, org: orgId })
  if (cnt !== subjects.length) {
    throw ApiError.badRequest('subjects 含有不属于本机构的 id')
  }
}

async function list({ orgId, subject, isActive, keyword }) {
  const filter = { org: orgId }
  // 兼容旧参数名 `subject`（单值）和新参数名 `subject`（仍接受，但按数组里包含匹配）
  if (subject) filter.subjects = subject
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  return CourseProduct.find(filter)
    .populate('subjects', 'name category')
    .sort({ createdAt: -1 })
    .lean()
}

async function detail(id, orgId) {
  const p = await CourseProduct.findOne({ _id: id, org: orgId })
    .populate('subjects', 'name category')
    .lean()
  if (!p) throw ApiError.notFound('课程产品不存在')
  return p
}

async function create({
  orgId,
  subjects,
  subject,
  name,
  totalLessons,
  minutesPerLesson,
  originalPrice,
  discountPrice,
  promotionPrice,
  promotionActive,
  validDays,
  attachments,
  isActive
}) {
  // 兼容旧字段名 `subject`（单值）— 若前端仍以单值提交，service 自动归并
  const raw = subjects !== undefined ? subjects : subject
  const normalized = normalizeSubjects(raw) || []
  await assertSubjectsInOrg(orgId, normalized)

  // 三档价格不变式校验（不依赖 Mongoose 的 schema-level validate，便于统一报错）
  if (originalPrice <= discountPrice) {
    throw ApiError.badRequest('originalPrice 必须大于 discountPrice')
  }
  if (promotionActive && discountPrice <= promotionPrice) {
    throw ApiError.badRequest('启用活动价时，promotionPrice 必须小于 discountPrice')
  }

  const normalizedAttachments = Array.isArray(attachments)
    ? attachments.filter((x) => x != null).map((x) => String(x))
    : []

  const doc = await CourseProduct.create({
    org: orgId,
    subjects: normalized,
    name,
    totalLessons,
    minutesPerLesson,
    originalPrice,
    discountPrice,
    promotionPrice: promotionPrice != null ? promotionPrice : 0,
    promotionActive: !!promotionActive,
    validDays,
    attachments: normalizedAttachments,
    isActive
  })

  if (normalizedAttachments.length) {
    const { REF_ENTITY } = require('@models/File.model')
    const fileBind = require('@modules/storage/fileBind')
    await fileBind.diffArrayById({
      orgId,
      oldIds: [],
      newIds: normalizedAttachments,
      entity: REF_ENTITY.COURSE_PRODUCT,
      entityId: doc._id,
      field: 'attachments'
    })
  }

  return detail(doc._id, orgId)
}

async function update(id, orgId, payload) {
  // 兼容旧字段名：旧版用 `subject`（单值），新版用 `subjects`（数组）
  if (payload.subjects === undefined && payload.subject !== undefined) {
    payload.subjects = payload.subject
    delete payload.subject
  }
  if (payload.subjects !== undefined) {
    payload.subjects = normalizeSubjects(payload.subjects)
    await assertSubjectsInOrg(orgId, payload.subjects)
  }
  // 移除旧字段名 `price`（已拆为三档）
  if (payload.price !== undefined) {
    // 兼容旧前端：若只传 price，把它当作 discountPrice
    if (payload.discountPrice === undefined) {
      payload.discountPrice = payload.price
    }
    delete payload.price
  }
  // 三档价格更新校验（基于更新后的最终值）
  if (
    payload.originalPrice !== undefined ||
    payload.discountPrice !== undefined ||
    payload.promotionPrice !== undefined ||
    payload.promotionActive !== undefined
  ) {
    const cur = await CourseProduct.findOne({ _id: id, org: orgId })
      .select('originalPrice discountPrice promotionPrice promotionActive')
      .lean()
    if (!cur) throw ApiError.notFound('课程产品不存在')
    const merged = {
      originalPrice: payload.originalPrice != null ? payload.originalPrice : cur.originalPrice,
      discountPrice: payload.discountPrice != null ? payload.discountPrice : cur.discountPrice,
      promotionPrice: payload.promotionPrice != null ? payload.promotionPrice : cur.promotionPrice,
      promotionActive: payload.promotionActive != null ? payload.promotionActive : cur.promotionActive
    }
    if (merged.originalPrice <= merged.discountPrice) {
      throw ApiError.badRequest('originalPrice 必须大于 discountPrice')
    }
    if (merged.promotionActive && merged.discountPrice <= merged.promotionPrice) {
      throw ApiError.badRequest('启用活动价时，promotionPrice 必须小于 discountPrice')
    }
  }
  // attachments 字段更新 → fileBind diff（ObjectId 数组 → url 数组 → diff）
  let prevAttachments = null
  if (Object.prototype.hasOwnProperty.call(payload, 'attachments')) {
    const prev = await CourseProduct.findOne({ _id: id, org: orgId }).select('attachments').lean()
    prevAttachments = prev ? (prev.attachments || []).map((x) => String(x)) : []
    // 规范化：确保都是 string id
    if (Array.isArray(payload.attachments)) {
      payload.attachments = payload.attachments.filter((x) => x != null).map((x) => String(x))
    } else {
      payload.attachments = []
    }
  }

  const doc = await CourseProduct.findOneAndUpdate(
    { _id: id, org: orgId },
    payload,
    { new: true, runValidators: true }
  )
  if (!doc) throw ApiError.notFound('课程产品不存在')

  if (prevAttachments !== null) {
    const { REF_ENTITY } = require('@models/File.model')
    const fileBind = require('@modules/storage/fileBind')
    await fileBind.diffArrayById({
      orgId,
      oldIds: prevAttachments,
      newIds: (doc.attachments || []).map((x) => String(x)),
      entity: REF_ENTITY.COURSE_PRODUCT,
      entityId: doc._id,
      field: 'attachments'
    })
  }

  return detail(doc._id, orgId)
}

// 课程产品允许物理删除——业务上经常要清理"已下架的、不再售卖"的产品。
// 但要挡住"被订单/课包引用的产品"以免悬空：历史 Order.items[].courseProduct 与
// StudentProduct.courseProduct 都会被原样保留以便对账/家长期权记录，
// 因此这两种引用存在时一律不允许物理删除，请先处理（退费/转课/手动归档课包）后再删。
function courseProductUsageChecks(orgId, courseProductId) {
  return [
    {
      model: Order,
      filter: { org: orgId, 'items.courseProduct': courseProductId },
      label: '订单明细',
      hint: '存在已下单/已支付订单引用该产品，请先退费或调整订单后再删'
    },
    {
      model: StudentProduct,
      filter: { org: orgId, courseProduct: courseProductId },
      label: '学生课包',
      hint: '存在学生持有该产品的课包，请先退课/转课/归档后再删'
    }
  ]
}

async function remove(id, orgId) {
  const doc = await CourseProduct.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) throw ApiError.notFound('课程产品不存在')

  await removable.assertUnused(orgId, courseProductUsageChecks(orgId, id))

  await CourseProduct.deleteOne({ _id: id, org: orgId })
  return { success: true, id }
}

async function removableCheck(id, orgId) {
  const doc = await CourseProduct.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) {
    return {
      canRemove: false,
      blockers: [{ entity: 'CourseProduct', label: '课程产品', count: 0, hint: '该课程产品不存在或不属于本机构' }]
    }
  }
  return removable.check(orgId, courseProductUsageChecks(orgId, id))
}

/* ------------------------------------------------------------------
 * 跨机构同步（仅平台超管使用）
 *
 * 与 position 同步保持一致的规则：
 *  - 源内同名 product 只取第一个：skip 'duplicate-in-source'
 *  - 目标机构已存在同名：skip 'already-exists-in-target'
 *  - 源端查不到的 id：skip 'source-product-not-found'
 *
 * 与 position 不同的额外规则（因 product 引用 subjects，需要保证外键语义）：
 *  - 源端 product.subjects（含旧字段 subject）任一 id 缺失或不在目标机构
 *    → skip 'missing-subject-in-target'（避免复制半成品 product 出现悬空 id）
 *  - 不再因"源端完全没挂学科"而跳过——学科在产品上是建议性、可空字段。
 *
 * 复制字段：name / subjects / totalLessons / minutesPerLesson / price / validDays /
 *          isActive
 * 注意：教学大纲/课件是 Subject 上的事（不归 CourseProduct），跨机构同步不复制这些。
 * isActive 一律置为 true（默认在售）。
 * ------------------------------------------------------------------ */

async function listSourceOrgs({ keyword, targetOrgId }) {
  const filter = { isActive: true }
  if (targetOrgId && mongoose.isValidObjectId(targetOrgId)) {
    filter._id = { $ne: targetOrgId }
  }
  if (keyword) {
    const re = { $regex: keyword, $options: 'i' }
    filter.$or = [{ name: re }, { nameAbbreviation: re }, { unicode: re }]
  }
  const items = await Org.find(filter)
    .select('name nameAbbreviation unicode isActive')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
  return { items }
}

async function listByOrg(orgId) {
  if (!mongoose.isValidObjectId(orgId)) throw ApiError.badRequest('机构 id 不合法')
  const items = await CourseProduct.find({ org: orgId })
    .populate('subjects', 'name category')
    .sort({ createdAt: -1 })
    .lean()
  return { items }
}

async function syncProducts({ targetOrgId, sourceOrgId, productIds, operatorId }) {
  if (!targetOrgId) throw ApiError.badRequest('请先在顶部「机构切换」中选择目标机构')
  if (!sourceOrgId || !mongoose.isValidObjectId(sourceOrgId)) {
    throw ApiError.badRequest('源机构不合法')
  }
  if (!mongoose.isValidObjectId(targetOrgId)) {
    throw ApiError.badRequest('目标机构不合法')
  }
  if (String(sourceOrgId) === String(targetOrgId)) {
    throw ApiError.badRequest('源机构与目标机构不能相同')
  }
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw ApiError.badRequest('productIds 不能为空')
  }
  if (productIds.length > 200) {
    throw ApiError.badRequest('单次最多同步 200 个课程产品')
  }
  const validIds = productIds.filter((id) => mongoose.isValidObjectId(id))
  if (validIds.length !== productIds.length) {
    throw ApiError.badRequest('productIds 含非法 id')
  }

  const [source, target] = await Promise.all([
    Org.findById(sourceOrgId).select('_id').lean(),
    Org.findById(targetOrgId).select('_id').lean()
  ])
  if (!source) throw ApiError.notFound('源机构不存在')
  if (!target) throw ApiError.notFound('目标机构不存在')

  const [sourceProducts, existing] = await Promise.all([
    CourseProduct.find({ _id: { $in: validIds }, org: sourceOrgId })
      .select('name subject subjects totalLessons minutesPerLesson originalPrice discountPrice promotionPrice promotionActive validDays isActive')
      .lean(),
    CourseProduct.find({ org: targetOrgId }).select('name').lean()
  ])

  // 收集源端 product 引用的所有 subject id（兼容旧字段名 `subject` 单值）
  const allSubjectIds = new Set()
  for (const p of sourceProducts) {
    const arr = Array.isArray(p.subjects) ? p.subjects : (p.subject ? [p.subject] : [])
    for (const id of arr) {
      if (mongoose.isValidObjectId(id)) allSubjectIds.add(String(id))
    }
  }
  const subjectIds = [...allSubjectIds]
  const targetSubjectIds = new Set()
  if (subjectIds.length) {
    const ss = await Subject.find({ _id: { $in: subjectIds }, org: targetOrgId })
      .select('_id')
      .lean()
    for (const s of ss) targetSubjectIds.add(String(s._id))
  }

  const existingNames = new Set(existing.map((p) => p.name))
  const seen = new Set()
  const toCreate = []
  const skipped = []

  for (const p of sourceProducts) {
    if (seen.has(p.name)) {
      skipped.push({ sourceId: String(p._id), name: p.name, reason: 'duplicate-in-source' })
      continue
    }
    seen.add(p.name)
    if (existingNames.has(p.name)) {
      skipped.push({ sourceId: String(p._id), name: p.name, reason: 'already-exists-in-target' })
      continue
    }
    // 解析源端 subjects（兼容旧字段）
    const srcSubjects = Array.isArray(p.subjects) ? p.subjects : (p.subject ? [p.subject] : [])
    // 任一 subject id 在目标机构缺失 → 跳过（避免悬空引用）
    const missing = srcSubjects.find((id) => !mongoose.isValidObjectId(id) || !targetSubjectIds.has(String(id)))
    if (missing) {
      skipped.push({ sourceId: String(p._id), name: p.name, reason: 'missing-subject-in-target' })
      continue
    }
    toCreate.push({
      org: targetOrgId,
      subjects: srcSubjects,
      name: p.name,
      totalLessons: Number(p.totalLessons) || 1,
      minutesPerLesson: Number(p.minutesPerLesson) || 90,
      originalPrice: Number(p.originalPrice) || 0,
      discountPrice: Number(p.discountPrice) || 0,
      promotionPrice: Number(p.promotionPrice) || 0,
      promotionActive: !!p.promotionActive,
      validDays: Number(p.validDays) || 1,
      isActive: true
    })
  }

  // 源端查不到的 id
  const foundIds = new Set(sourceProducts.map((p) => String(p._id)))
  for (const id of validIds) {
    if (!foundIds.has(String(id))) {
      skipped.push({ sourceId: String(id), name: null, reason: 'source-product-not-found' })
    }
  }

  let created = []
  if (toCreate.length) {
    const docs = await CourseProduct.insertMany(toCreate, { ordered: false })
    created = docs.map((d) => d.toObject())
  }

  // eslint-disable-next-line no-console
  console.log(
    `[courseProduct.sync] operator=${operatorId} target=${targetOrgId} source=${sourceOrgId} created=${created.length} skipped=${skipped.length}`
  )

  return {
    created,
    skipped,
    createdCount: created.length,
    skippedCount: skipped.length
  }
}

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  removableCheck,
  listSourceOrgs,
  listByOrg,
  syncProducts
}
