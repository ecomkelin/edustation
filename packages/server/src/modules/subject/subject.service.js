'use strict'

const mongoose = require('mongoose')
const Subject = require('@models/Subject.model')
const Category = require('@models/Category.model')
const Org = require('@models/Org.model')
const CourseProduct = require('@models/CourseProduct.model')
const CourseInstance = require('@models/CourseInstance.model')
const ApiError = require('@utils/ApiError')

/**
 * 把 lessonMaterials.items (按 lessonNo 分组的 fileId[]) 扁平化为一维 fileId 数组。
 * 与 CourseInstance.service.flattenLessonMaterials 同样语义, 复制过来避免跨模块循环依赖。
 */
function flattenLessonMaterials(items) {
  const out = []
  for (const it of items || []) {
    for (const fid of it.fileIds || []) {
      if (fid) out.push(String(fid))
    }
  }
  return out
}

/**
 * 规范化 syllabus 输入: lessons 数组里每项的 lessonNo/topic/description/objectives/durationMinutes
 * 缺失/非法时静默丢弃非法项; 数字字段强转。
 */
function normalizeSyllabusLessons(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue
    if (!Number.isInteger(l.lessonNo) || l.lessonNo < 1) continue
    out.push({
      lessonNo: l.lessonNo,
      topic: typeof l.topic === 'string' ? l.topic : '',
      description: typeof l.description === 'string' ? l.description : '',
      objectives: Array.isArray(l.objectives)
        ? l.objectives.filter((x) => typeof x === 'string')
        : [],
      durationMinutes: l.durationMinutes != null && Number.isInteger(Number(l.durationMinutes)) && Number(l.durationMinutes) >= 1
        ? Number(l.durationMinutes)
        : null
    })
  }
  // 按 lessonNo 升序
  out.sort((a, b) => a.lessonNo - b.lessonNo)
  return out
}

/**
 * 规范化 lessonMaterials.items 输入: lessonNo + fileIds 数组
 */
function normalizeLessonMaterialsItems(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue
    if (!Number.isInteger(it.lessonNo) || it.lessonNo < 1) continue
    const fileIds = Array.isArray(it.fileIds)
      ? it.fileIds.filter((x) => x != null).map((x) => String(x))
      : []
    out.push({ lessonNo: it.lessonNo, fileIds })
  }
  out.sort((a, b) => a.lessonNo - b.lessonNo)
  return out
}

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
      .populate('posterFileId', 'url originalName mime')
      .populate('videoFileId', 'url originalName mime')
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
  const s = await Subject.findOne({ _id: id, org: orgId })
    .populate('category', 'name code level')
    .populate('posterFileId', 'url originalName mime')
    .populate('videoFileId', 'url originalName mime')
    .lean()
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
  // 规范化 syllabus / lessonMaterials
  const syllabus = payload.syllabus !== undefined
    ? {
        totalLessons: Array.isArray(payload.syllabus.lessons) ? payload.syllabus.lessons.length : 0,
        lessons: normalizeSyllabusLessons(payload.syllabus.lessons)
      }
    : undefined
  const lessonMaterials = payload.lessonMaterials !== undefined
    ? { items: normalizeLessonMaterialsItems(payload.lessonMaterials.items) }
    : undefined
  // 海报 / 视频 fileId 留作 fileBind
  const posterFileId = payload.posterFileId || null
  const videoFileId = payload.videoFileId || null
  const doc = await Subject.create({
    ...payload,
    org: orgId,
    posterFileId,
    videoFileId,
    ...(syllabus !== undefined ? { syllabus } : {}),
    ...(lessonMaterials !== undefined ? { lessonMaterials } : {})
  })
  const { REF_ENTITY } = require('@models/File.model')
  const fileBind = require('@modules/storage/fileBind')
  // 海报 / 视频: 走单值 fileBind
  if (posterFileId) {
    await fileBind.bindByIds({
      orgId, ids: [posterFileId], entity: REF_ENTITY.SUBJECT, entityId: doc._id, field: 'posterFileId'
    })
  }
  if (videoFileId) {
    await fileBind.bindByIds({
      orgId, ids: [videoFileId], entity: REF_ENTITY.SUBJECT, entityId: doc._id, field: 'videoFileId'
    })
  }
  // 课件 fileBind 标记引用 (field='lessonMaterials',不区分 lessonNo)
  const ids = flattenLessonMaterials(lessonMaterials && lessonMaterials.items)
  if (ids.length) {
    await fileBind.bindByIds({
      orgId,
      ids,
      entity: REF_ENTITY.SUBJECT,
      entityId: doc._id,
      field: 'lessonMaterials'
    })
  }
  return doc.toObject({ depopulate: false })
}

