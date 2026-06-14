'use strict'

const { Schema, model } = require('mongoose')

/**
 * 潜客触点日志 (LeadActivity)
 *
 * 业务上记录"销售/教务与潜客之间的每一次接触":
 *   - 电话 (call)
 *   - 微信 (wechat)
 *   - 面访 (visit)
 *   - 短信 (sms)
 *   - 备注 (note) — 其他接触或内部备注
 *
 * 关键设计:
 *   - Lead 1:N LeadActivity (一个 lead 可有多个触点, 漏斗"平均联系次数"等指标靠这个算)
 *   - Lead.lastContactedAt/By 是 Lead 上的冗余快照, 每次创建 LeadActivity 时同步更新
 *   - 物理删除 Lead 时由 lead.service 互锁清理 (见 plans/staged-roaming-honey.md §4.8)
 */
const LeadActivitySchema = new Schema(
  {
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 关联潜客
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    // 触点类型
    type: {
      type: String,
      enum: ['call', 'wechat', 'visit', 'sms', 'note'],
      required: true
    },
    // 谁联系的
    byUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 触点发生时间 (允许回填历史, 业务上"今天打了电话"用 now())
    at: { type: Date, default: Date.now },
    // 内容描述 (如 "家长咨询了价格", "承诺周六 10 点来")
    remark: { type: String, default: '' },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'lead_activities' }
)

// 触点时间线 (按 lead + 时间倒序)
LeadActivitySchema.index({ lead: 1, at: -1 })
// 机构按触点类型聚合 (看板/统计: 多少个电话, 多少个微信)
LeadActivitySchema.index({ org: 1, type: 1, at: -1 })

module.exports = model('LeadActivity', LeadActivitySchema)
