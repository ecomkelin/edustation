'use strict'

const { Schema, model } = require('mongoose')
const { PET_VISUAL_TYPES } = require('@shared/enums')

/**
 * 宠物形象图鉴（PetSpecies，2026-06-21 pet-system-v2-ext）
 *
 * 平台级共享：全部由平台超管统一管理；所有机构共用一份图鉴。
 *
 * PetAccount.species 存 key 字符串（不存 ObjectId 引用），便于：
 *   1. 物种删除/重命名不影响已生成 PetAccount（前端 fallback emoji）
 *   2. 跨机构数据兼容（同 key 全平台语义一致）
 *
 * 2026-07-15 重构：
 *   - 删 tier 字段（无等阶）
 *   - visualType 收敛为 'video'（宠物本体只用视频；svgContent 保留仅兜底渲染）
 *   - rollSpecies 全池加权随机（不再按 tier 分池）
 *
 * 2026-07-16：
 *   - 删 image 视觉类型（enum 只剩 svg/video）+ 删 imageFile 字段
 *   - 新增 levelVisuals[]（per-species 逐级形象覆盖；未列出的等级按 fallback 链
 *     levelVisuals[level] → levelVisuals[level-1] → ... → 视觉总默认（visualType/svgContent/videoFile））。
 *     1 级兜底：fallback 链必然命中物种自身视觉（seed + 编辑校验保证 species 视觉字段非空）。
 *
 * 2026-07-18：
 *   - 删 maxLevel 字段（最高等级由 levelVisuals[] 数组本身决定：max(levelVisuals[].level)，
 *     空数组时用 DEFAULT_SPECIES_MAX_LEVEL=1 兜底，即"蛋态默认"只能保持 1 级；
 *     经验曲线仍由 per-org PetLevelConfig 统一管理）。
 *   - 删 maxLevel 后，「最高等级」这一信息完全冗余 — 每级形象列表本身已描述支持到多少级。
 *
 * 字段：
 *   - key / name / visualType / videoFile (+ svgContent 兜底)
 *   - levelVisuals[{level,visualType,svgContent,videoFile}]（逐级形象覆盖；空数组 = 全部等级用 species 默认）
 *   - weight  (破壳加权随机权重)
 *   - hungerDecayMinutes / isActive / description / meta
 *   - createdBy / updatedBy  (审计)
 */
const PetSpeciesSchema = new Schema(
  {
    // 唯一 key（全局唯一，无 org 维度）
    key: { type: String, required: true, trim: true, unique: true },

    // 中文名（玩家可见）
    name: { type: String, required: true, trim: true, maxlength: 64 },

    // 视觉类型（重构后宠物本体固定 'video'；enum 保留 svg 兜底渲染）
    visualType: { type: String, enum: PET_VISUAL_TYPES, required: true, default: 'video' },

    // svg 时存内联字符串
    svgContent: { type: String, default: null, maxlength: 50000 },

    // 2026-07-12: video 时存 File ref（mp4/webm 等，列表/详情预览）
    videoFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // 2026-07-16: per-species 逐级形象覆盖（每等级一条；空数组 → 全部等级用 species 视觉字段）
    // fallback 链：levelVisuals[level] → levelVisuals[level-1] → ... → 物种自身视觉字段
    // 2026-07-18: 最高等级由本数组派生 (max(levelVisuals[].level))，数组外不再存 maxLevel
    levelVisuals: {
      type: [
        new Schema(
          {
            _id: false,
            level:      { type: Number, required: true, min: 1, max: 100 },
            visualType: { type: String, enum: PET_VISUAL_TYPES, required: true },
            svgContent: { type: String, default: null, maxlength: 50000 },
            videoFile:  { type: Schema.Types.ObjectId, ref: 'File', default: null }
          },
          { _id: false }
        )
      ],
      default: []
    },

    // 破壳加权随机权重
    weight: { type: Number, default: 100, min: 0, max: 10000 },

    // 2026-06-23: 物种级饱腹度衰减间隔（分钟/点），破壳时继承到 PetAccount
    //   默认 60 分钟/点（用户决策）；cron 优先级: PetAccount.hungerDecayMinutes > species > 平台级 fallback
    hungerDecayMinutes: { type: Number, default: 60, min: 1, max: 10080 },

    // 软启用
    isActive: { type: Boolean, default: true, index: true },

    // 描述
    description: { type: String, default: null, maxlength: 500 },

    // 扩展位
    meta: { type: Schema.Types.Mixed, default: {} },

    // 审计
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    collection: 'pet_species'
  }
)

// isActive 已在字段上 index: true；无需额外复合索引（去 tier 后列表仅按 isActive/keyword）

// 2026-07-16: per-species levelVisuals 同 level 必须唯一
// partialFilterExpression 让 levelVisuals=[] 的文档不参与索引，省空间
PetSpeciesSchema.index(
  { 'levelVisuals.level': 1 },
  { unique: true, partialFilterExpression: { 'levelVisuals.0': { $exists: true } } }
)

module.exports = model('PetSpecies', PetSpeciesSchema)