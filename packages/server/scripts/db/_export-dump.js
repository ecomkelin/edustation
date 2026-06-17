'use strict'

/**
 * 从 `.env` 中 MONGODB_URI 指向的数据库导出当前数据, 写到
 *   packages/server/scripts/db/seeds/initial.data.json
 *
 * 用法:
 *   node scripts/db/_export-dump.js
 *
 * 工作原理:
 *   mongosh --quiet --eval "..." 输出 JSON (含 ObjectId/Date 转字符串)
 *   本脚本执行 mongosh, 把 stdout 解析后写到 initial.data.json
 *
 * 注意: collection 名必须和 seed 一致; 若新增/删 collection, 同步更新下方的 COLLECTIONS 数组。
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const config = require('@config/index')

const OUT_PATH = path.join(__dirname, 'seeds/initial.data.json')

// 必须与 initial.seed.js 中的 LOAD_ORDER 保持一致 (按依赖顺序)
const COLLECTIONS = [
  'regions',
  'categories',
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

function dbNameFromUri(uri) {
  if (!uri) throw new Error('[export-dump] MONGODB_URI 未设置')
  const m = String(uri).match(/\/([^/?]+)(?:\?|$)/)
  return m ? m[1] : 'edustation_dev'
}

const evalScript = `const colls = ${JSON.stringify(COLLECTIONS)};
const out = {};
colls.forEach(c => {
  const docs = db.getCollection(c).find().toArray();
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
  out[c] = docs;
});
print(JSON.stringify(out));
`

function dump() {
  const dbName = dbNameFromUri(config.db.uri)
  // eslint-disable-next-line no-console
  console.log(`[export-dump] 从 ${dbName} (${config.db.uri}) 导出 ${COLLECTIONS.length} 个 collection ...`)
  // 把脚本写到临时文件,避免 shell 引号 / 转义问题
  const tmpScript = path.join(require('os').tmpdir(), `edustation-export-${Date.now()}.js`)
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
  // mongosh 会包裹一层 [eval] 输出, 取第一行 JSON
  const firstBrace = stdout.indexOf('{')
  const lastBrace = stdout.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0) {
    throw new Error(`[export-dump] mongosh 输出未包含 JSON: ${stdout.slice(0, 200)}`)
  }
  const jsonStr = stdout.slice(firstBrace, lastBrace + 1)
  const data = JSON.parse(jsonStr)
  fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 2), 'utf8')

  // 摘要
  for (const c of COLLECTIONS) {
    // eslint-disable-next-line no-console
    console.log(`[export-dump]   ${c}: ${(data[c] || []).length} 条`)
  }
  // eslint-disable-next-line no-console
  console.log(`[export-dump] 写入: ${OUT_PATH}`)
}

dump()