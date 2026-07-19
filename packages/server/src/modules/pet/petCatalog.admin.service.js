'use strict'

/**
 * Pet Catalog Admin Service（2026-06-21 pet-system-v2-ext；2026-07-15 重构）
 *
 * catalog（species / consumables）+ 等级配置（PetLevelConfig）的 admin 接口。
 *
 * 2026-07-15 重构：
 *   - 删装饰（PetItem）全部 CRUD
 *   - species 去 tier；visualType 固定 video（宠物本体）
 *   - consumables 去 applicableTier/perTier，改扁平 pointCost/hungerRestore/expGain；支持 video 图标
 *   - 新增 PetLevelConfig get/update（per-org 等级曲线）
 *
 * 权限：
 *   - list/get → pet.read；create/update → pet.write（+ 平台超管兜底 species/consumable）
 *   - remove → pet.write + 平台超管 + password（双因子）
 *   - level config get/update → pet.read / pet.write（per-org，机构管理员即可改本机构）
 */

const PetSpecies = require('@models/PetSpecies.model')
const PetConsumable = require('@models/PetConsumable.model')
const PetAccount = require('@models/PetAccount.model')
const PetLevelConfig = require('@models/PetLevelConfig.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const fileBind = require('@modules/storage/fileBind')
const { withCache, invalidate: invalidateCache } = require('@modules/report/reportCache')
const { REF_ENTITY } = require('@models/File.model')
const { normalizeLevelConfig, normalizeLevelOverrides, rowsToLevelOverrides, LOCKED_EXP_INCREMENT } = require('@shared/petConfig')

/* ─── SVG XSS sanitize ─────────────────────────────────── */
function sanitizeSvg(input) {
  if (typeof input !== 'string') return null
  let s = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
  return s.trim() || null
}

/* ─── PetSpecies.levelVisuals normalize (2026-07-16) ──────────── */
// PetSpecies.levelVisuals[].videoFile 引用 File 时使用的 field 命名空间前缀。
// 每级一个独立 field: `levelVisual.<level>` —— 删 Lv.X 不触发其他 Lv 视频的 unbind/rebind churn。
const LEVEL_VISUAL_FIELD_PREFIX = 'levelVisual.'

/**
 * 校验 + 归一化 PetSpecies.levelVisuals[]：
 *   - 必须是数组
 *   - 每条 level 唯一（schema partial unique 索引兜底）
 *   - level 必须在 [1, 100] 之间（2026-07-18: 删 maxLevel 后，cap 直接写死 100；
 *     物种最高等级由数组 max 派生，理论无上限但 schema 防呆限 100）
 *   - visualType=svg 必须填 svgContent（XSS sanitize）；visualType=video 必须填 videoFile
 *   - 2026-07-18 第四期: 每条可嵌可选 levelUpEffect（升级瞬时特效），visualType+内容规则同 visual
 *     （未传/visualType=null = 无特效；visualType 必填时必须配齐内容）
 *   - 按 level 升序返回
 *
 * 找不到任何 visual 是允许的（= 全部等级走 species 视觉字段；fallback 兜底）。
 */
function normalizeLevelVisuals(input) {
  if (input === undefined || input === null) return undefined // 表示未传字段，调用方跳过
  if (!Array.isArray(input)) throw ApiError.badRequest('levelVisuals 必须是数组')
  const seenLevels = new Set()
  const out = []
  for (const v of input) {
    if (!v) continue
    const lvl = Number(v.level)
    if (!Number.isFinite(lvl) || lvl < 1 || lvl > 100) {
      throw ApiError.badRequest(`levelVisuals[].level=${v.level} 必须在 1-100 之间`)
    }
    if (seenLevels.has(String(lvl))) {
      throw ApiError.badRequest(`levelVisuals[].level=${lvl} 重复（每条 level 必须唯一）`)
    }
    seenLevels.add(String(lvl))
    if (!['svg', 'video'].includes(v.visualType)) {
      throw ApiError.badRequest(`levelVisuals[level=${lvl}] visualType 必须是 svg 或 video`)
    }
    // 2026-07-18 第四期: 升级特效 (levelUpEffect) — 嵌套归一化
    const normalizedEffect = normalizeLevelUpEffect(v.levelUpEffect, lvl)

    if (v.visualType === 'svg') {
      if (!v.svgContent) {
        throw ApiError.badRequest(`levelVisuals[level=${lvl}] visualType=svg 时必须填 svgContent`)
      }
      const cleanSvg = sanitizeSvg(v.svgContent)
      if (!cleanSvg) {
        throw ApiError.badRequest(`levelVisuals[level=${lvl}] svgContent 被清理后为空`)
      }
      out.push({
        level: lvl,
        visualType: 'svg',
        svgContent: cleanSvg,
        videoFile: null,
        levelUpEffect: normalizedEffect
      })
    } else {
      // video
      if (!v.videoFile) {
        throw ApiError.badRequest(`levelVisuals[level=${lvl}] visualType=video 时必须填 videoFile`)
      }
      const vid = typeof v.videoFile === 'string'
        ? v.videoFile
        : (v.videoFile._id || v.videoFile.id || null)
      if (!vid) {
        throw ApiError.badRequest(`levelVisuals[level=${lvl}] videoFile 缺少 id`)
      }
      out.push({
        level: lvl,
        visualType: 'video',
        svgContent: null,
        videoFile: vid,
        levelUpEffect: normalizedEffect
      })
    }
  }
  out.sort((a, b) => a.level - b.level)
  return out
}

/**
 * 归一化单条 levelUpEffect 子字段 (2026-07-18 第四期)。
 * 接受：undefined / null / {visualType:null,...} / 完整 {visualType, svgContent|videoFile}
 * 返回：
 *   - undefined → 未传 = "保持原样"（由调用方区分；这里只代表"未变化"，写库时不再写入）
 *   - null → 显式清除（写库时写入 null）
 *   - 完整对象 → {visualType, svgContent, videoFile} 校验后归一
 */
function normalizeLevelUpEffect(input, parentLevel) {
  // 区分 "字段缺省 (undefined)" vs "显式 null (清除)" vs "完整对象"
  if (input === undefined) return undefined  // 调用方用 undefined 区分"未传，不动"
  if (input === null) return null            // 显式清除
  if (typeof input !== 'object') {
    throw ApiError.badRequest(`levelVisuals[level=${parentLevel}].levelUpEffect 必须是对象或 null`)
  }
  const vt = input.visualType
  if (vt === null || vt === undefined || vt === '') return null  // 空 visualType 也视为清除
  if (!['svg', 'video'].includes(vt)) {
    throw ApiError.badRequest(`levelVisuals[level=${parentLevel}].levelUpEffect.visualType 必须是 svg 或 video`)
  }
  if (vt === 'svg') {
    if (!input.svgContent) {
      throw ApiError.badRequest(`levelVisuals[level=${parentLevel}].levelUpEffect visualType=svg 时必须填 svgContent`)
    }
    const clean = sanitizeSvg(input.svgContent)
    if (!clean) {
      throw ApiError.badRequest(`levelVisuals[level=${parentLevel}].levelUpEffect svgContent 被清理后为空`)
    }
    return { visualType: 'svg', svgContent: clean, videoFile: null }
  }
  // video
  if (!input.videoFile) {
    throw ApiError.badRequest(`levelVisuals[level=${parentLevel}].levelUpEffect visualType=video 时必须填 videoFile`)
  }
  const vid = typeof input.videoFile === 'string'
    ? input.videoFile
    : (input.videoFile._id || input.videoFile.id || null)
  if (!vid) {
    throw ApiError.badRequest(`levelVisuals[level=${parentLevel}].levelUpEffect videoFile 缺少 id`)
  }
  return { visualType: 'video', svgContent: null, videoFile: vid }
}

/**
 * admin 更新 species.levelVisuals 时, per-level 粒度维护 File.refs。
 * 不用 diffArrayById 整体 diff（会触发未变更等级的 unbind/rebind churn）。
 *
 * 2026-07-18 第四期: 每条 levelVisual 多了可选 levelUpEffect.videoFile，filed 命名空间:
 *   - `levelVisual.<L>`         — 形象本身的 videoFile
 *   - `levelVisual.<L>.levelUpEffect` — 升级特效的 videoFile
 * 两套字段分开维护，避免一处变更影响另一处。
 */
async function maintainLevelVisualsFileRefs({ speciesId, oldLevelVisuals, newLevelVisuals }) {
  const oldMap = new Map()
  for (const v of (oldLevelVisuals || [])) {
    if (v && Number.isFinite(Number(v.level))) oldMap.set(String(v.level), v)
  }
  const newMap = new Map()
  for (const v of (newLevelVisuals || [])) {
    if (v && Number.isFinite(Number(v.level))) newMap.set(String(v.level), v)
  }
  const allLevels = new Set([...oldMap.keys(), ...newMap.keys()])

  for (const lv of allLevels) {
    const oldV = oldMap.get(lv) || null
    const newV = newMap.get(lv) || null
    // 1) 形象本身的 videoFile
    const oldVideoId = oldV && oldV.videoFile ? String(oldV.videoFile) : null
    const newVideoId = newV && newV.videoFile ? String(newV.videoFile) : null
    if (oldVideoId !== newVideoId) {
      await fileBind.diffSingleById({
        orgId: null,
        oldId: oldVideoId,
        newId: newVideoId,
        entity: REF_ENTITY.PET_SPECIES,
        entityId: speciesId,
        field: `${LEVEL_VISUAL_FIELD_PREFIX}${lv}`
      })
    }
    // 2) 升级特效的 videoFile (2026-07-18 第四期)
    const oldEffectId = oldV && oldV.levelUpEffect && oldV.levelUpEffect.videoFile
      ? String(oldV.levelUpEffect.videoFile) : null
    const newEffectId = newV && newV.levelUpEffect && newV.levelUpEffect.videoFile
      ? String(newV.levelUpEffect.videoFile) : null
    if (oldEffectId !== newEffectId) {
      await fileBind.diffSingleById({
        orgId: null,
        oldId: oldEffectId,
        newId: newEffectId,
        entity: REF_ENTITY.PET_SPECIES,
        entityId: speciesId,
        field: `${LEVEL_VISUAL_FIELD_PREFIX}${lv}.levelUpEffect`
      })
    }
  }
}

/* ─── 通用 list（平台级，无 org 维度） ─── */
async function listMerged({ Model, type, baseFilter = {}, keyword, populateFields = ['videoFile'] }) {
  const filterKey = JSON.stringify({ baseFilter, keyword })
  return withCache(`${type}:global:${filterKey}`, async () => {
    const filter = { ...baseFilter }
    if (keyword && String(keyword).trim()) {
      filter.name = { $regex: String(keyword).trim(), $options: 'i' }
    }
    let q = Model.find(filter)
    for (const f of populateFields) {
      q = q.populate(f, 'url mime originalName')
    }
    return q.sort({ kind: 1, key: 1 }).lean()
  }, 300_000)
}

/* ─── Species CRUD（去 tier，video-only） ─────────────────────────────────── */

async function listSpecies({ isActive, keyword }) {
  const baseFilter = {}
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({
    Model: PetSpecies, type: 'species', baseFilter, keyword,
    // 2026-07-16: 加 populate levelVisuals.videoFile，让列表 / 详情都能展示已上传的视频
    // 2026-07-18 第四期: 加 populate levelVisuals.levelUpEffect.videoFile (升级特效 video)
    populateFields: ['videoFile', 'levelVisuals.videoFile', 'levelVisuals.levelUpEffect.videoFile']
  })
}

async function getSpecies({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id })
    .populate('videoFile', 'url mime originalName')
    .populate('levelVisuals.videoFile', 'url mime originalName')
    // 2026-07-18 第四期: 升级特效 videoFile
    .populate('levelVisuals.levelUpEffect.videoFile', 'url mime originalName')
    .lean()
  if (!doc) throw ApiError.notFound('物种不存在')
  return doc
}

