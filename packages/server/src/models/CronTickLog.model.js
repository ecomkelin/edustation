'use strict'

const { Schema, model } = require('mongoose')

/**
 * 定时任务 tick 流水 (CronTickLog, 2026-07-13 立项, MM=41 续)
 *
 * 用途: 排查"昨天 14:00 任务提醒为什么没发" "上周 archiveCron 是不是漏跑了" 这类问题。
 * 现有 3 套日志各自有局限:
 *   - cronRegistry.totalTicks 是累计计数, 不知道历史
 *   - cronLogger 写 console (= /tmp/server.log), 跨副本 / 跨进程查不友好
 *   - audit_logs 是业务写操作流水, 不含 cron
 *
 * 设计取舍:
 *   - 单一 collection, 每次 cron tick (自动 / 手动) 写 1 条
 *   - 自动跳过的 (leaderElect=true 但没抢到锁) 也记 1 条 (source='skip'), 方便统计"被抢了多少次"
 *   - 失败的也记 (ok=false + error stack)
 *   - 不写 audit (ops 事件, 不是业务)
 *
 * 字段语义:
 *   - name:        cron 名 (e.g. 'taskCron' / 'notificationCron' / 'archiveCron')
 *   - source:      'auto' | 'manual' | 'skip'
 *      auto   = setInterval 触发, 正常完成或失败
 *      manual = R-4102 手动 trigger (triggeredBy 必填)
 *      skip   = leaderElect=true 没抢到锁, 根本没跑业务逻辑
 *   - startedAt / finishedAt / durationMs
 *   - ok:          true=成功 / false=失败
 *   - error:       失败时的 message (不存 stack, 太占空间)
 *   - stats:       业务 stats (e.g. {expired:3, generated:1, notified:5, errors:0}); 跳过时为 null
 *   - triggeredBy: 手动 trigger 的调用人 (e.g. 'platformAdmin:6a2fb342...'); 自动时为 null
 *   - pid:         写入时 process.pid, 多副本场景用
 *
 * 留存期: 30 天 (TTL 索引 retentionUntil expireAfterSeconds:0)
 *   - 1min 周期 × 6 cron × 30d ≈ 26 万条, mongo 体积可接受
 *   - 不设永久: cron 是高频事件, 1 个月前的查不到也能从 audit_logs 推断
 *
 * 权限: 不引入 perm 码, 仅平台超管可读 (与 audit_logs 一致)。
 *   决策 2026-07-13: 与 R-4101/R-4102 同一组 requirePlatformAdmin。
 */

const CronTickLogSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    source: {
      type: String,
      required: true,
      enum: ['auto', 'manual', 'skip'],
      index: true
    },

    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },

    ok: { type: Boolean, required: true, index: true },
    error: { type: String, default: null },

    // 业务 stats (Mixed; 各 cron 自报; auto 失败时可能为 null)
    stats: { type: Schema.Types.Mixed, default: null },

    // 手动 trigger 的调用人
    triggeredBy: { type: String, default: null },

    // 写库时 process.pid
    pid: { type: Number, required: true, index: true },

    // TTL 字段: createdAt + 30d, 到期 mongo 自动删
    retentionUntil: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 3600 * 1000)
    }
  },
  { timestamps: true, collection: 'cron_tick_logs' }
)

// 高频查询索引
//   - R-4103 默认按时间倒序 + 可选 name filter
CronTickLogSchema.index({ name: 1, startedAt: -1 })
//   - 失败/错误筛选 (排障入口)
CronTickLogSchema.index({ ok: 1, startedAt: -1 })
//   - 手动 vs 自动分布
CronTickLogSchema.index({ source: 1, startedAt: -1 })

// TTL: 30 天后自动删
CronTickLogSchema.index({ retentionUntil: 1 }, { expireAfterSeconds: 0 })

module.exports = model('CronTickLog', CronTickLogSchema)