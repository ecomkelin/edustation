'use strict'

const { Schema, model } = require('mongoose')
const { PET_ITEM_SLOTS, PET_ITEM_UNLOCK_TYPES, PET_TIERS } = require('@shared/enums')

/**
 * 宠物装饰图鉴（PetItem，2026-06-21 pet-system-v2-ext / 2026-06-22 重构）
 *
 * 6 个 slot：hat / scarf / clothes / accessory / halo / background
 *   - hat/scarf/clothes/accessory：升级解锁（unlockType='level', unlockLevel 阈值）
 *   - halo/background：升阶解锁（unlockType='tier', unlockTier 阈值；累积：B 解锁 C+B）
 *
 * 平台级共享（2026-06-22 改造：去除 per-org override）：
 *   - 全部由平台超管统一管理
 *
 * 字段：
 *   - key / name / slot
 *   - unlockType / unlockTier / unlockLevel
 *   - imageFile (装饰贴图)
 *   - compatibleSpecies []  (宽松 UI 提示，不强制)
 *   - isActive / description / meta
 */
const PetItemSchema = new Schema(
  {
    // 唯一 key（全局唯一，无 org 维度）
    key: { type: String, required: true, trim: true, unique: true },

    // 玩家可见名
    name: { type: String, required: true, trim: true, maxlength: 64 },

    // slot
    slot: { type: String, enum: PET_ITEM_SLOTS, required: true, index: true },

    // 解锁类型
    unlockType: { type: String, enum: PET_ITEM_UNLOCK_TYPES, required: true },

    // 升级解锁时：unlockTier + unlockLevel
    unlockTier: { type: String, enum: PET_TIERS, default: null },
    unlockLevel: { type: Number, default: null, min: 1, max: 100 },

    // 视觉类型（2026-06-22 user SVG 决策）
    // image: 上传图片，存 imageFile
    // svg:   内联 SVG，存 svgContent
    visualType: { type: String, enum: ['image', 'svg'], default: 'image' },

    // image 时存 File ref
    imageFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // svg 时存内联字符串
    svgContent: { type: String, default: null, maxlength: 50000 },

    // 宽松 UI 提示（equip 不强制校验；admin 选填"建议用于哪些物种"）
    compatibleSpecies: { type: [String], default: [] },

    // 软启用
    isActive: { type: Boolean, default: true, index: true },

    // 描述（前端 tooltip）
    description: { type: String, default: null, maxlength: 500 },

    // 扩展位
    meta: { type: Schema.Types.Mixed, default: {} },

    // 审计
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    collection: 'pet_items'
  }
)

// 列表查询索引：按 slot + isActive 过滤
PetItemSchema.index({ slot: 1, isActive: 1 })

// 解锁查询索引：按 unlockType + unlockTier 过滤（升阶时批量取 halo/background）
PetItemSchema.index({ unlockType: 1, unlockTier: 1 })

module.exports = model('PetItem', PetItemSchema)