async function createSpecies({ payload, operatorId }) {
  if (!payload.key || !payload.name) {
    throw ApiError.badRequest('key/name 必填')
  }
  const visualType = payload.visualType || 'video'
  const exists = await PetSpecies.findOne({ key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`物种 key=${payload.key} 已存在`)

  // 2026-07-16: 接收 levelVisuals 数组（per-species 逐级形象覆盖）
  // 2026-07-18: 最高等级由数组 max 派生，无 maxLevel 上限约束
  const levelVisuals = normalizeLevelVisuals(payload.levelVisuals) || []

  const doc = {
    key: payload.key.trim(),
    name: payload.name.trim(),
    visualType,
    svgContent: visualType === 'svg' ? sanitizeSvg(payload.svgContent) : null,
    videoFile: visualType === 'video' ? (payload.videoFile || null) : null,
    levelVisuals,
    weight: Number(payload.weight) || 100,
    hungerDecayMinutes: Number(payload.hungerDecayMinutes) || 60,
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetSpecies.create(doc)
  invalidateCache('species')
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: null, newId: doc.videoFile,
      entity: REF_ENTITY.PET_SPECIES, entityId: created._id, field: 'videoFile'
    })
  }
  // levelVisuals 每级一个 file ref (2026-07-18 第四期: 内部已含 levelUpEffect 的 videoFile 维护)
  if (levelVisuals.length > 0) {
    await maintainLevelVisualsFileRefs({
      speciesId: created._id,
      oldLevelVisuals: [],
      newLevelVisuals: levelVisuals
    })
  }
  // 2026-07-16: populate levelVisuals.videoFile 让 admin UI 拿到完整 url/mime
  // 2026-07-18 第四期: 加 levelVisuals.levelUpEffect.videoFile
  await created.populate('levelVisuals.videoFile', 'url mime originalName')
  await created.populate('levelVisuals.levelUpEffect.videoFile', 'url mime originalName')
  return created.toObject()
}

