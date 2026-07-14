/**
 * 通知触发时机字表 (admin Notification Templates 页面专用)
 *
 * ─── 为什么需要 ────────────────────────────────────────────
 * 后端 NotificationTemplate.type 是技术字符串 (lesson_prepare_reminder 等),
 * 服务内部 publish() 按它查找模板. 管理员不该 / 不需要看见技术字符串.
 *
 * 这里把 7 条固定 type 用自然语言拆成 "触发时机" + "接收人" 两大维度:
 *   - 触发时机 (triggerText): 何时发 (纯 when, 不含 who)
 *   - 接收人 (recipientText): 谁收 (纯 who)
 *   - 类型 hint: hover 提示, 含完整业务场景
 *
 * ─── 同步约束 (2026-07-14) ─────────────────────────────────
 * 新增 / 重命名 / 删除任何 type, 必须三处同步:
 *   1. server scripts/db/seeds/notification-templates.seed.js (渲染文案落库)
 *   2. 本文件 (admin UI 展示给管理员)
 *   3. 业务代码 publish() 调用 (task.service / lessonSchedule.service 等)
 * 漏一处: 创建的模板永远不会被发送 (孤儿), 或下拉选择中找不到。
 *
 * ─── 来源 ──────────────────────────────────────────────────
 * 7 条 type 对应 data-models-notification.md §3.5 触发点:
 *   - lesson_prepare_reminder / lesson_preparing (排课准备; 家长 vs 老师两条)
 *   - task_due (cron 兜底)
 *   - task_assigned / task_rejected / task_approved / task_cancelled (审批流)
 */

export const NOTIFICATION_TRIGGERS = Object.freeze([
  // ─── 排课 ────────────────────────────────────
  {
    type: 'lesson_prepare_reminder',
    triggerText: '老师点「准备上课」后',
    recipientText: '家长',
    recipientChip: '👨‍👩‍👧',
    recipientChipType: 'success',
    hint: '排课进入 preparing 时即时推送《上课通知》(文案: "{studentName} 今天的「{courseName}」将于 {time} 在 {room} 开始, 请提前 10 分钟到校")'
  },
  {
    type: 'lesson_preparing',
    triggerText: '老师点「准备上课」后',
    recipientText: '任课老师',
    recipientChip: '👨‍🏫',
    recipientChipType: 'primary',
    hint: '排课进入 preparing 时, 同步推一份《请准备上课》给任课老师作提醒 (与家长通知并存, 不互斥)'
  },

  // ─── 任务 ─────────────────────────────────────
  {
    type: 'task_assigned',
    triggerText: '任务被分配给自己',
    recipientText: '被分配人',
    recipientChip: '🆕',
    recipientChipType: 'warning',
    hint: 'Task.create 时全员发, Task.update 时仅 diff 新加入者发; 老 assignee 已看过不会重复发'
  },
  {
    type: 'task_due',
    triggerText: '任务截止日 9:00',
    recipientText: '执行人',
    recipientChip: '⏰',
    recipientChipType: 'info',
    hint: 'taskCron 每分钟 tick, 扫 today dueAt 且 status=submitted/rejected; 收件人 bug 2026-07-13 修复后历史会补发一批'
  },
  {
    type: 'task_rejected',
    triggerText: '监督人驳回任务',
    recipientText: '执行人',
    recipientChip: '🔁',
    recipientChipType: 'danger',
    hint: 'Task.status submitted → rejected / requested_changes 时发所有 assignees'
  },
  {
    type: 'task_approved',
    triggerText: '监督人批准任务',
    recipientText: '执行人 + 创建人',
    recipientChip: '✅',
    recipientChipType: 'success',
    hint: 'Task.status submitted → approved 时发所有 assignees + creator'
  },
  {
    type: 'task_cancelled',
    triggerText: '任务被取消',
    recipientText: '执行人 + 监督人 + 创建人',
    recipientChip: '🚫',
    recipientChipType: 'danger',
    hint: 'Task.cancel() 发所有 assignees + supervisors + creator'
  }
])

/**
 * 按 type 快速查找 trigger metadata
 */
export const NOTIFICATION_TRIGGER_MAP = Object.freeze(
  NOTIFICATION_TRIGGERS.reduce((acc, t) => {
    acc[t.type] = t
    return acc
  }, {})
)
