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
 *   - visualType 收敛为 'video'（宠物本体只用视频；imageFile/svgContent 保留仅兜底渲染）
 *   - rollSpecies 全池加权随机（不再按 tier 分池）
 *
 * 字段：
 *   - key / name / visualType / videoFile (+ imageFile/svgContent 兜底)
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

    // 视觉类型（重构后宠物本体固定 'video'；enum 仍保留三值以便兜底渲染）
    visualType: { type: String, enum: PET_VISUAL_TYPES, required: true, default: 'video' },

    // image 时存 File ref
    imageFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // svg 时存内联字符串
    svgContent: { type: String, default: null, maxlength: 50000 },

    // 2026-07-12: video 时存 File ref（mp4/webm 等，列表/详情预览）
    videoFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

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

module.exports = model('PetSpecies', PetSpeciesSchema)