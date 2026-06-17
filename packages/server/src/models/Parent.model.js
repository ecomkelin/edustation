'use strict'

const { Schema, model } = require('mongoose')

/**
 * 家长账户 (Parent) - 招生业务实体
 *
 * 设计 (2026-06 重构, 替代原 Lead):
 *   - Parent 是**业务档案**, 与 User (登录账号) 解耦
 *     - 创建 Parent 时不需要 User 存在
 *     - 首个 ChildLead 转化时才 upsert User 并回填 Parent.user
 *     - 同 phone 下 1 家长带多孩 (1 Parent : N ChildLead)
 *   - 业务归因: 推广人员 (录入销售) / 咨询老师 (转化负责) / 渠道 (source)
 *   - 家长 lifecycle 状态机: new / partial / full / lost / dormant
 *     - new     刚登记, 还没孩子报名
 *     - partial 部分孩子报名 (1 家长多孩, 1 个已签)
 *     - full    所有孩子都报名
 *     - lost    销售明确放弃, 打了 lost 标签
 *     - dormant 长期未联系 / 未试听 (阶段 2 定时任务翻)
 *   - 触点日志跟 ChildLead 走 (LeadActivity 1:N ChildLead);
 *     Parent.lastContactedAt/By 是冗余字段, 由 childLead.service.createActivity 同步刷
 *   - 标签: 用 Category 字典 (model='LeadTag'); 加 '已流失' 标签自动翻 lifecycle='lost'
 *   - 跨年重试: 业务上不直接存在, 由 ChildLead.sameAs 链式追溯
 *
 * 关联:
 *   - ChildLead 1:N (业务上 N 个孩子)
 *   - TrialBooking 1:N (冗余, 加速"该家长的所有试听")
 *   - User 0..1 (转化后回填, 同 phone 下首孩转化时 upsert)
 *   - Category (LeadTag) N:N
 *
 * 唯一键:
 *   - (org, phone) unique (同机构内 1 家长 1 手机号)
 *
 * 索引策略:
 *   - 看板主查询: { org, lifecycle, lastContactedAt }
 *   - 推广人员归因: { org, promoteBy, createdAt }
 *   - 咨询师归因: { org, consultant, createdAt }
 *   - 渠道 ROI: { org, source, lifecycle }
 *   - 跟进列表: { org, lastContactedAt }
 *   - 标签分布 aggregate: { tags }
 */
const ParentSchema = new Schema(
  {
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 联系电话 (业务唯一键, 同 org 下唯一)
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^1[3-9]\d{9}$/
    },

    // ─── 业务归因 ───
    // 招生渠道 (2026-06-15: 阶段 2 落地, 接 Category model='Channel' 字典; 创建时未指定默认 = '地推')
    source: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    // 渠道补充说明 (例: "老学员-王五妈介绍")
    sourceDetail: { type: String, trim: true, default: '' },
    // 推广人员 (录入家长账户的销售)
    promoteBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 咨询老师 (转化负责, 与 promoteBy 业务上常不同)
    consultant: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 推荐人 (老带新场景, 指向另一个 Parent)
    referrer: { type: Schema.Types.ObjectId, ref: 'Parent', default: null },

    // ─── 转化后绑定 (Parent 业务档案 ↔ User 登录账号) ───
    // 首个 ChildLead 转化时 upsert User 后回填; 创建 Parent 时为 null
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // ─── 家长生命周期 (替代"还有资源"模糊语义) ───
    // 详见文件头注释
    lifecycle: {
      type: String,
      enum: ['new', 'partial', 'full', 'lost', 'dormant'],
      default: 'new',
      index: true
    },

    // === 家长沟通画像 (2026-06-16 重构, 从 UserOrgRel 搬过来) ===
    // 业务: 1 家长 × 1 机构 ≤ 1 份画像; Parent 自身就按 org 隔离, 跨机构独立
    // 潜客阶段 (parent.user=null) 也能写, 无需等待转化
    // 字段结构化优先于 meta, 便于索引 / 校验 / UI 渲染
    commStyle:   { type: String, default: '', maxlength: 500 },   // 沟通偏好
    familyBg:    { type: String, default: '', maxlength: 500 },   // 家庭背景
    childFocus:  { type: String, default: '', maxlength: 500 },   // 孩子关注
    followUp:    { type: String, default: '', maxlength: 2000 },  // 跟进备忘
    // 元数据: 追踪最后编辑
    profileLastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    profileLastUpdatedAt: { type: Date, default: null },
    // 扩展位 (后续阶段加字段不需改 schema)
    profileMeta: { type: Schema.Types.Mixed, default: {} },

    // ─── 标签 (N:N → Category, model='LeadTag') ───
    tags: [{ type: Schema.Types.ObjectId, ref: 'Category' }],

    // ─── 触点快照 (冗余, 加速"待跟进"列表) ───
    firstContactedAt: { type: Date, default: null },
    lastContactedAt: { type: Date, default: null },
    lastContactedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // ─── 跨年记忆 (阶段 2 用, dormant 自动翻转逻辑) ───
    lastTrialAt: { type: Date, default: null },
    lastTrialYear: { type: Number, default: null },

    // 备注
    remark: { type: String, default: '' },

    // ─── 审计 ───
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'parents' }
)

// 业务唯一键: 同 org 下 phone 唯一
ParentSchema.index({ org: 1, phone: 1 }, { unique: true })
// 看板主查询
ParentSchema.index({ org: 1, lifecycle: 1, lastContactedAt: -1 })
// 推广人员归因
ParentSchema.index({ org: 1, promoteBy: 1, createdAt: -1 })
// 咨询师归因
ParentSchema.index({ org: 1, consultant: 1, createdAt: -1 })
// 渠道 ROI
ParentSchema.index({ org: 1, source: 1, lifecycle: 1 })
// 跟进列表
ParentSchema.index({ org: 1, lastContactedAt: -1 })
// 标签分布 aggregate
ParentSchema.index({ tags: 1 })

module.exports = model('Parent', ParentSchema)
