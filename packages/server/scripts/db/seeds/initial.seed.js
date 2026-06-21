'use strict'

/**
 * 初始化种子（initial.seed.js） — DB dump 回灌版
 *
 * 由 `pnpm db:seeds` 触发（见 scripts/db/init-seeds.js）。
 *
 * 数据来源：本仓库维护的 `initial.data.json`，由 `scripts/db/_export-dump.js`
 * 从 `.env` 中 `MONGODB_URI` 指向的目标库导出（默认 edustation_dev）后落盘。
 * 每次导出/导入都保持固定 _id、createdAt、updatedAt，幂等。
 *
 * 当前出厂数据 (14 collection)：
 *   - regions: 10 (四川/绵阳/梓潼/江油/成都/北京/朝阳/山东/济宁/嘉祥)
 *   - categories: 23 (梓潼 per-org 字典: Subject×7 + Student×2 + LeadTag×8 + Channel×6)
 *   - subjects: 5 (Python初级/C++初级/Scratch初级/Spike初级/大颗粒智能积木)
 *   - users: 8 (李科霖/高艺齐 平台超管 + 梓潼校长 + 5 个新老师)
 *   - orgs: 2 (梓潼/绵阳人工智网)
 *   - user_org_rels: 6 (梓潼校长管理员 + 5 个新老师)
 *   - positions: 7 (梓潼 5 系统岗位 + 绵阳 2)
 *   - schools: 27 (梓潼 9 + 绵阳 9 + 童画大王 9)
 *   - rooms: 5 (梓潼 5 间教室)
 *   - course_products: 5 (大颗粒/基础/C++私教/工程师/0基础 课包)
 *   - parents: 41 (2026-06-20 录入的梓潼潜客家长, 含 1 家长多孩合并)
 *   - child_leads: 47 (同 name+phone 折叠后的孩子潜客, 含 1 孩多课合并)
 *   - user_consents: 4 (登录时同意的协议记录)
 *   - refresh_tokens: 1 (登录态)
 *
 * 执行策略：dropDatabase() → 按依赖顺序 insertMany。
 * 依赖顺序: regions/categories → subjects → users → orgs → user_org_rels → positions → schools/rooms/course_products → parents/child_leads → user_consents/refresh_tokens
 * 重复执行结果一致（dropDatabase 后整体灌入，_id 由 JSON 锁定不变）。
 */

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const Region = require('@models/Region.model')
const Category = require('@models/Category.model')
const Subject = require('@models/Subject.model')
const User = require('@models/User.model')
const Org = require('@models/Org.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Position = require('@models/Position.model')
const School = require('@models/School.model')
const Room = require('@models/Room.model')
const CourseProduct = require('@models/CourseProduct.model')
const UserConsent = require('@models/UserConsent.model')
const RefreshToken = require('@models/RefreshToken.model')
const Parent = require('@models/Parent.model')
const ChildLead = require('@models/ChildLead.model')

// ─────────────────────────────────────────────────────────────
// 加载初始数据 dump
// ─────────────────────────────────────────────────────────────

const DUMP_PATH = path.join(__dirname, 'initial.data.json')

function loadDump() {
  if (!fs.existsSync(DUMP_PATH)) {
    throw new Error(
      `[initial.seed] 找不到数据文件: ${DUMP_PATH}\n` +
        '请先执行 `node scripts/db/_export-dump.js` 从目标库导出最新数据。'
    )
  }
  const raw = fs.readFileSync(DUMP_PATH, 'utf8')
  return JSON.parse(raw)
}

// 依赖顺序:
//   - regions/categories: 字典表, 无外键
//   - subjects: 引用 categories (Subject model)
//   - users: 主键表, 但 user_consents/refresh_tokens/user_org_rels 引用它
//   - orgs: 引用 users (principal); user_org_rels 引用它
//   - user_org_rels: 引用 users + orgs + positions
//   - positions: 引用 orgs; 但 user_org_rels 引用它, 故 user_org_rels 在 positions 之前
//   - schools/rooms/course_products: 引用 orgs (+ categories for courseProducts)
//   - parents: 引用 orgs + users (createdBy); child_leads 引用 parents
//   - child_leads: 引用 parents + categories (Subject字典 trialSubjects) + schools + users (createdBy)
//   - trial_bookings: 引用 child_leads + parents + categories (subject) + users (teacher/consultant/createdBy)
const LOAD_ORDER = [
  'regions',
  'categories',
  'subjects',
  'users',
  'orgs',
  'positions',
  'user_org_rels',
  'schools',
  'rooms',
  'course_products',
  'parents',
  'child_leads',
  'trial_bookings',
  'user_consents',
  'refresh_tokens'
]

const COLLECTION_TO_MODEL = {
  regions: Region,
  categories: Category,
  subjects: Subject,
  users: User,
  orgs: Org,
  positions: Position,
  user_org_rels: UserOrgRel,
  schools: School,
  rooms: Room,
  course_products: CourseProduct,
  parents: Parent,
  child_leads: ChildLead,
  trial_bookings: require('@models/TrialBooking.model'),
  user_consents: UserConsent,
  refresh_tokens: RefreshToken
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

async function run() {
  // eslint-disable-next-line no-console
  console.log('[initial.seed] dropDatabase() ...')
  await mongoose.connection.dropDatabase()

  const data = loadDump()

  const summary = {}
  for (const name of LOAD_ORDER) {
    const docs = data[name] || []
    if (!docs.length) {
      summary[name] = 0
      continue
    }
    const Model = COLLECTION_TO_MODEL[name]
    if (!Model) {
      // eslint-disable-next-line no-console
      console.warn(`[initial.seed] 没有对应 Model, 跳过: ${name} (${docs.length} 条)`)
      summary[name] = 0
      continue
    }
    // 预分配 _id (Mongoose 8 + mongo 5/6 驱动的 insertMany 行为: 不预分配时部分 doc
    // 数组字段 (如 child_leads.trialSubjects) 会被 schema cast 静默 strip;
    // 同时 ordered:false + unique 冲突时 Mongoose 的 Model.insertMany 会吞错误不报数)
    docs.forEach((d) => {
      if (!d._id) d._id = new mongoose.Types.ObjectId()
      castOidsDeep(d) // 把 _id / 所有 ref 字段从 string 转回 ObjectId
    })
    // 用 raw collection 直写, 避免 Mongoose schema cast 副作用; 拿到真实 writeErrors
    const rawResult = await mongoose.connection.collection(name).insertMany(docs, { ordered: false })
    summary[name] = rawResult.insertedCount
    // eslint-disable-next-line no-console
    if (rawResult.insertedCount < docs.length) {
      const errs = rawResult.writeErrors || []
      // eslint-disable-next-line no-console
      console.warn(
        `[initial.seed]   ⚠ ${name}: ${rawResult.insertedCount}/${docs.length} 条; ${errs.length} errors (前 3 条: ${
          errs.slice(0, 3).map(e => `idx=${e.index}|${e.errmsg?.slice(0, 60)}`).join('; ')
        })`
      )
    } else {
      // eslint-disable-next-line no-console
      console.log(`[initial.seed]   ✓ ${name}: ${rawResult.insertedCount} 条`)
    }
  }

  return summary
}

module.exports = { run }

// ─────────────────────────────────────────────────────────────
// 工具: 把 doc 里的 ObjectId 字符串递归转回 ObjectId
// ─────────────────────────────────────────────────────────────
// 背景: _export-dump.js 用 mongosh 导出时, 所有 ObjectId 都被 .toString() 成 24-hex
// 字符串 (含 _id 和所有 ref 字段). 然后 initial.seed.js 走 raw collection.insertMany,
// 驱动看到 24-hex 字符串时**不**自动转 ObjectId, 直接落库, 导致 _id 在 DB 里类型是 string.
// 后果: User.findById(...).lean() 返回 null → /auth/me 401.
//
// 修复: insertMany 前递归扫一遍 doc, 把 24-hex string 字段转 ObjectId.
//   - 24 位 hex 是安全判定 (含 _id + 所有 ref 字段都是这格式)
//   - 非 hex 的字符串 (realName, mobile, passwordHash, schoolName 等) 不动
//   - 数组 / 嵌套对象递归处理
//   - 不在 $or/$and/$in 等查询操作符里出现 (这是 insertMany 不是 find)
//   - Date / Number / null / undefined 都不动
function isOidStr(s) {
  return typeof s === 'string' && /^[0-9a-f]{24}$/i.test(s)
}

function castOidsDeep(value) {
  if (value == null) return
  if (Array.isArray(value)) {
    value.forEach((v) => castOidsDeep(v))
    return
  }
  if (typeof value !== 'object') return
  // 跳过 Date / Buffer / 其它非普通对象
  if (value instanceof Date) return
  for (const k of Object.keys(value)) {
    const v = value[k]
    if (isOidStr(v)) {
      value[k] = new mongoose.Types.ObjectId(v)
    } else if (Array.isArray(v)) {
      v.forEach((x) => castOidsDeep(x))
    } else if (v && typeof v === 'object' && !(v instanceof Date)) {
      castOidsDeep(v)
    }
  }
}