'use strict'

const { Schema, model } = require('mongoose')
const { PET_TIERS, PET_VISUAL_TYPES } = require('@shared/enums')

/**
 * 宠物形象图鉴（PetSpecies，2026-06-21 pet-system-v2-ext / 2026-06-22 重构）
 *
 * 平台级共享（2026-06-22 改造：去除 per-org override）：
 *   - 全部由平台超管统一管理；所有机构共用一份图鉴
 *   - 任何 PetAccount.species 字符串解析时直接查本表 key 命中即可
 *
 * PetAccount.species 存 key 字符串（不存 ObjectId 引用），便于：
 *   1. 物种删除/重命名不影响已生成 PetAccount（前端 fallback emoji）
 *   2. 跨机构数据兼容（同 key 全平台语义一致）
 *
 * visualType：
 *   - image: 上传图片，存 imageFile (File ref)
 *   - svg:   内联 SVG，存 svgContent (string)
 * 不支持 html/css/js（XSS 风险，service 写入时 sanitize）
 *
 * 字段：
 *   - key / name / tier / visualType / imageFile / svgContent
 *   - weight  (破壳加权随机权重)
 *   - isActive / description / meta
 *   - createdBy / updatedBy  (审计)
 */
const PetSpeciesSchema = new Schema(
  {
    // 唯一 key（全局唯一，无 org 维度）
    key: { type: String, required: true, trim: true, unique: true },

    // 中文名（玩家可见）
    name: { type: String, required: true, trim: true, maxlength: 64 },

    // 阶
    tier: { type: String, enum: PET_TIERS, required: true, index: true },

    // 视觉类型
    visualType: { type: String, enum: PET_VISUAL_TYPES, required: true },

    // image 时存 File ref
    imageFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // svg 时存内联字符串
    svgContent: { type: String, default: null, maxlength: 50000 },

    // 破壳加权随机权重
    weight: { type: Number, default: 100, min: 0, max: 10000 },

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

// 列表查询索引：按 tier + isActive 过滤
PetSpeciesSchema.index({ tier: 1, isActive: 1 })

module.exports = model('PetSpecies', PetSpeciesSchema)