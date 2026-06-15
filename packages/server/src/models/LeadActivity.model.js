'use strict'

const { Schema, model } = require('mongoose')

/**
 * 触点日志 (LeadActivity) - 2026-06 重构
 *
 * 业务上记录"销售/教务与潜客孩子之间的每一次接触":
 *   - 电话 (call)
 *   - 微信 (wechat)
 *   - 面访 (visit)
 *   - 短信 (sms)
 *   - 备注 (note) — 其他接触或内部备注
 *
 * 关键设计 (2026-06 调整):
 *   - 引用 ChildLead (孩子维度) 而非旧 Lead
 *   - ChildLead 1:N LeadActivity (一个孩子可有多次触点)
 *   - ChildLead.lastContactedAt/By 冗余快照, 每次创建 LeadActivity 时同步更新
 *   - Parent (家长维度) 的 lastContactedAt/By 由 childLead.service.createActivity
 *     在 childLead 触点变化时同步刷 Parent 字段
 *   - 物理删除 ChildLead 时由 childLead.service 互锁清理 LeadActivity
 */
const LeadActivitySchema = new Schema(
  {
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 关联 ChildLead (2026-06: 不再引 Lead, 字段名保留 lead 兼容老代码)
    lead: { type: Schema.Types.ObjectId, ref: 'ChildLead', required: true, index: true },
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

// 触点时间线 (按 childLead + 时间倒序)
LeadActivitySchema.index({ lead: 1, at: -1 })
// 机构按触点类型聚合 (看板/统计: 多少个电话, 多少个微信)
LeadActivitySchema.index({ org: 1, type: 1, at: -1 })

module.exports = model('LeadActivity', LeadActivitySchema)
