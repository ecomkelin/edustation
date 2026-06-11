'use strict'

const mongoose = require('mongoose')
const Subject = require('@models/Subject.model')
const Category = require('@models/Category.model')
const Org = require('@models/Org.model')
const CourseProduct = require('@models/CourseProduct.model')
const CourseInstance = require('@models/CourseInstance.model')
const ApiError = require('@utils/ApiError')

/**
 * 清理 items 中的脏 category 字段（旧版 seed 把非 ObjectId 字符串写进了 category，
 * populate 失败走 fallback 时这些字段会保留原样；这里只对「字符串且非合法 ObjectId」
 * 的情况清成 null，对 populate 成功后的对象/null 不动）。
 */
function sanitizeCategories(items) {
  for (const s of items) {
    if (typeof s.category === 'string' && !mongoose.isValidObjectId(s.category)) {
      s.category = null
    }
  }
  return items
}

async function list({ orgId, keyword }) {
  const filter = { org: orgId }
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  try {
    return await Subject.find(filter)
      .populate('category', 'name code level')
      .sort({ createdAt: -1 })
      .lean()
  } catch (e) {
    // 防御：旧版 seed 曾把非 ObjectId 字符串写入 category，导致 populate 在查询
    // Category._id 时抛 CastError（参数类型错误: _id）。降级为不 populate 的列表，
    // 前端 row.category=null 会显示「未分类」。请跑 migrate-subject-category.js 永久修复。
    if (!e || e.name !== 'CastError') throw e
    // eslint-disable-next-line no-console
    console.warn(`[subject.list] populate failed (path=${e.path}), falling back: ${e.message}`)
    const items = await Subject.find(filter).sort({ createdAt: -1 }).lean()
    return sanitizeCategories(items)
  }
}

async function detail(id, orgId) {
  const s = await Subject.findOne({ _id: id, org: orgId }).populate('category', 'name code level').lean()
  if (!s) throw ApiError.notFound('学科不存在')
  return s
}

async function assertSubjectCategory(categoryId) {
  if (!categoryId) return
  const c = await Category.findById(categoryId).select('model').lean()
  if (!c) throw ApiError.badRequest('类别不存在')
  if (c.model !== 'Subject') throw ApiError.badRequest('该类别不属于学科')
}

async function create({ orgId, ...payload }) {
  await assertSubjectCategory(payload.category)
  const doc = await Subject.create({ ...payload, org: orgId })
  return doc.toObject({ depopulate: false })
}

async function update(id, orgId, payload) {
  if (Object.prototype.hasOwnProperty.call(payload, 'category')) {
    await assertSubjectCategory(payload.category)
  }
  const doc = await Subject.findOneAndUpdate(
    { _id: id, org: orgId },
    payload,
    { new: true, runValidators: true }
  )
    .populate('category', 'name code level')
    .lean()
  if (!doc) throw ApiError.notFound('学科不存在')
  return doc
}

/**
 * 物理删除学科。
 * 入口超管+密码(路由层);业务上要求「无任何 CourseProduct / CourseInstance 引用」。
 * 学科是「建议性」字段(courseProduct.subjects 是数组可空),但 CourseInstance.subject
 * 是「单一主学科」,改/删都会让历史报表对不齐 —— 强校验。
 */
async function remove({ id, orgId }) {
  const doc = await Subject.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('学科不存在')

  // 引用检查:CourseProduct.subjects 是数组,用 $in
  const [cpCount, ciCount] = await Promise.all([
    CourseProduct.countDocuments({ org: orgId, subjects: id }),
    CourseInstance.countDocuments({ org: orgId, subject: id, deletedAt: null })
  ])
  if (cpCount > 0) {
    throw ApiError.unprocessable(
      `该学科被 ${cpCount} 个课程产品引用,请先调整产品(移除该学科)后再删`
    )
  }
  if (ciCount > 0) {
    throw ApiError.unprocessable(
      `该学科被 ${ciCount} 个开班作为主学科,无法删除(请改主学科)`
    )
  }

  await doc.deleteOne()
  return { success: true }
}

/* ------------------------------------------------------------------
 * 跨机构同步（仅平台超管使用）
 * 复制 shape 来自 position.service.syncPositions：同名校重、同名已存在跳过。
 * 复制字段：name / category / objectives / description / posterUrl / videoUrl。
 * category 引用的是平台级 Category 字典，可跨机构共享 —— 复制时直接带过 ObjectId。
 * ------------------------------------------------------------------ */

/**
 * 列出可作为「同步源」的其他机构。排除当前目标机构（targetOrgId）。
 */
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

/**
 * 列出指定机构下的全部学科，供平台超管在跨机构同步时预览。
 */