async function updateSpecies({ id, payload, operatorId }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('物种不存在')

  const updates = {}
  if (payload.name !== undefined) updates.name = String(payload.name).trim()
  if (payload.visualType !== undefined) updates.visualType = payload.visualType
  // 2026-07-18: 删 maxLevel 入参分支 — 最高等级完全由 doc.levelVisuals[].max 派生
  if (payload.weight !== undefined) updates.weight = Number(payload.weight) || 0
  if (payload.hungerDecayMinutes !== undefined) updates.hungerDecayMinutes = Number(payload.hungerDecayMinutes) || 60
  if (payload.isActive !== undefined) updates.isActive = !!payload.isActive
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.svgContent !== undefined && doc.visualType === 'svg') {
    updates.svgContent = sanitizeSvg(payload.svgContent)
  }
  if (payload.videoFile !== undefined && doc.visualType === 'video') {
    updates.videoFile = payload.videoFile || null
  }

  // 2026-07-16: levelVisuals（传 undefined = 不改；传 [] = 清空；传数组 = 覆盖）
  // 2026-07-18: 删 maxLevel cap（删字段后无上限约束）— normalizeLevelVisuals 自己保证 1-100
  let normalizedLevelVisuals = null
  let oldLevelVisuals = []
  if (payload.levelVisuals !== undefined) {
    normalizedLevelVisuals = normalizeLevelVisuals(payload.levelVisuals) || []
    updates.levelVisuals = normalizedLevelVisuals
    oldLevelVisuals = (doc.levelVisuals || []).map(v => ({
      level: Number(v.level),
      visualType: v.visualType,
      videoFile: v.videoFile ? String(v.videoFile) : null
    }))
  }

  updates.updatedBy = operatorId

  const oldVideoFile = doc.videoFile ? doc.videoFile.toString() : null
  const updated = await PetSpecies.findByIdAndUpdate(doc._id, { $set: updates }, { new: true })
  invalidateCache('species')

  if (doc.visualType === 'video' && payload.videoFile !== undefined) {
    await fileBind.diffSingleById({
      orgId: null, oldId: oldVideoFile, newId: updated.videoFile ? updated.videoFile.toString() : null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'videoFile'
    })
  }
  // levelVisuals 维护 (2026-07-18 第四期: 内部已含 levelUpEffect 的 videoFile 维护)
  if (normalizedLevelVisuals !== null) {
    await maintainLevelVisualsFileRefs({
      speciesId: doc._id,
      oldLevelVisuals,
      newLevelVisuals: normalizedLevelVisuals
    })
  }
  // 2026-07-16: populate levelVisuals.videoFile 让 admin UI 拿到完整 url/mime
  // 2026-07-18 第四期: 加 levelVisuals.levelUpEffect.videoFile
  await updated.populate('levelVisuals.videoFile', 'url mime originalName')
  await updated.populate('levelVisuals.levelUpEffect.videoFile', 'url mime originalName')
  return updated.toObject()
}

