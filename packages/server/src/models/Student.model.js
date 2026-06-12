'use strict'

const { Schema, model } = require('mongoose')
const { GENDERS } = require('@shared/enums')

/**
 * 学员（Student）
 *
 * 校外培训机构的核心实体。注意 Student 本身不能登录系统——
 * 登录由其监护人（User.guardians 关联）完成，登录后再"切换上下文"代理操作学员。
 *
 * 关键设计（与 CLAUDE.md 一致）：
 *   - 家长登录后始终在顶部显示当前活跃学员（请求头 `x-active-student-id`）
 *   - 单子女时显示"当前孩子：xx"，但保留切换元素（不跳过选择步骤）
 *   - 多子女时可切换
 *
 * 字段设计：
 *   - guardianUser: 主监护人（账户主）—— 用于家长端默认进入的学员
 *   - guardians:    所有监护人列表（含主监护人）—— 用于"我家多个孩子"的多家长场景
 *     （例如爸爸妈妈都能在 App 看到孩子的课表；老师可联系任意监护人）
 *   - isActive:     是否在读；false 时不会出现在新报名/排课的学生下拉中
 */
const StudentSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 学员姓名
    name: { type: String, required: true, trim: true },
    // 性别（取自 GENDERS 枚举）
    gender: { type: String, enum: GENDERS },
    // 出生日期（用于按年龄分组/合规校验）
    birthday: { type: Date },
    // 主监护人（账户主）—— 家长端默认进入的学员即按此关联
    guardianUser: { type: Schema.Types.ObjectId, ref: 'User' },
    // 所有监护人列表（含主监护人）—— 支持"一个孩子多个家长都能在 App 看课表"
    guardians: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // 所属学校（选填，关联 School 档案，用于市场发传单 / 按学校聚合学生）
    school: { type: Schema.Types.ObjectId, ref: 'School' },
    // 备注（过敏史/特殊需求/老师注意事项等）
    notes: { type: String },
    // 是否在读；false 时不再出现在新报名/排课的学生下拉中（历史数据保留）
    isActive: { type: Boolean, default: true },
    // 黑名单标记(与 isActive 独立): true 时拒绝新报名/下单/家长端不可见
    //   由超管操作(Platform Admin 专属能力),用于恶意破坏人员封禁
    isBlocked: { type: Boolean, default: false },
    // 禁用时间(便于追踪封禁历史);解禁时置 null
    blockedAt: { type: Date, default: null },
    // 禁用原因(超管在操作时填写,便于家长/教务事后查询)
    blockedReason: { type: String, default: null },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'students' }
)

// 按机构 + 是否在读过滤（最常见的工作台查询）
StudentSchema.index({ org: 1, isActive: 1 })
// 按机构 + 姓名查找（同名搜索）
StudentSchema.index({ org: 1, name: 1 })
// 反向：查"这个家长关联的所有学员"（家长端"我的孩子"列表）
StudentSchema.index({ guardians: 1 })
// 按机构 + 是否黑名单过滤（管理员查看禁用学员）
StudentSchema.index({ org: 1, isBlocked: 1 })
// 按机构 + 学校聚合（"这所小学在我这报了多少学生"）
StudentSchema.index({ org: 1, school: 1 })

module.exports = model('Student', StudentSchema)
