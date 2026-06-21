'use strict'

/**
 * 给梓潼下所有 ChildLead 初始化 3 条 TrialBooking 记录:
 *   - attemptNo: 1 / 2 / 3
 *   - status: 'awaiting_schedule' (待约, 不安排时间)
 *   - subject: trialSubjects[i % len] (循环挂不同 trialSubject, 单门课的孩子 3 条全挂同一门)
 *   - createdBy / consultant / teacher: 梓潼校长 (13800000000, 6a2fb342aa8152333e4de50e)
 *   - createdAt / updatedAt: 2026-06-10T00:00:00.000Z (与 ChildLead 一致)
 *   - joinMode: 'solo' (LessonSchedule 还没建, 走 solo 模式)
 *   - scheduledAt / scheduledDuration / room: 留空 (status=awaiting_schedule 时本就该空)
 *
 * 用法: node scripts/db/_seed-trial-bookings.js
 */
const fs = require('fs')
const path = require('path')
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const Org = require('@models/Org.model')
const User = require('@models/User.model')
const ChildLead = require('@models/ChildLead.model')
const Parent = require('@models/Parent.model')

const DUMP_JSON_PATH = path.join(__dirname, 'seeds/initial.data.json')
const TARGET = new Date('2026-06-10T00:00:00.000Z')

async function run() {
  await mongoose.connect(process.env.MONGODB_URI)

  const org = await Org.findOne({ name: /梓潼/ })
  if (!org) throw new Error('找不到梓潼机构')
  const zitongId = org._id

  const principal = await User.findOne({ mobile: '13800000000' })
  if (!principal) throw new Error('找不到梓潼校长 (13800000000)')
  const principalId = principal._id

  // 拉所有梓潼 ChildLead, 带 parent._id
  const leads = await ChildLead.find({ org: zitongId }).select('_id parent trialSubjects').lean()
  // 拉对应 parent (只为了拿 phone 备用, 不入 trialBooking 文档)
  const parentsById = new Map()
  const parentIds = [...new Set(leads.map((l) => String(l.parent)).filter(Boolean))]
  if (parentIds.length) {
    const parents = await Parent.find({ _id: { $in: parentIds.map((s) => new mongoose.Types.ObjectId(s)) } })
      .select('_id')
      .lean()
    parents.forEach((p) => parentsById.set(String(p._id), p._id))
  }

  // eslint-disable-next-line no-console
  console.log(`[seed-trial-bookings] 准备为 ${leads.length} 个 ChildLead 各建 trialSubjects.length 条 TrialBooking`)

  // raw collection: 拿真实 writeErrors, 避免 Mongoose 8 cast 副作用
  const TrialBookingRaw = mongoose.connection.collection('trial_bookings')

  // 先清空梓潼下所有 TrialBooking (幂等)
  await TrialBookingRaw.deleteMany({ org: new mongoose.Types.ObjectId(zitongId) })

  const docs = []
  for (const lead of leads) {
    const subs = (lead.trialSubjects || []).filter(Boolean)
    if (subs.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(`[seed-trial-bookings] 跳过: ChildLead ${lead._id} 无 trialSubjects`)
      continue
    }
    // trialSubjects 几条就建几条 (1 孩 1 课 → 1 条; 1 孩 2 课 → 2 条)
    // 每条 subject = trialSubjects[i] 一一对应, attemptNo 从 1 开始
    for (let i = 0; i < subs.length; i++) {
      const subject = subs[i]
      docs.push({
        _id: new mongoose.Types.ObjectId(),
        org: new mongoose.Types.ObjectId(zitongId),
        preStudent: new mongoose.Types.ObjectId(lead._id),
        parent: lead.parent ? new mongoose.Types.ObjectId(lead.parent) : null,
        attemptNo: i + 1,
        joinMode: 'solo',
        lessonSchedule: null,
        room: null,
        scheduledAt: null,
        scheduledDuration: 60,
        teacher: new mongoose.Types.ObjectId(principalId),
        subject: new mongoose.Types.ObjectId(subject),
        consultant: new mongoose.Types.ObjectId(principalId),
        status: 'awaiting_schedule',
        actualStartTime: null,
        actualEndTime: null,
        result: {
          isEnrolled: null,
          negotiateTeacher: new mongoose.Types.ObjectId(principalId),
          attractionPoint: '',
          reasonNotEnrolled: '',
          considerNote: '',
          enrolledAt: null
        },
        remark: '',
        createdBy: new mongoose.Types.ObjectId(principalId),
        meta: {},
        createdAt: TARGET,
        updatedAt: TARGET
      })
    }
  }

  if (docs.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[seed-trial-bookings] 没有可写入的文档, 直接退出')
    await mongoose.disconnect()
    return { inserted: 0 }
  }

  const result = await TrialBookingRaw.insertMany(docs, { ordered: false })
  // eslint-disable-next-line no-console
  console.log(`[seed-trial-bookings] trial_bookings 写入: ${result.insertedCount}/${docs.length} 条`)
  if (result.insertedCount < docs.length) {
    // eslint-disable-next-line no-console
    console.log(
      '[seed-trial-bookings] 失败 details:',
      JSON.stringify(result.writeErrors || [], null, 2).slice(0, 600)
    )
  }

  // 同步写回 initial.data.json
  if (fs.existsSync(DUMP_JSON_PATH)) {
    const dump = JSON.parse(fs.readFileSync(DUMP_JSON_PATH, 'utf8'))
    dump.trial_bookings = docs.map((d) => serializeDoc(d))
    fs.writeFileSync(DUMP_JSON_PATH, JSON.stringify(dump, null, 2), 'utf8')
    // eslint-disable-next-line no-console
    console.log(`[seed-trial-bookings] initial.data.json 写入 trial_bookings: ${docs.length} 条`)
  }

  await mongoose.disconnect()
  // eslint-disable-next-line no-console
  console.log('[seed-trial-bookings] done.')
  return { inserted: result.insertedCount, total: docs.length }
}

function serializeDoc(doc) {
  const o = { ...doc }
  Object.keys(o).forEach((k) => {
    const v = o[k]
    if (v && v._bsontype === 'ObjectID') o[k] = v.toString()
    if (v instanceof Date) o[k] = v.toISOString()
    if (Array.isArray(v)) {
      o[k] = v.map((x) => {
        if (x && x._bsontype === 'ObjectID') return x.toString()
        if (x instanceof Date) return x.toISOString()
        return x
      })
    }
  })
  if (o.result && typeof o.result === 'object') {
    Object.keys(o.result).forEach((k) => {
      const v = o.result[k]
      if (v && v._bsontype === 'ObjectID') o.result[k] = v.toString()
      if (v instanceof Date) o.result[k] = v.toISOString()
    })
  }
  return o
}

if (require.main === module) {
  run()
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(r)
      process.exit(0)
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
}

module.exports = { run }