async function update(id, orgId, payload) {
  if (Object.prototype.hasOwnProperty.call(payload, 'category')) {
    await assertSubjectCategory(payload.category)
  }
  // 规范化 syllabus / lessonMaterials 并准备 prev 信息(fileBind 维护引用)
  let prevLessonMaterialIds = null
  let prevPosterFileId = null
  let prevVideoFileId = null
  const updateDoc = { ...payload }
  if (Object.prototype.hasOwnProperty.call(payload, 'syllabus')) {
    const v = payload.syllabus
    if (v === null) {
      updateDoc.syllabus = { totalLessons: 0, lessons: [] }
    } else {
      const lessons = normalizeSyllabusLessons(v && v.lessons)
      updateDoc.syllabus = { totalLessons: lessons.length, lessons }
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lessonMaterials')) {
    const v = payload.lessonMaterials
    const prev = await Subject.findOne({ _id: id, org: orgId }).select('lessonMaterials posterFileId videoFileId').lean()
    prevLessonMaterialIds = flattenLessonMaterials(prev && prev.lessonMaterials && prev.lessonMaterials.items)
    if (v === null) {
      updateDoc.lessonMaterials = { items: [] }
    } else {
      const items = normalizeLessonMaterialsItems(v && v.items)
      updateDoc.lessonMaterials = { items }
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'posterFileId')) {
    const prev = prevLessonMaterialIds === null
      ? await Subject.findOne({ _id: id, org: orgId }).select('posterFileId videoFileId').lean()
      : null
    prevPosterFileId = (prev && prev.posterFileId) || null
    updateDoc.posterFileId = payload.posterFileId || null
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'videoFileId')) {
    const prev = prevLessonMaterialIds === null && prevPosterFileId === null
      ? await Subject.findOne({ _id: id, org: orgId }).select('videoFileId').lean()
      : null
    prevVideoFileId = (prev && prev.videoFileId) || null
    updateDoc.videoFileId = payload.videoFileId || null
  }
  const doc = await Subject.findOneAndUpdate(
    { _id: id, org: orgId },
    updateDoc,
    { new: true, runValidators: true }
  )
    .populate('category', 'name code level')
    .populate('posterFileId', 'url originalName mime')
    .populate('videoFileId', 'url originalName mime')
    .lean()
  if (!doc) throw ApiError.notFound('学科不存在')
  // fileBind 维护引用
  const { REF_ENTITY } = require('@models/File.model')
  const fileBind = require('@modules/storage/fileBind')
  if (prevLessonMaterialIds !== null) {
    const nextIds = flattenLessonMaterials(doc.lessonMaterials && doc.lessonMaterials.items)
    await fileBind.diffArrayById({
      orgId,
      oldIds: prevLessonMaterialIds,
      newIds: nextIds,
      entity: REF_ENTITY.SUBJECT,
      entityId: doc._id,
      field: 'lessonMaterials'
    })
  }
  if (prevPosterFileId !== null) {
    await fileBind.diffSingleById({
      orgId,
      oldId: prevPosterFileId,
      newId: doc.posterFileId ? (doc.posterFileId._id || doc.posterFileId) : null,
      entity: REF_ENTITY.SUBJECT,
      entityId: doc._id,
      field: 'posterFileId'
    })
  }
  if (prevVideoFileId !== null) {
    await fileBind.diffSingleById({
      orgId,
      oldId: prevVideoFileId,
      newId: doc.videoFileId ? (doc.videoFileId._id || doc.videoFileId) : null,
      entity: REF_ENTITY.SUBJECT,
      entityId: doc._id,
      field: 'videoFileId'
    })
  }
  return doc
}

/**
 * 物理删除学科。
 * 入口超管+密码(路由层);业务上要求「无任何 CourseProduct / CourseInstance 引用」。
 * 学科是「建议性」字段(courseProduct.subjects 是数组可空),但 CourseInstance.subject
 * 是「单一主学科」,改/删都会让历史报表对不齐 —— 强校验。
 */