async function listByOrg(orgId) {
  if (!mongoose.isValidObjectId(orgId)) throw ApiError.badRequest('机构 id 不合法')
  try {
    const items = await Subject.find({ org: orgId })
      .populate('category', 'name code level')
      .sort({ createdAt: -1 })
      .lean()
    return { items }
  } catch (e) {
    // 防御：旧版 seed 曾把非 ObjectId 字符串写入 category，导致 populate 在查询
    // Category._id 时抛 CastError。降级为不 populate 的列表，前端 row.category=null
    // 会显示「未分类」。请跑 migrate-subject-category.js 永久修复。
    if (!e || e.name !== 'CastError') throw e
    // eslint-disable-next-line no-console
    console.warn(`[subject.listByOrg] populate failed (path=${e.path}), falling back: ${e.message}`)
    const items = await Subject.find({ org: orgId })
      .sort({ createdAt: -1 })
      .lean()
    return { items: sanitizeCategories(items) }
  }
}

/**
 * 从 sourceOrgId 复制所选学科到 targetOrgId。
 * 规则与 position 同步一致：
 *  - 源内同名只取第一个：skip 'duplicate-in-source'
 *  - 目标机构已存在同名：skip 'already-exists-in-target'（不覆盖）
 *  - 源端查不到的 id：skip 'source-subject-not-found'
 *  - 源端 category 引用了已被删除 / 改 model 的 Category：copy 时 category 置 null
 *    （仅记录，不阻断同步；前端可后续在「学科编辑」里重新选）
 */
async function syncSubjects({ targetOrgId, sourceOrgId, subjectIds, operatorId }) {
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
  if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
    throw ApiError.badRequest('subjectIds 不能为空')
  }
  if (subjectIds.length > 200) {
    throw ApiError.badRequest('单次最多同步 200 个学科')
  }
  const validIds = subjectIds.filter((id) => mongoose.isValidObjectId(id))
  if (validIds.length !== subjectIds.length) {
    throw ApiError.badRequest('subjectIds 含非法 id')
  }

  const [source, target] = await Promise.all([
    Org.findById(sourceOrgId).select('_id').lean(),
    Org.findById(targetOrgId).select('_id').lean()
  ])
  if (!source) throw ApiError.notFound('源机构不存在')
  if (!target) throw ApiError.notFound('目标机构不存在')

  const [sourceSubjects, existing] = await Promise.all([
    Subject.find({ _id: { $in: validIds }, org: sourceOrgId })
      .select('name category objectives description posterUrl videoUrl')
      .lean(),
    Subject.find({ org: targetOrgId }).select('name category').lean()
  ])

  // 仅在复制时校验 category：仅当 category 指向 platform-level Subject Category 时才保留
  const categoryIds = [
    ...new Set(
      sourceSubjects
        .map((s) => s.category)
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => String(id))
    )
  ]
  const validCategoryIds = new Set()
  if (categoryIds.length) {
    const cats = await Category.find({ _id: { $in: categoryIds } })
      .select('_id model')
      .lean()
    for (const c of cats) {
      if (c.model === 'Subject') validCategoryIds.add(String(c._id))
    }
  }

  const existingNames = new Set(existing.map((s) => s.name))
  const seen = new Set()
  const toCreate = []
  const skipped = []

  for (const s of sourceSubjects) {
    if (seen.has(s.name)) {
      skipped.push({ sourceId: String(s._id), name: s.name, reason: 'duplicate-in-source' })
      continue
    }
    seen.add(s.name)
    if (existingNames.has(s.name)) {
      skipped.push({ sourceId: String(s._id), name: s.name, reason: 'already-exists-in-target' })
      continue
    }
    const category =
      s.category && validCategoryIds.has(String(s.category)) ? s.category : null
    toCreate.push({
      org: targetOrgId,
      name: s.name,
      category,
      objectives: Array.isArray(s.objectives) ? s.objectives : [],
      description: s.description || '',
      posterUrl: s.posterUrl || undefined,
      videoUrl: s.videoUrl || undefined
    })
  }

  // 源端查不到的 id
  const foundIds = new Set(sourceSubjects.map((s) => String(s._id)))
  for (const id of validIds) {
    if (!foundIds.has(String(id))) {
      skipped.push({ sourceId: String(id), name: null, reason: 'source-subject-not-found' })
    }
  }

  let created = []
  if (toCreate.length) {
    const docs = await Subject.insertMany(toCreate, { ordered: false })
    created = docs.map((d) => d.toObject({ depopulate: false }))
  }

  // eslint-disable-next-line no-console
  console.log(
    `[subject.sync] operator=${operatorId} target=${targetOrgId} source=${sourceOrgId} created=${created.length} skipped=${skipped.length}`
  )

  return {
    created,
    skipped,
    createdCount: created.length,
    skippedCount: skipped.length
  }
}

module.exports = { list, detail, create, update, remove, listSourceOrgs, listByOrg, syncSubjects }
