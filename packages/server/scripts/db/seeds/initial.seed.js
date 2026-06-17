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
 * 当前出厂数据 (12 collection)：
 *   - regions: 10 (四川/绵阳/梓潼/江油/成都/北京/朝阳/山东/济宁/嘉祥)
 *   - categories: 23 (Org × 2 + Subject × 5 + Student × 2 + LeadTag × 8 + Channel × 6)
 *   - subjects: 5 (Python初级/C++初级/Scratch初级/Spike初级/大颗粒智能积木)
 *   - users: 3 (李科霖/高艺齐 平台超管 + 梓潼校长)
 *   - orgs: 2 (梓潼/绵阳人工智网)
 *   - user_org_rels: 1 (梓潼校长挂管理员)
 *   - positions: 7 (梓潼 5 系统岗位 + 绵阳 2)
 *   - schools: 27 (梓潼 9 + 绵阳 9 + 童画大王 9)
 *   - rooms: 5 (梓潼 5 间教室)
 *   - course_products: 5 (大颗粒/基础/C++私教/工程师/0基础 课包)
 *   - user_consents: 4 (登录时同意的协议记录)
 *   - refresh_tokens: 1 (登录态)
 *
 * 执行策略：dropDatabase() → 按依赖顺序 insertMany。
 * 依赖顺序: regions/categories → subjects → users → orgs → user_org_rels → positions → schools/rooms/course_products → user_consents/refresh_tokens
 * 重复执行结果一致（dropDatabase 后整体灌入，_id 由 JSON 锁定不变）。
 */

const fs = require('fs')
const path = require('path')

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
  user_consents: UserConsent,
  refresh_tokens: RefreshToken
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

async function run() {
  // eslint-disable-next-line no-console
  console.log('[initial.seed] dropDatabase() ...')
  const mongoose = require('mongoose')
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
    const result = await Model.insertMany(docs, { ordered: false })
    summary[name] = result.length
    // eslint-disable-next-line no-console
    console.log(`[initial.seed]   ✓ ${name}: ${result.length} 条`)
  }

  return summary
}

module.exports = { run }