function subjectUsageChecks(orgId, subjectId) {
  return [
    {
      model: CourseProduct, filter: { org: orgId, subjects: subjectId },
      label: '课程产品引用', hint: '请先调整产品(移除该学科)后再删'
    },
    {
      model: CourseInstance, filter: { org: orgId, subject: subjectId, deletedAt: null },
      label: '开班主学科', hint: '请先修改开班主学科后再删'
    }
  ]
}

async function remove({ id, orgId }) {
  const doc = await Subject.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('学科不存在')

  // 互锁:用统一工具替换内联 countDocuments
  const { assertUnused } = require('@utils/removable')
  await assertUnused(orgId, subjectUsageChecks(orgId, id))

  // 物理删除前 unbind 课件 / 海报 / 视频 file 引用, 让 file 自身可以被清理
  const lmIds = flattenLessonMaterials(doc.lessonMaterials && doc.lessonMaterials.items)
  const posterId = doc.posterFileId ? String(doc.posterFileId) : null
  const videoId = doc.videoFileId ? String(doc.videoFileId) : null
  await doc.deleteOne()
  if (lmIds.length || posterId || videoId) {
    try {
      const { REF_ENTITY } = require('@models/File.model')
      const fileBind = require('@modules/storage/fileBind')
      if (lmIds.length) {
        await fileBind.unbindByIds({
          orgId, ids: lmIds, entity: REF_ENTITY.SUBJECT, entityId: id, field: 'lessonMaterials'
        })
      }
      if (posterId) {
        await fileBind.unbindByIds({
          orgId, ids: [posterId], entity: REF_ENTITY.SUBJECT, entityId: id, field: 'posterFileId'
        })
      }
      if (videoId) {
        await fileBind.unbindByIds({
          orgId, ids: [videoId], entity: REF_ENTITY.SUBJECT, entityId: id, field: 'videoFileId'
        })
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[subject.remove] unbind file refs failed for', id, e && e.message)
    }
  }
  return { success: true }
}

async function removableCheck({ id, orgId }) {
  const doc = await Subject.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'Subject', label: '学科', count: 0, hint: '该学科不存在或不属于本机构' }] }
  const { check } = require('@utils/removable')
  return check(orgId, subjectUsageChecks(orgId, id))
}

/* ------------------------------------------------------------------
 * 跨机构同步（仅平台超管使用）
 * 复制 shape 来自 position.service.syncPositions：同名校重、同名已存在跳过。
 * 复制字段：name / category / objectives / description / 教学大纲 / 课件骨架。
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
 *  - posterFileId / videoFileId / lessonMaterials.fileIds 跨机构 fileId 失效 → 清空,
 *    教学大纲纯文本结构可以复制
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
      .select('name category objectives description syllabus lessonMaterials')
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
    // 教学大纲: 直接复制 lessons 数组(纯文本结构,跨机构无意义损失)
    const srcSyllabus = s.syllabus || { totalLessons: 0, lessons: [] }
    // 课件: 复制骨架,但 fileIds 全部清空(跨机构 fileId 失效, 让用户后续在目标机构上传)
    const srcLm = s.lessonMaterials || { items: [] }
    const lmItems = Array.isArray(srcLm.items)
      ? srcLm.items.map((it) => ({
          lessonNo: Number(it.lessonNo),
          fileIds: [] // 跨机构同步刻意清空 fileIds
        }))
      : []
    // posterFileId / videoFileId 跨机构失效 → 不复制
    toCreate.push({
      org: targetOrgId,
      name: s.name,
      category,
      objectives: Array.isArray(s.objectives) ? s.objectives : [],
      description: s.description || '',
      syllabus: {
        totalLessons: Number(srcSyllabus.totalLessons) || (Array.isArray(srcSyllabus.lessons) ? srcSyllabus.lessons.length : 0),
        lessons: Array.isArray(srcSyllabus.lessons) ? srcSyllabus.lessons.map((l) => ({
          lessonNo: Number(l.lessonNo),
          topic: l.topic || '',
          description: l.description || '',
          objectives: Array.isArray(l.objectives) ? [...l.objectives] : [],
          durationMinutes: l.durationMinutes != null ? Number(l.durationMinutes) : null
        })) : []
      },
      lessonMaterials: { items: lmItems }
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

module.exports = { list, detail, create, update, remove, removableCheck, listSourceOrgs, listByOrg, syncSubjects }
