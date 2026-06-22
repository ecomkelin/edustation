'use strict'

const { Schema, model } = require('mongoose')
const { PET_EVENT_TYPES } = require('@shared/enums')

/**
 * 宠物事件流水（PetEvent）
 *
 * 2026-06-21 pet-system-v2：宠物状态机变更的独立审计流。
 *
 * 关键设计（与 PointsTransaction 严格隔离）：
 *   - 升阶/降阶/破壳/死亡/复活 0 积分，**不**写 PointsTransaction（避免污染积分看板）
 *   - PointsTransaction.trigger='pet' 仅在 feed / swap 扣分时使用
 *   - 12 种事件类型，每种有独立 payload shape（见 §3.2 文档）
 *
 * payload shape 约定（写时严格按此结构，方便 admin 端结构化渲染）：
 *   - adopt          { initialTier: 'C' }
 *   - hatch          { tier, species }
 *   - feed           { consumableKey, expGain, hungerBefore, hungerAfter, expBefore, expAfter, tier, level }
 *   - levelup        { fromLevel, toLevel, tier }
 *   - tierup         { fromTier, toTier }                       // 升阶免费
 *   - tierdown       { fromTier, toTier, reason: 'manual' }     // D2: species 保留
 *   - swap           { tier, cost, fromSpecies }                 // 置换蛋
 *   - death          { tier, hunger, daysAtZero, reason: 'hunger' }
 *   - rebirth        { tier, fromDeath: true }
 *   - equip          { slot, itemKey, fromItemKey: null }
 *   - unequip        { slot, itemKey, fromItemKey: <prevKey> }
 *   - admin_override { field, oldValue, newValue, reason, operator: User._id }
 */
const PetEventSchema = new Schema(
  {
    // 多租户
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 学员 + 宠物（双引用便于按学员查、按宠物查）
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    petAccount: { type: Schema.Types.ObjectId, ref: 'PetAccount', required: true, index: true },
    // 事件类型
    type: { type: String, enum: PET_EVENT_TYPES, required: true, index: true },
    // 结构化 payload（按 type 走固定 shape）
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'pet_events'
  }
)

// 按学员查事件流（家长端"宠物事件流"页用）
PetEventSchema.index({ org: 1, student: 1, createdAt: -1 })
// 按机构 + 类型聚合（admin 端"事件流" tab + 未来"宠物看板"统计用）
PetEventSchema.index({ org: 1, type: 1, createdAt: -1 })
// 按宠物 ID 查（admin 端 per-pet 详情）
PetEventSchema.index({ petAccount: 1, createdAt: -1 })

module.exports = model('PetEvent', PetEventSchema)
