'use strict'

const { Schema, model } = require('mongoose')
const { PET_CONSUMABLE_KINDS, PET_CONSUMABLE_APPLICABLE_TIERS } = require('@shared/enums')

/**
 * 宠物消耗品图鉴（PetConsumable，2026-06-21 pet-system-v2-ext）
 *
 * 合并食物 + 玩具（同机制：pointCost + hungerRestore + expGain 三字段）
 *
 * applicableTier：
 *   - 'C'/'B'/'A'/'S': 仅适用该阶宠物
 *   - 'all':           适用所有阶（perTier 每阶独立数值；service 喂食时取 perTier[petTier]）
 *
 * perTier schema（per 阶 config）：
 *   - pointCost:      积分成本（>0）
 *   - hungerRestore:  饱腹度恢复（0-100）
 *   - expGain:        经验值
 *
 * 与 PetAccount 的关系：
 *   - PetAccount 自身不存 consumable 引用
 *   - 喂食扣分走 points.recordTransaction({trigger:'pet', meta:{action:'feed', consumableKey}})
 *   - 历史消费由 PetEvent 'feed' payload 含 foodType（旧）/ consumableKey（新）审计
 */
const PerTierValueSchema = new Schema(
  {
    pointCost:     { type: Number, required: true, min: 0, max: 100000 },
    hungerRestore: { type: Number, required: true, min: 0, max: 100 },
    expGain:       { type: Number, required: true, min: 0, max: 100000 }
  },
  { _id: false }
)

const PetConsumableSchema = new Schema(
  {
    // 多租户；null = 平台默认
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },

    // 唯一 key
    key: { type: String, required: true, trim: true },

    // 玩家可见名
    name: { type: String, required: true, trim: true, maxlength: 64 },

    // food / toy
    kind: { type: String, enum: PET_CONSUMABLE_KINDS, required: true, index: true },

    // 适用阶
    applicableTier: { type: String, enum: PET_CONSUMABLE_APPLICABLE_TIERS, required: true },

    // 每阶配置；service 查 perTier[petTier] 或 perTier.all
    perTier: {
      type: {
        C:   { type: PerTierValueSchema, default: null },
        B:   { type: PerTierValueSchema, default: null },
        A:   { type: PerTierValueSchema, default: null },
        S:   { type: PerTierValueSchema, default: null },
        all: { type: PerTierValueSchema, default: null }
      },
      default: () => ({})
    },

    // 图标
    imageFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

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
    collection: 'pet_consumables'
  }
)

// 唯一索引：同 org（可 null）下 key 不重
PetConsumableSchema.index({ org: 1, key: 1 }, { unique: true })

// 列表查询索引：按 org + kind + isActive 过滤
PetConsumableSchema.index({ org: 1, kind: 1, isActive: 1 })

module.exports = model('PetConsumable', PetConsumableSchema)