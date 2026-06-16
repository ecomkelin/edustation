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
 *  - 合规字段（unicode / socialCreditCode / legalPerson / licenseNumber / name / nameAbbreviation / principal / type / region / establishedDate）只允许平台超管写入
 *  - type 引用 Category 字典（model='Org'），便于运营在后台维护机构类型
 *  - region 引用 Region 字典（省/市/区），用于按地域筛选机构
 *  - principal 必须属于本机构（更新时在 service 层校验，避免跨机构挂名）
 *
 * 推广信息（description / brandStory / businessScope / hotline / 自媒体 / SEO / 资质图等）
 * 不在本表，独立走 OrgPromotion（1:1 关系，org_promotions collection）。
 * 拆分理由见 OrgPromotion.model.js 头注释。
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
    // 成立/开设日期（业务字段名沿用 establishedDate；2026-06 移除 immutable，允许平台超管修改）
    establishedDate: { type: Date, default: null },

    // ── 合规字段（仅平台超管可写） ──
    // 统一社会信用代码（"信用代码"对外公示版）。
    // 业务上 1 机构 1 信用代码，作为对外公示的合规主键。
    // 历史上 unicode 字段承担过该角色；2026-06 起两个并存：unicode=内部编码（保持 unique），
    // socialCreditCode=对外的 18 位社会信用代码。仅超管可改。
    socialCreditCode: { type: String, trim: true, default: '' },
    // 法人代表（营业执照上的"法定代表人"）。仅超管可改。
    legalPerson: { type: String, trim: true, default: '' },
    // 办学许可证号（民办教育机构必填；非教培机构可空）。仅超管可改。
    licenseNumber: { type: String, trim: true, default: '' },

    // 是否启用；false 时该机构下用户无法登录/操作（"停用"而非"删除"以保留历史数据）
    isActive: { type: Boolean, default: true },
    // 机构 logo URL（走统一 storage：上传到 /storage/upload?scope=org，拿到 url 后写入）
    logo: { type: String, default: null },
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
// 对外公示信用代码查询
OrgSchema.index({ socialCreditCode: 1 })

module.exports = model('Org', OrgSchema)