function speciesUsageChecks(key) {
  return [
    {
      model: PetAccount,
      filter: { species: key },
      label: '宠物实例引用',
      hint: '请先将引用此物种的宠物迁移/置换后再删'
    }
  ]
}

async function removableCheckSpecies({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id }).lean()
  if (!doc) {
    return { canRemove: false, blockers: [{ entity: 'PetSpecies', label: '物种', count: 0, hint: '物种不存在' }] }
  }
  return removable.checkGlobal(speciesUsageChecks(doc.key))
}

async function removeSpecies({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('物种不存在')
  await removable.assertUnusedGlobal(speciesUsageChecks(doc.key))
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: doc.videoFile.toString(), newId: null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'videoFile'
    })
  }
  // 2026-07-16: 解绑所有 levelVisuals[].videoFile（per-level 粒度 field=`levelVisual.<L>`）
  if (doc.levelVisuals && doc.levelVisuals.length > 0) {
    await maintainLevelVisualsFileRefs({
      speciesId: doc._id,
      oldLevelVisuals: doc.levelVisuals,
      newLevelVisuals: []
    })
  }
  await doc.deleteOne()
  invalidateCache('species')
  return { deleted: true }
}

/* ─── Consumable CRUD（扁平数值，去 tier） ─────────────────────────────────── */

