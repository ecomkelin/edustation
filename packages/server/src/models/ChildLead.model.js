'use strict'

const { Schema, model } = require('mongoose')
const { GENDERS } = require('@shared/enums')

/**
 * 孩子维度的潜客 (ChildLead) - 替代原 Lead (2026-06 重构)
 *
 * 设计:
 *   - 1 Parent : N ChildLead (1 家长带多孩)
 *   - parent 必填, 强绑 (软唯一在 Parent.phone 层校验, ChildLead 不重复校验)
 *   - 转化前不建 User/Student; 转化时由 trialBooking.service.convert
 *     一次性 upsert User + Student 并回填本 ChildLead.convertedStudent/At
 *   - 状态机: pending → contacted → scheduled → tried → converted | lost
 *     - pending/contacted: 销售手动
 *     - scheduled: TrialBooking 排课时自动翻
 *     - tried: TrialBooking 完成时自动翻
 *     - converted: 转化时自动翻; 同 parent 下其他 children 由 updateMany 同步翻
 *     - lost: 销售手动 (PUT ?status=lost)
 *   - 触点日志: LeadActivity 1:N ChildLead;
 *     ChildLead.lastContactedAt/By 是冗余, 由 childLead.service.createActivity 同步刷;
 *     Parent.lastContactedAt/By 由 childLead 派生
 *   - 跨年重试: sameAs 链式追溯 (2027 年新建 ChildLead.sameAs 指向 2026 ChildLead)
 *   - 1 孩多课: trialSubjects 数组, 录入时按长度自动建 N 笔 TrialBooking
 *
 * 关联:
 *   - Parent N:1 (强绑)
 *   - TrialBooking 1:N (per attemptNo)
 *   - LeadActivity 1:N
 *   - Student 0..1 (转化后回填)
 *   - Subject N:N (trialSubjects 数组)
 *
 * 索引策略:
 *   - 漏斗主查询: { org, status, createdAt }
 *   - 1 家长多孩: { org, parent, createdAt }
 *   - "我的潜客": { org, createdBy, createdAt }
 *   - 跟进列表: { org, lastContactedAt }
 *   - 搜索: { org, name }
 */
const ChildLeadSchema = new Schema(
  {
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 强绑家长 (1 家长带多孩)
    parent: { type: Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },

    // ─── 基础信息 ───
    // 孩子姓名
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: GENDERS, default: null },
    // 年龄 (地推通常不知道精确生日, 用年龄更接地气)
    age: { type: Number, min: 2, max: 25, default: null },
    // 学校
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null },
    // 年级 (例 "三年级")
    grade: { type: String, trim: true, default: '' },
    // 班级 (例 "2班"), 用 className 避 class 保留字
    className: { type: String, trim: true, default: '' },

    // ─── 试听意向 ───
    // 主意向快照 (兼容老数据, 等于 trialSubjects[0])
    trialSubject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    // 意向全集 (1 孩可试多门课; 录入时按长度建 N 笔 TrialBooking)
    trialSubjects: { type: [Schema.Types.ObjectId], ref: 'Subject', default: [] },
    // 试听缴费金额 (纯记账, 阶段 1 不接支付)
    trialFee: { type: Number, default: 0, min: 0 },
    // 招生渠道 (2026-06-15: 接 Category model='Channel' 字典; 默认继承 Parent.source; 都为空时回退 '地推')
    source: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // 邀约老师 (默认 = createdBy; 销售把"约谁来试听"填这里, 可与"试听上课老师"不同)
    inviteTeacher: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 模糊期望时间 (如 "周末下午")
    expectedTime: { type: String, trim: true, default: '' },
    // 具体约哪天 (录入 hint, 不是已排课的日期; 排课由 BatchScheduleDialog 走批量)
    specificDate: { type: Date, default: null },
    // 备注
    remark: { type: String, default: '' },

    // ─── 触点快照 (冗余) ───
    lastContactedAt: { type: Date, default: null },
    lastContactedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // ─── 状态机 ───
    status: {
      type: String,
      enum: ['pending', 'contacted', 'scheduled', 'tried', 'converted', 'lost'],
      default: 'pending',
      index: true
    },
    // 流失原因 (status='lost' 时填)
    lostReason: { type: String, default: '' },
    // 过期时间 (阶段 2 启用自动过期)
    expiredAt: { type: Date, default: null },

    // ─── 跨年重试 ───
    // 链式追溯: 2027 年新建 ChildLead.sameAs 指向 2026 ChildLead
    sameAs: [{ type: Schema.Types.ObjectId, ref: 'ChildLead' }],

    // ─── 转化结果 (由 trialBooking.service.convert 回填) ───
    convertedStudent: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
    convertedAt: { type: Date, default: null },
    // 转化备注 (销售手填"打动力/原因"; 也可能因同 parent 其他孩子转化而自动填"同家长其他孩子已报名")
    convertedRemark: { type: String, default: '' },

    // ─── 审计 ───
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'child_leads' }
)

// 漏斗主查询
ChildLeadSchema.index({ org: 1, status: 1, createdAt: -1 })
// 1 家长多孩
ChildLeadSchema.index({ org: 1, parent: 1, createdAt: -1 })
// "我的潜客" 视图
ChildLeadSchema.index({ org: 1, createdBy: 1, createdAt: -1 })
// 跟进列表
ChildLeadSchema.index({ org: 1, lastContactedAt: -1 })
// 搜索
ChildLeadSchema.index({ org: 1, name: 1 })

module.exports = model('ChildLead', ChildLeadSchema)
