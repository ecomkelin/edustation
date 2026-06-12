'use strict'

const { Schema, model } = require('mongoose')
const { SCHOOL_TYPES } = require('@shared/enums')

/**
 * 学校档案（School）
 *
 * 教培机构维护的"周边学校"基础档案，用于：
 *   - 市场地推：知道每所学校的出口数量，便于安排发传单站位
 *   - 接送高峰：知道每天几点放学（周五与其他四天不同），把握家长接送窗口
 *   - 学生归类：把 Student 档案按"所属学校"聚合（Student.school 选填）
 *
 * 与机构（Org）的区别：Org 是 SaaS 租户本身（培训机构）；School 是机构周边的
 * 实体学校（小学/初中/高中/幼儿园），与机构是 N:1 关系（一个机构关注 N 所学校）。
 */
const SchoolSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 学校名（如"市第一实验小学"）
    name: { type: String, required: true, trim: true },
    // 学段（取自 SCHOOL_TYPES 枚举；默认小学）
    type: { type: String, enum: SCHOOL_TYPES, default: 'elementary' },
    // 学校地址
    address: { type: String, trim: true },
    // 出口数量（用于发传单站位规划；>= 0）
    exitCount: { type: Number, default: 0, min: 0 },
    // 周一~周四放学时间（HH:MM 24h 字符串，默认 '17:30'）
    weekdayDismissal: { type: String, default: '17:30' },
    // 周五放学时间（HH:MM 24h 字符串，默认 '16:00'）
    fridayDismissal: { type: String, default: '16:00' },
    // 备注（校区关键信息 / 历史沟通记录 / 联系人等）
    notes: { type: String },
    // 是否启用：false 时不出现在学生表单下拉（已绑定的学生仍可读历史信息）
    isActive: { type: Boolean, default: true },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'schools' }
)

// 同一机构内学校名唯一
SchoolSchema.index({ org: 1, name: 1 }, { unique: true })
// 按机构 + 启用状态过滤（学生表单下拉）
SchoolSchema.index({ org: 1, isActive: 1 })
// 按机构 + 学段筛选（"我家周边的所有小学"）
SchoolSchema.index({ org: 1, type: 1 })

module.exports = model('School', SchoolSchema)