async function listConsumables({ kind, isActive, keyword }) {
  const baseFilter = {}
  if (kind) baseFilter.kind = kind
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ Model: PetConsumable, type: 'consumables', baseFilter, keyword, populateFields: ['videoFile'] })
}

async function getConsumable({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id })
    .populate('videoFile', 'url mime originalName')
    .lean()
  if (!doc) throw ApiError.notFound('消耗品不存在')
  return doc
}

async function createConsumable({ payload, operatorId }) {
  if (!payload.key || !payload.name || !payload.kind) {
    throw ApiError.badRequest('key/name/kind 必填')
  }
  if (!Number.isFinite(Number(payload.pointCost))) {
    throw ApiError.badRequest('pointCost 必填')
  }
  const exists = await PetConsumable.findOne({ key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`消耗品 key=${payload.key} 已存在`)

  const visualType = payload.visualType || 'svg'
  const doc = {
    key: payload.key.trim(),
    name: payload.name.trim(),
    kind: payload.kind,
    pointCost: Number(payload.pointCost),
    hungerRestore: Number(payload.hungerRestore) || 0,
    expGain: Number(payload.expGain) || 0,
    visualType,
    svgContent: visualType === 'svg' ? sanitizeSvg(payload.svgContent) : null,
    videoFile: visualType === 'video' ? (payload.videoFile || null) : null,
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetConsumable.create(doc)
  invalidateCache('consumables')
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: null, newId: doc.videoFile,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: created._id, field: 'videoFile'
    })
  }
  return created.toObject()
}

