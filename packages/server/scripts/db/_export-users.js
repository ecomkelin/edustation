'use strict'

/**
 * 从 `.env` 中 MONGODB_URI 指向的数据库导出 users 集合当前数据,
 * 覆盖 initial.data.json 里的 users 数组 (不影响其他 collection)。
 *
 * 用法:
 *   node scripts/db/_export-users.js
 *
 * 工作原理:
 *   mongosh --quiet --eval "..." 输出 JSON (含 ObjectId/Date 转字符串)
 *   本脚本把 stdout 解析后只更新 users 段, 写回 initial.data.json
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const config = require('@config/index')

const DUMP_JSON_PATH = path.join(__dirname, 'seeds/initial.data.json')

function dbNameFromUri(uri) {
  if (!uri) throw new Error('[export-users] MONGODB_URI 未设置')
  const m = String(uri).match(/\/([^/?]+)(?:\?|$)/)
  return m ? m[1] : 'edustation_dev'
}

const evalScript = `const docs = db.users.find().toArray();
docs.forEach(d => {
  Object.keys(d).forEach(k => {
    if (d[k] && typeof d[k] === 'object' && d[k]._bsontype === 'ObjectID') {
      d[k] = d[k].toString();
    }
    if (d[k] && d[k]._bsontype === 'Date') {
      d[k] = d[k].toISOString();
    }
  });
});
print(JSON.stringify(docs));
`

function dump() {
  const dbName = dbNameFromUri(config.db.uri)
  // eslint-disable-next-line no-console
  console.log(`[export-users] 从 ${dbName} (${config.db.uri}) 导出 users ...`)
  const tmpScript = path.join(require('os').tmpdir(), `edustation-export-users-${Date.now()}.js`)
  fs.writeFileSync(tmpScript, evalScript, 'utf8')
  let stdout
  try {
    stdout = execSync(`mongosh ${dbName} --quiet "${tmpScript}"`, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    })
  } finally {
    try { fs.unlinkSync(tmpScript) } catch (_) {}
  }
  const firstBrace = stdout.indexOf('[')
  const lastBrace = stdout.lastIndexOf(']')
  if (firstBrace < 0 || lastBrace < 0) {
    throw new Error(`[export-users] mongosh 输出未包含 JSON 数组: ${stdout.slice(0, 200)}`)
  }
  const users = JSON.parse(stdout.slice(firstBrace, lastBrace + 1))
  if (!fs.existsSync(DUMP_JSON_PATH)) {
    throw new Error(`[export-users] 找不到 ${DUMP_JSON_PATH}, 请先跑 _export-dump.js 初始化`)
  }
  const data = JSON.parse(fs.readFileSync(DUMP_JSON_PATH, 'utf8'))
  const oldCount = (data.users || []).length
  data.users = users
  fs.writeFileSync(DUMP_JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
  // eslint-disable-next-line no-console
  console.log(`[export-users]   users: ${oldCount} → ${users.length} 条`)
  // eslint-disable-next-line no-console
  console.log(`[export-users] 写回: ${DUMP_JSON_PATH}`)
}

dump()