'use strict'

const { Schema, model } = require('mongoose')
const { PET_STATES } = require('@shared/enums')

/**
 * 学员宠物账户（PetAccount）
 *
 * 2026-06-21 pet-system-v2 立项；2026-07-15 重构：
 *   - 删等阶 C/B/A/S（tier / eggTier 字段删除）
 *   - 删装饰系统（unlocked / equipped 子文档删除）
 *   - 一个学生可领养多只宠物（去 student unique；加 isDefault）
 *   - 等级曲线 per-org 可配置（见 PetLevelConfig）
 *
 * 关键约束：
 *   - 一个学生可有多只宠物（≤ MAX_PETS_PER_STUDENT），其中恰好一只 isDefault=true
 *   - state 是核心状态机字段；alive 态才有 species/level/experience
 *   - species 在破壳时随机锁定（死亡回蛋后清空，下次破壳重随机）
 *   - currentHunger 是 source of truth；read 路径不再二次计算
 *
 * 与 PointsAccount 的关系（ledger pattern）：
 *   - 喂食扣积分走 points.recordTransaction({ trigger: 'pet', ... })
 *   - 破壳/升级/死亡/设默认 0 积分，**不**写 PointsTransaction
 */
const PetAccountSchema = new Schema(
  {
    // 多租户
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 归属学员（一对多：一个学生可有多只宠物）
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },

    // 默认宠物：每个 student 恰好一只 true，展示在首页/详情页主图/课堂展示主图
    isDefault: { type: Boolean, default: false },

    // === 状态机 ===
    state: { type: String, enum: PET_STATES, default: 'egg', required: true },
    stateChangedAt: { type: Date, default: Date.now },

    // === 蛋态字段 ===
    eggAdoptedAt: { type: Date, default: Date.now },
    eggHatchedAt: { type: Date, default: null },

    // === 活态字段 ===
    species: { type: String, default: null }, // PetSpecies key；破壳时锁定
    level: { type: Number, default: 1, min: 1 },
    experience: { type: Number, default: 0, min: 0 },
    hatchedAt: { type: Date, default: null },

    // === 首次创建时间（admin 列表展示用） ===
    adoptedAt: { type: Date, default: Date.now },

    // === 饥饿系统（cron 写 + read 纯展示） ===
    currentHunger: { type: Number, default: 100, min: 0, max: 1000 },
    maxHunger: { type: Number, default: 1000, min: 1 },
    lastFedAt: { type: Date, default: null },
    lastHungerDecayAt: { type: Date, default: null },
    deathThresholdDays: { type: Number, default: 30, min: 1 },

    // === 宠物昵称 ===
    nickname: { type: String, trim: true, default: null, maxlength: 32 },

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

// 多宠：普通复合索引（不再 unique）
PetAccountSchema.index({ org: 1, student: 1 })

// 每个学生唯一默认宠物：partial unique（仅 isDefault=true 的文档参与唯一约束）
PetAccountSchema.index(
  { org: 1, student: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
)

// cron 扫表索引：饥饿衰减时按 (org, state, lastHungerDecayAt) 扫
PetAccountSchema.index({ org: 1, state: 1, lastHungerDecayAt: 1 })

// admin 端按 (org, state) 过滤列表
PetAccountSchema.index({ org: 1, state: 1 })

// 2026-07-16 同种唯一: 1 学生 + 1 species ≤ 1 只
// partialFilterExpression 仅在 species 是字符串(活态锁定)时生效
// 蛋态 species=null 不参与, 否则所有蛋都会撞唯一约束
PetAccountSchema.index(
  { org: 1, student: 1, species: 1 },
  { unique: true, partialFilterExpression: { species: { $type: 'string' } } }
)

module.exports = model('PetAccount', PetAccountSchema)
