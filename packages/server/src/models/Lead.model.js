'use strict'

const { Schema, model } = require('mongoose')
const { GENDERS } = require('@shared/enums')

/**
 * 潜客（Lead）/ 招生线索
 *
 * 业务上代表一个"还没报名 / 还没试听 / 还没成为学生"的意向客户。
 * 通常由地推/市场在街上扫码录入,包含姓名/电话/年龄/学校/年级等基础信息;
 * 以及期望的试听科目/时间/邀约老师/缴费金额等意向信息。
 *
 * 关键设计:
 *   - 转化前 lead 自身没有账号 (User); 试听转化时 (TrialBooking.result.isEnrolled=true)
 *     由 tryLesson.service.convert 一次性建 User/Student/UserOrgRel 并回填到本 lead。
 *   - 状态机: pending → contacted → scheduled → tried → converted | lost
 *   - 触点日志独立存 LeadActivity (1:N); Lead.lastContactedAt/By 是冗余快照, 加速"待跟进"列表
 *   - phone 软唯一: 同 org 下 phone 唯一 (全局 User.mobile 仍可被另一 org 复用, 这是允许的)
 *   - source 是自由文本, 阶段 1 暂不接 Category.model='Channel' 字典
 *
 * 关联实体:
 *   - TrialBooking: 1:N (每个 lead 可有多次试听, attemptNo 1/2/3/...)
 *   - LeadActivity: 1:N (触点日志)
 */
const LeadSchema = new Schema(
  {
    // 所属机构 (多租户隔离)
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },

    // ─── 基础信息 ───
    // 孩子姓名 (不是家长姓名, 转化时家长姓名 = '家长-' + lead.name)
    name: { type: String, required: true, trim: true },
    // 性别
    gender: { type: String, enum: GENDERS, default: null },
    // 年龄 (地推通常不知道精确生日, 用年龄更接地气; 转化到 Student 时仍是 null birthday)
    age: { type: Number, min: 2, max: 25, default: null },
    // 联系电话 (大陆 11 位手机号; 同 org 内唯一, partialFilterExpression 排除 null/缺省)
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^1[3-9]\d{9}$/
    },

    // ─── 学校/年级 ───
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null },
    // 年级 (如 "三年级"); 转化时拷贝到 Student.grade
    grade: { type: String, trim: true, default: '' },
    // 班级 (如 "2班"); 用 className 避开 class 保留字; 转化时拷贝到 Student.className
    className: { type: String, trim: true, default: '' },

    // ─── 试听意向 ───
    // 想试听的科目 (主意向快照; 历史/兼容字段; 新录入优先用 trialSubjects)
    trialSubject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    // 意向全集 (多选, 2026-06): 1 孩可试多门课; 录入时按数组长度建 N 笔 TrialBooking
    // 老 lead 没这字段 (默认 []), 读时回落到 trialSubject
    trialSubjects: { type: [Schema.Types.ObjectId], ref: 'Subject', default: [] },
    // 试听缴费金额 (纯记账, 阶段 1 不接支付; 后续可走 Order)
    trialFee: { type: Number, default: 0, min: 0 },
    // 招生渠道 (自由文本: walkin/refer/douyin/xiaohongshu/ad/...; 阶段 2 接 Category 字典)
    source: { type: String, trim: true, default: 'walkin' },
    // 邀约老师 (默认 = createdBy; 销售把"约谁来试听"的老师填这里, 可与"试听上课老师"不同)
    inviteTeacher: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 模糊期望时间 (如 "周末下午")
    expectedTime: { type: String, trim: true, default: '' },
    // 具体约哪天 (lead 录入时给的日期 hint, 不是已经排课的日期;
    // 排课由 BatchScheduleDialog 走批量流程, lead.specificDate 仅做参考)
    specificDate: { type: Date, default: null },
    // 备注
    remark: { type: String, default: '' },

    // ─── 触点快照 (冗余, 加速"待跟进"列表) ───
    // 最近一次联系时间
    lastContactedAt: { type: Date, default: null },
    // 最近一次联系人
    lastContactedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // ─── 状态机 ───
    status: {
      type: String,
      enum: ['pending', 'contacted', 'scheduled', 'tried', 'converted', 'lost'],
      default: 'pending'
    },
    // 流失原因 (status='lost' 时填)
    lostReason: { type: String, default: '' },
    // 过期时间 (阶段 2 启用自动过期, 现存字段)
    expiredAt: { type: Date, default: null },

    // ─── 转化结果 (由 tryLesson.service.convert 回填) ───
    convertedStudent: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
    convertedUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    convertedAt: { type: Date, default: null },
    // 转化备注 (销售手填"打动力/原因")
    convertedRemark: { type: String, default: '' },

    // ─── 审计 ───
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'leads' }
)

// 漏斗主查询: 机构 + 状态 + 时间
LeadSchema.index({ org: 1, status: 1, createdAt: -1 })
// 同机构内手机号索引 (2026-06 改造: 去掉 unique; 同 phone 允许多 Lead = 1 家长带多孩)
// 软唯一仍由 service.create 在 application 层检查, 用户显式 force=true 时跳过
// 注: 老库残留的 {org,phone} unique index 不会自动消失, 由
//   src/utils/startupMigrations.js#dropLeadPhoneUniqueIndex 在 server 启动时幂等 drop
LeadSchema.index({ org: 1, phone: 1 })
// "我的潜客" 视图 (按 createdBy 过滤)
LeadSchema.index({ org: 1, createdBy: 1, createdAt: -1 })
// 跟进列表 (按 lastContactedAt 倒序)
LeadSchema.index({ org: 1, lastContactedAt: -1 })

module.exports = model('Lead', LeadSchema)
