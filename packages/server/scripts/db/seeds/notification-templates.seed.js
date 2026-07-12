'use strict'

/**
 * 通知模板种子 (2026-07-11 v0.9 立项, 2026-07-12 精简)
 *
 * 内容 (org=null) 平台级, 跨机构对所有 C 端家长可见.
 * 机构可在 /admin/notifications/templates 覆盖平台默认 (按 type+channel upsert 机构自己的).
 *
 * MVP seed 模板 (2026-07-12 砍掉 lesson_remind_1h, 改事件驱动):
 *   - lesson_prepare_reminder (inbox): 教务点「准备上课」时即时推送「上课通知」 (事件驱动)
 *   - task_due (inbox):                 今天到期的任务提醒 (员工侧)
 *
 * 占位符 (publish 时按白名单渲染, 不存在的 key 保留原文):
 *   {studentName} {courseName} {time} {endTime} {room} {teacherName}
 *   {orgName} {orderNo} {amount} {points} {days} {reason}
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