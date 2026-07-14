'use strict'

/**
 * 通知模板种子 (2026-07-11 v0.9 立项, 2026-07-12 精简, 2026-07-13 加 5 条员工侧)
 *
 * 内容 (org=null) 平台级, 跨机构对所有 C 端家长可见.
 * 机构可在 /admin/notifications/templates 覆盖平台默认 (按 type+channel upsert 机构自己的).
 *
 * 模板清单 (7 条固定 type, 与 admin/constants/notificationTriggers.js 保持一字对应):
 *   - lesson_prepare_reminder (inbox): 教务点「准备上课」时即时推送「上课通知」 (家长)
 *   - task_due (inbox):                 今天到期的任务提醒 (员工)
 *   - lesson_preparing (inbox):         排课进入 preparing, 通知任课老师 (员工, 2026-07-13 新增)
 *   - task_assigned (inbox):            任务被分配 (员工, 2026-07-13 新增)
 *   - task_rejected (inbox):            任务被打回 (员工, 2026-07-13 新增)
 *   - task_approved (inbox):            任务审批通过 (员工, 2026-07-13 新增)
 *   - task_cancelled (inbox):           任务被取消 (员工, 2026-07-13 新增)
 *
 * 占位符 (publish 时按白名单渲染, 不存在的 key 保留原文):
 *   {studentName} {courseName} {time} {endTime} {room} {teacherName}
 *   {orgName} {orderNo} {amount} {points} {days} {reason}
 *   {taskTitle} {actorName} {comment} {score} {dueAt} {priority} (2026-07-13 新增)
 *   {studentNames} (lesson_preparing 多人学生拼接)
 *
 * 同步约束 (2026-07-14 加):
 *   新增 / 重命名 / 删除任何 type 必须三处同步, 否则孤儿模板或下拉选项错位:
 *     1. 本文件 (TEMPLATES 数组, 落库文案)
 *     2. packages/admin/src/constants/notificationTriggers.js (UI 展示)
 *     3. 业务 publish() 调用 (task.service / lessonSchedule.service 等)
 *   详见 data-models-notification.md §3.5 "新增 type 流程"。
 *
 * 幂等: NotificationTemplate 按 (org=null, type, channel) upsert
 * 单跑也可, 不依赖 initial.seed 的 dropDatabase 流程.
 */

const NotificationTemplate = require('@models/NotificationTemplate.model')

const TEMPLATES = [
  {
    type: 'lesson_prepare_reminder',
    channel: 'inbox',
    // 2026-07-12: 标题改成「上课通知」(用户原话"叫上课通知"), 家长一眼能识别;
    // 详情放在 body 里.
    title: '上课通知',
    body: '{studentName} 今天的「{courseName}」将于 {time} 在 {room} 开始, 请提前 10 分钟到校。',
    meta: { hint: '教务点「准备上课」时即时推送 (2026-07-12 业务事件驱动, 取代老的 lesson_remind_1h cron); 占位符 {studentName} {courseName} {time} {room}' }
  },
  {
    type: 'task_due',
    channel: 'inbox',
    title: '任务「{reason}」今天到期',
    body: '请在 {time} 前完成, 避免影响后续排期。',
    meta: { hint: '任务今天到期提醒 (员工侧); {reason}=任务标题, {time}=到期时间' }
  },
  // ─── 2026-07-13 新增 5 条 (员工侧触发点) ─────────────
  {
    type: 'lesson_preparing',
    channel: 'inbox',
    title: '请准备上课: {courseName}',
    body: '您有一节「{courseName}」将于 {time} 在 {room} 开始, 学生: {studentNames}。',
    meta: { hint: 'LessonSchedule.scheduled→preparing 时即时推给任课老师 (员工); 占位符 {courseName} {time} {room} {studentNames}' }
  },
  {
    type: 'task_assigned',
    channel: 'inbox',
    title: '新任务「{taskTitle}」',
    body: '{actorName} 将任务分配给您 (优先级: {priority}), 截止 {dueAt}, 请尽快查看。',
    meta: { hint: 'Task.assignees 新增执行人时即时推送 (员工); 占位符 {taskTitle} {actorName} {priority} {dueAt}; create 时全员发, update 时仅新加入者发' }
  },
  {
    type: 'task_rejected',
    channel: 'inbox',
    title: '任务「{taskTitle}」被打回',
    body: '{actorName} 审批未通过, 原因: {comment}, 请修改后重新提交。',
    meta: { hint: 'Task.status submitted→rejected 时推给所有 assignees (员工); 占位符 {taskTitle} {actorName} {comment}; 评分 {score} 可选' }
  },
  {
    type: 'task_approved',
    channel: 'inbox',
    title: '任务「{taskTitle}」已通过',
    body: '{actorName} 已审批通过, 任务完成。',
    meta: { hint: 'Task.status submitted→approved 时推给所有 assignees + creator (员工); 占位符 {taskTitle} {actorName} {comment} {score}' }
  },
  {
    type: 'task_cancelled',
    channel: 'inbox',
    title: '任务「{taskTitle}」已取消',
    body: '{actorName} 取消了任务, 原因: {comment}',
    meta: { hint: 'Task.status →cancelled 时推给所有 assignees + supervisors + creator (员工); 占位符 {taskTitle} {actorName} {comment}' }
  }
]

async function run() {
  const ops = TEMPLATES.map((t) => ({
    updateOne: {
      filter: { org: null, type: t.type, channel: t.channel },
      update: {
        $set: {
          org: null,
          type: t.type,
          channel: t.channel,
          title: t.title,
          body: t.body,
          isActive: true,
          meta: t.meta || {}
        }
      },
      upsert: true
    }
  }))
  const r = await NotificationTemplate.bulkWrite(ops)
  // eslint-disable-next-line no-console
  console.log(`[seed][notification-templates] upserted=${r.upsertedCount} modified=${r.modifiedCount}`)
  return { upserted: r.upsertedCount, modified: r.modifiedCount }
}

module.exports = { run, TEMPLATES }