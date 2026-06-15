'use strict'

/**
 * 学校档案 (School) 种子
 *
 * 用途: 维护机构周边的实体学校, 用于:
 *   - 学生档案 school 字段下拉
 *   - 市场地推 / 放学接送高峰参考
 *
 * 幂等: 按 (org, name) 唯一索引前查, 命中跳过
 * 多租户: 给所有启用的 org 都 seed 一份 (org 之间 name 不冲突, 因唯一索引含 org)
 * 处理别名: 库里历史存在 '东风' (短名) 时, 视为 '东风幼儿园' (避免和 seed 冲突)
 */
const School = require('@models/School.model')
const Org = require('@models/Org.model')

const SCHOOLS = [
  // 小学
  { name: '一小',     type: 'elementary' },
  { name: '二小',     type: 'elementary' },
  { name: '三小',     type: 'elementary' },
  { name: '东辰小学', type: 'elementary' },
  // 幼儿园
  { name: '东风幼儿园', type: 'kindergarten' },
  { name: '幸福幼儿园', type: 'kindergarten' },
  { name: '南门一幼',   type: 'kindergarten' },
  { name: '北门二幼',   type: 'kindergarten' },
  { name: '东辰幼儿园', type: 'kindergarten' }
]

async function run() {
  const orgs = await Org.find({ isActive: true }).select('_id name').lean()
  if (orgs.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[seed.school] no active org, skip.')
    return { inserted: [], skipped: [] }
  }

  let inserted = []
  let skipped = []
  let renamed = []

  for (const org of orgs) {
    for (const s of SCHOOLS) {
      // 1) 精确名匹配: 直接跳过
      const exact = await School.findOne({ org: org._id, name: s.name }).select('_id').lean()
      if (exact) {
        skipped.push(`${org.name}/${s.name}`)
        continue
      }
      // 2) 别名兼容: 库里有 '东风' (kindergarten), seed 想要 '东风幼儿园'
      //    → 把 '东风' 改名为 '东风幼儿园', 视为同一条
      if (s.name === '东风幼儿园') {
        const alias = await School.findOne({ org: org._id, name: '东风' }).select('_id type').lean()
        if (alias && alias.type === 'kindergarten') {
          await School.updateOne({ _id: alias._id }, { $set: { name: '东风幼儿园' } })
          renamed.push(`${org.name}/东风 → 东风幼儿园`)
          continue
        }
      }
      // 3) 都没有 → 新建
      await School.create({ org: org._id, name: s.name, type: s.type, isActive: true })
      inserted.push(`${org.name}/${s.name}`)
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.school] inserted: [${inserted.join(', ') || '∅'}]`)
  // eslint-disable-next-line no-console
  console.log(`[seed.school] renamed:  [${renamed.join(', ') || '∅'}]`)
  // eslint-disable-next-line no-console
  console.log(`[seed.school] skipped:  [${skipped.length} items already exist]`)
  return { inserted, renamed, skippedCount: skipped.length }
}

module.exports = { run, SCHOOLS }
