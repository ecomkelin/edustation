'use strict'

/**
 * 数据迁移: trialSubject(s) / TrialBooking.subject 从 Subject 改为 Category (model='Subject').
 * 配套 ChildLead / TrialBooking model 改动 (2026-06-18).
 *
 * 背景:
 *   录入侧 trialSubject(s) 引用 Subject, 是"具体课程产品"维度; 业务上销售录潜客时
 *   只标记"孩子想试哪类", 真正该上哪门具体课由老师判定. 所以从 Subject 改为 Category.
 *   老 ObjectId 在新 schema 下指向 Category 模型不存在, populate 拿不到 name.
 *
 *   业务上老 Subject 引用**无业务价值** (Subject 命名跟 Category 不一定一致), 不做
 *   name→name 映射, 直接清空. 新录入走 Category, 用户自行在管理后台维护 Category 字典.
 *
 * 步骤:
 *   1. child_leads.trialSubject = null
 *   2. child_leads.trialSubjects = []
 *   3. trial_bookings.subject = null
 *
 * 幂等: 已清的字段 modifiedCount=0, 重复跑 no-op.
 *
 * 运行: node packages/server/scripts/migrate-trial-subject-to-category.js
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')

async function main() {
  await connect()
  const db = mongoose.connection.db

  const cl1 = await db.collection('child_leads').updateMany(
    { trialSubject: { $exists: true, $ne: null } },
    [{ $set: { trialSubject: null } }]
  )
  console.log(`child_leads.trialSubject: matched=${cl1.matchedCount}, modified=${cl1.modifiedCount}`)

  const cl2 = await db.collection('child_leads').updateMany(
    { trialSubjects: { $exists: true, $type: 'array' } },
    [{ $set: { trialSubjects: [] } }]
  )
  console.log(`child_leads.trialSubjects: matched=${cl2.matchedCount}, modified=${cl2.modifiedCount}`)

  const tb = await db.collection('trial_bookings').updateMany(
    { subject: { $exists: true, $ne: null } },
    [{ $set: { subject: null } }]
  )
  console.log(`trial_bookings.subject: matched=${tb.matchedCount}, modified=${tb.modifiedCount}`)

  console.log('done.')
  await disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error('migration failed:', e)
  process.exit(1)
})