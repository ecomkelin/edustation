'use strict'

const { Schema, model } = require('mongoose')
const { PET_ITEM_SLOTS, PET_TIERS } = require('@shared/enums')

/**
 * 宠物装饰图鉴（PetItem，2026-06-21 pet-system-v2-ext / 2026-06-22 重构 / 2026-07-08 拆分）
 *
 * 6 个 slot：hat / scarf / clothes / accessory / halo / background
 *
 * 2026-07-08 改造：删除 unlockType enum，改为两个独立字段：
 *   - unlockLevel (Number, nullable)
 *       - 非空 → 当 pet.level ≥ unlockLevel 时解锁
 *   - unlockTier  (enum C/B/A/S, nullable)
 *       - 非空 → 当 pet.tier ≥ unlockTier 时解锁（累积：B 解锁 C+B）
 *
 * 两字段独立可选：
 *   - 只设 unlockLevel → 纯升级解锁（hat/scarf/clothes/accessory 类）
 *   - 只设 unlockTier  → 纯升阶解锁（halo/background 类）
 *   - 两个都设 → AND 同时满足才解锁
 *   - 两个都空 → 视为永久不可解锁（admin 必须至少填一个）
 *
 * 平台级共享（2026-06-22 改造：去除 per-org override）：
 *   - 全部由平台超管统一管理
 *
 * 字段：
 *   - key / name / slot
 *   - unlockTier / unlockLevel （2026-07-08 拆字段，删 unlockType）
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

    // 升级解锁阈值（2026-07-08 拆字段：unlockType 取消）
    unlockLevel: { type: Number, default: null, min: 1, max: 100 },

    // 升阶解锁阈值（2026-07-08 拆字段：unlockType 取消）
    unlockTier: { type: String, enum: PET_TIERS, default: null },

    // 2026-06-22 pet-shop：购买积分（>=0）。null 表示不可购买（仅自动解锁）。
    pointCost: { type: Number, default: null, min: 0, max: 100000 },

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

// 解锁查询索引：按 unlockTier 过滤（升阶时批量取 halo/background）
PetItemSchema.index({ unlockTier: 1 })
// 解锁查询索引：按 unlockLevel 过滤（升级时批量取 hat/scarf/clothes/accessory）
PetItemSchema.index({ unlockLevel: 1 })

module.exports = model('PetItem', PetItemSchema)