async function updateConsumable({ id, payload, operatorId }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('消耗品不存在')

  const updates = {}
  if (payload.name !== undefined) updates.name = String(payload.name).trim()
  if (payload.kind !== undefined) updates.kind = payload.kind
  if (payload.pointCost !== undefined) updates.pointCost = Number(payload.pointCost) || 0
  if (payload.hungerRestore !== undefined) updates.hungerRestore = Number(payload.hungerRestore) || 0
  if (payload.expGain !== undefined) updates.expGain = Number(payload.expGain) || 0
  if (payload.isActive !== undefined) updates.isActive = !!payload.isActive
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.visualType !== undefined) updates.visualType = payload.visualType
  if (payload.svgContent !== undefined && doc.visualType === 'svg') {
    updates.svgContent = sanitizeSvg(payload.svgContent)
  }
  if (payload.videoFile !== undefined && doc.visualType === 'video') {
    updates.videoFile = payload.videoFile || null
  }
  updates.updatedBy = operatorId

  const oldVideoFile = doc.videoFile ? doc.videoFile.toString() : null
  const updated = await PetConsumable.findByIdAndUpdate(doc._id, { $set: updates }, { new: true })
  invalidateCache('consumables')

  if (doc.visualType === 'video' && payload.videoFile !== undefined) {
    await fileBind.diffSingleById({
      orgId: null, oldId: oldVideoFile, newId: updated.videoFile ? updated.videoFile.toString() : null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'videoFile'
    })
  }
  return updated.toObject()
}

function consumableUsageChecks() {
  return []
}

async function removableCheckConsumable({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id }).lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'PetConsumable', label: '消耗品', count: 0, hint: '消耗品不存在' }] }
  return removable.checkGlobal(consumableUsageChecks())
}

async function removeConsumable({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('消耗品不存在')
  await removable.assertUnusedGlobal(consumableUsageChecks())
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: doc.videoFile.toString(), newId: null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'videoFile'
    })
  }
  await doc.deleteOne()
  invalidateCache('consumables')
  return { deleted: true }
}

/* ─── Level Config（per-org 等级配置） ─────────────────────────────────── */

async function getLevelConfig({ orgId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const doc = await PetLevelConfig.findOne({ org: orgId }).lean()
  const cfg = normalizeLevelConfig(doc)
  return { ...cfg, exists: !!doc }
}

async function updateLevelConfig({ orgId, payload, operatorId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const updates = {}
  if (payload.expBase !== undefined) updates.expBase = Math.max(1, Number(payload.expBase) || 1)
  // expIncrement 已锁定（LOCKED_EXP_INCREMENT=300，2026-07-16 产品决策）：
  // 忽略入参里的任何值；即使 DB 里有旧值也会被 $set 强制覆盖成常量。
  if (payload.levelExpOverrides !== undefined) {
    // 接受前端 rows 数组 [{level, exp}] 或后端 dict；归一化为 [{level, exp}]
    updates.levelExpOverrides = rowArrToOverrides(payload.levelExpOverrides)
  }
  // 强制写入常量（抹掉 DB 里可能存的旧 expIncrement）
  updates.expIncrement = LOCKED_EXP_INCREMENT
  updates.updatedBy = operatorId
  const doc = await PetLevelConfig.findOneAndUpdate(
    { org: orgId },
    { $set: updates, $setOnInsert: { org: orgId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean()
  const cfg = normalizeLevelConfig(doc)
  return { ...cfg, exists: !!doc }
}

// 接受数组 (rows) 或 dict (keyed by level)；归一化为按 level 升序的数组
function rowArrToOverrides(input) {
  if (!input) return []
  let dict
  if (Array.isArray(input)) {
    dict = rowsToLevelOverrides(input)
  } else if (typeof input === 'object') {
    dict = normalizeLevelOverrides(input)
  } else {
    return []
  }
  return Object.keys(dict)
    .map(k => ({ level: Number(k), exp: dict[k] }))
    .sort((a, b) => a.level - b.level)
}

module.exports = {
  // species
  listSpecies, getSpecies, createSpecies, updateSpecies, removeSpecies, removableCheckSpecies,
  // consumables
  listConsumables, getConsumable, createConsumable, updateConsumable, removeConsumable, removableCheckConsumable,
  // level config
  getLevelConfig, updateLevelConfig,
  // 内部导出（test/调试）
  sanitizeSvg, listMerged
}
