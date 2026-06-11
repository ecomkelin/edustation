'use strict'

const { Schema, model } = require('mongoose')

/**
 * 机构（Org）
 *
 * SaaS 多租户的基础实体。系统中几乎所有业务数据都通过 org 字段与本实体关联，
 * 第一家机构 = 第一个租户。
 *
 * 关键约束：
 *  - unicode / name / nameAbbreviation 三者均 unique（防止重名/编码冲突）
 *  - establishedDate 创建后不可修改（mongoose immutable）—— 防止运营误改机构创立时间
 *  - type 引用 Category 字典（model='Org'），便于运营在后台维护机构类型
 *  - region 引用 Region 字典（省/市/区），用于按地域筛选机构
 *  - principal 必须属于本机构（更新时在 service 层校验，避免跨机构挂名）
 *
 * 关系：
 *  - 1 个 Org 对应 N 个 User（通过 UserOrgRel 关联；同一用户可在多家机构任职）
 *  - 1 个 Org 下有独立的 Position / Subject / CourseProduct / Student 等
 */
const OrgSchema = new Schema(
  {
    // 机构统一编码（内部使用，例如人工分配或对接监管平台的唯一编号）
    unicode: { type: String, required: true, unique: true, trim: true },
    // 机构全称
    name: { type: String, required: true, unique: true, trim: true },
    // 机构简称（用于列表/搜索时展示）
    nameAbbreviation: { type: String, required: true, unique: true, trim: true },
    // 机构类型（引用 Category 字典，model='Org'；如"有限责任公司"/"个体工商户"等）
    type: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // 所在地区（引用 Region 字典；省/市/区）
    region: { type: Schema.Types.ObjectId, ref: 'Region', default: null },
    // 负责人（必须是本机构下具有"管理员"岗位的 User；service 层校验所属 org）
    principal: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 联系人姓名（与 principal 不同：可能是负责教务/运营/市场的具体对接人）
    contactPerson: { type: String, trim: true },
    // 联系电话
    contactPhone: { type: String, trim: true },
    // 详细地址
    address: { type: String, trim: true },
    // 成立日期（创建后不可改；mongoose immutable 保证）
    establishedDate: { type: Date, immutable: true },
    // 是否启用；false 时该机构下用户无法登录/操作（"停用"而非"删除"以保留历史数据）
    isActive: { type: Boolean, default: true },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'orgs' }
)

// 按机构类型筛选
OrgSchema.index({ type: 1 })
// 按地区筛选
OrgSchema.index({ region: 1 })
// 平台管理后台：列出所有启用/停用机构
OrgSchema.index({ isActive: 1 })
// 全文检索：按名称/简称模糊搜索
OrgSchema.index({ name: 'text', nameAbbreviation: 'text' })

module.exports = model('Org', OrgSchema)
