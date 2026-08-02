'use strict'

const { Schema, model } = require('mongoose')
const { PET_CONSUMABLE_KINDS, PET_VISUAL_TYPES } = require('@shared/enums')

/**
 * 宠物消耗品图鉴（PetConsumable，2026-06-21 pet-system-v2-ext）
 *
 * 合并食物 + 玩具（同机制：pointCost + hungerRestore + expGain 三字段）
 *
 * 平台级共享：全部由平台超管统一管理。
 *
 * 2026-07-15 重构：删等阶后，去 applicableTier + perTier（{C,B,A,S,all}），
 * 改单套扁平数值（pointCost / hungerRestore / expGain）。
 *
 * 与 PetAccount 的关系：
 *   - PetAccount 自身不存 consumable 引用
 *   - 喂食扣分走 points.recordTransaction({trigger:'pet', meta:{action:'feed', consumableKey}})
 *   - 历史消费由 PetEvent 'feed' payload 含 consumableKey 审计
 */
const PetConsumableSchema = new Schema(
  {
    // 唯一 key（全局唯一，无 org 维度）
    key: { type: String, required: true, trim: true, unique: true },

    // 玩家可见名
    name: { type: String, required: true, trim: true, maxlength: 64 },

    // food / toy
    kind: { type: String, enum: PET_CONSUMABLE_KINDS, required: true, index: true },

    // 扁平数值（无 tier）
    pointCost:     { type: Number, required: true, min: 0, max: 100000 },
    hungerRestore: { type: Number, required: true, min: 0, max: 1000 },
    expGain:       { type: Number, required: true, min: 0, max: 100000 },

    // 图标（svg / video 二选；消耗品是小图标，不强制 video；2026-07-16 删 image）
    visualType: { type: String, enum: PET_VISUAL_TYPES, default: 'svg' },
    svgContent: { type: String, default: null, maxlength: 50000 },
    videoFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // 软启用
    isActive: { type: Boolean, default: true, index: true },

    // 2026-07-21 v4: 限定物种（PetSpecies.key 数组）
    //   [] = 通用，所有宠物可喂（现状）
    //   ["cat_orange", "cat_grey"] = 仅列表内物种的宠物可喂（如"猫薄荷"喂所有猫）
    // 设计动机: 跟学员宠物实例是间接关系；跟宠物图鉴（PetSpecies）是直接关系
    // 同一物种的所有学员宠物都受限制（不需要"每只宠物单独配"）
    // 配合 petShop.controller.resolvePetId 自动选该物种的宠物 + pet.service.feed 校验
    // **不需要弃养级联清理**（物种不会因宠物弃养而消失）
    ownerSpecies: { type: [String], default: [], index: true },

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
    collection: 'pet_consumables'
  }
)

// 列表查询索引：按 kind + isActive 过滤
PetConsumableSchema.index({ kind: 1, isActive: 1 })

module.exports = model('PetConsumable', PetConsumableSchema)