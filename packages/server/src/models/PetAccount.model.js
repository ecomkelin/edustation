'use strict'

const { Schema, model } = require('mongoose')
const { PET_TIERS, PET_STATES } = require('@shared/enums')

/**
 * 学员宠物账户（PetAccount）
 *
 * 2026-06-21 pet-system-v2：替换旧 Pet.model stub；引入完整状态机
 * （egg/alive/dead）、阶 C/B/A/S、饥饿度、装饰解锁/装备。
 *
 * 关键约束：
 *   - student 唯一（一对一）：每个学员只有一只宠物
 *   - state 是核心状态机字段；alive 态才有 tier/level/experience
 *   - species 在破壳时锁定（升阶 D2 决策保留）
 *   - currentHunger 是 source of truth；read 路径不再二次计算（参照 D1）
 *
 * 字段一览（详见 plan §3.1）：
 *   - state / stateChangedAt
 *   - eggTier / eggAdoptedAt / eggHatchedAt   (egg 态)
 *   - species / tier / level / experience / hatchedAt   (alive 态)
 *   - adoptedAt                                (首次创建时间，admin 展示)
 *   - currentHunger / maxHunger / lastFedAt / lastHungerDecayAt
 *   - deathThresholdDays
 *   - nickname
 *   - unlocked { hat, scarf, clothes, accessory, halo, background } = [key, ...]
 *   - equipped { hat, scarf, clothes, accessory, halo, background } = key | null
 *   - meta 扩展位
 *
 * 关联实体（不存于此 collection）：
 *   - deathCount / lastDeathAt / lastDeathReason  → 走 PetEvent 聚合
 *   - totalLevelUps / totalTiersPromoted          → 走 PetEvent 聚合（反范式陷阱）
 *   - eggSwapCount                                → 删，无意义
 *
 * 与 PointsAccount 的关系（参照 ledger pattern）：
 *   - 喂食/置换扣积分走 points.recordTransaction({ trigger: 'pet', ... })
 *   - 升阶/降阶/破壳/死亡 0 积分，**不**写 PointsTransaction
 */
const UnlockedSlotsSchema = new Schema(
  {
    hat:        { type: [String], default: [] },
    scarf:      { type: [String], default: [] },
    clothes:    { type: [String], default: [] },
    accessory:  { type: [String], default: [] },
    halo:       { type: [String], default: [] },
    background: { type: [String], default: [] }
  },
  { _id: false }
)

const EquippedSlotsSchema = new Schema(
  {
    hat:        { type: String, default: null },
    scarf:      { type: String, default: null },
    clothes:    { type: String, default: null },
    accessory:  { type: String, default: null },
    halo:       { type: String, default: null },
    background: { type: String, default: null }
  },
  { _id: false }
)

const PetAccountSchema = new Schema(
  {
    // 多租户
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 一对一（unique）
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, unique: true, index: true },

    // === 状态机 ===
    state: { type: String, enum: PET_STATES, default: 'egg', required: true },
    stateChangedAt: { type: Date, default: Date.now },

    // === 蛋态字段 ===
    eggTier: { type: String, enum: PET_TIERS, default: 'C' },
    eggAdoptedAt: { type: Date, default: Date.now },
    eggHatchedAt: { type: Date, default: null },

    // === 活态字段 ===
    species: { type: String, default: null }, // PET_SPECIES key；破壳时锁定
    tier: { type: String, enum: PET_TIERS, default: null },
    level: { type: Number, default: 1, min: 1 },
    experience: { type: Number, default: 0, min: 0 },
    hatchedAt: { type: Date, default: null },

    // === 首次创建时间（admin 列表展示用） ===
    adoptedAt: { type: Date, default: Date.now },

    // === 饥饿系统（D1: cron 写 + read 纯展示） ===
    currentHunger: { type: Number, default: 100, min: 0, max: 1000 },
    maxHunger: { type: Number, default: 1000, min: 1 },
    lastFedAt: { type: Date, default: null },
    lastHungerDecayAt: { type: Date, default: null },
    deathThresholdDays: { type: Number, default: 30, min: 1 },
    // 2026-06-23: 饱腹度衰减间隔已从 PetAccount 移除
    //   改由 PetSpecies.hungerDecayMinutes 决定（物种统一控制）
    //   平台级 fallback 在 cron 内部用 SiteConfig.pet.hungerDecayMinutes

    // === 宠物昵称 ===
    nickname: { type: String, trim: true, default: null, maxlength: 32 },

    // === 装饰系统 ===
    unlocked: { type: UnlockedSlotsSchema, default: () => ({}) },
    equipped: { type: EquippedSlotsSchema, default: () => ({}) },

    // === 扩展位 ===
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    collection: 'pet_accounts',
    toJSON: { virtuals: false },
    toObject: { virtuals: false }
  }
)

// 唯一索引（一对一）
PetAccountSchema.index({ org: 1, student: 1 }, { unique: true })

// cron 扫表索引：D1 饥饿衰减时按 (org, state, lastHungerDecayAt) 扫
PetAccountSchema.index({ org: 1, state: 1, lastHungerDecayAt: 1 })

// admin 端按 (org, state) 过滤列表
PetAccountSchema.index({ org: 1, state: 1 })

module.exports = model('PetAccount', PetAccountSchema)
