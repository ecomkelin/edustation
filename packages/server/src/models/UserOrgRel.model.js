'use strict'

const { Schema, model } = require('mongoose')

/**
 * 用户-机构关系（UserOrgRel）
 *
 * 多对多关系：1 个 User 可以在多家机构任职，1 个 Org 可以有多名员工。
 * 中间表额外记录"在每家机构下担任的岗位"和"是否主机构"。
 *
 * 关键设计：
 *   - positions: 该用户在本机构下持有的岗位列表（一个员工可同时是"教务+老师"等）
 *   - isMain:   是否主机构（true 时表示这是该用户的"默认"所属机构）
 *     · 业务含义：登录后默认进入主机构
 *     · 同一用户多个机构时仅一个 isMain=true（业务层校验；可考虑加 partial unique）
 *
 * 唯一性约束：
 *   - (user, org) 唯一：同一用户在同一机构只能有一条关系记录
 */
const UserOrgRelSchema = new Schema(
  {
    // 用户
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 该用户在本机构下持有的岗位列表（数组：一个员工可同时是"教务+老师"等）
    positions: [{ type: Schema.Types.ObjectId, ref: 'Position' }],
    // 是否主机构：true 表示登录后默认进入这家；同一用户多个机构时仅一个 isMain=true
    isMain: { type: Boolean, default: false },

    // === 家长沟通画像 (2026-06 新增) ===
    // 业务上 1 个家长在 1 个机构下有 1 份画像; 跨机构独立
    // 字段结构化优先于 meta, 便于索引 / 校验 / UI 渲染
    commStyle:   { type: String, default: '', maxlength: 500 },   // 沟通偏好 (例: 偏好微信/电话; 晚上 9 点后不接电话; 决策快/慢)
    familyBg:    { type: String, default: '', maxlength: 500 },   // 家庭背景 (例: 双职工/全职妈妈/二孩家庭)
    childFocus:  { type: String, default: '', maxlength: 500 },   // 家长对孩子最关心什么 (例: 升学/兴趣/习惯养成)
    followUp:    { type: String, default: '', maxlength: 2000 },  // 跟进备忘 (长文本, 例: 暑假班续费意向; 对某某老师有好感; 上次约下周回访)
    // 元数据: 追踪最后编辑
    profileLastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    profileLastUpdatedAt: { type: Date, default: null },
    // 扩展位 (后续阶段加字段不需改 schema)
    profileMeta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'user_org_rels' }
)

// 同一用户在同一机构只能有一条关系记录
UserOrgRelSchema.index({ user: 1, org: 1 }, { unique: true })
// 反向：查"该用户的所有机构，优先看主机构"（登录后默认进入主机构的工作台）
UserOrgRelSchema.index({ user: 1, isMain: 1 })
// 按机构查"该机构下的所有员工"
UserOrgRelSchema.index({ org: 1 })

module.exports = model('UserOrgRel', UserOrgRelSchema)
