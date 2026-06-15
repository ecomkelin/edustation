'use strict'

/**
 * 一次性数据迁移: 招生渠道 (Channel 字典) + 历史数据 source 字段 String → ObjectId
 *
 * 背景 (2026-06-15):
 *   - Parent.source / ChildLead.source 升级为 Category(model='Channel') 的 ObjectId
 *   - 新建家长时未指定 source, 后端兜底 = '地推' (_id)
 *   - 历史数据里 source 是 String ('walkin' 或旧版自定义), 需统一回填到默认渠道
 *
 * 用法: node packages/server/scripts/migrate-add-channels.js
 * 幂等:
 *   - Channel 字典: $addToSet 风格, 跑多次不重复 (channel.seed.js 同款)
 *   - Parent/ChildLead source 回填: 只对 source 是 String 或 null 的文档写; 已为 ObjectId 的不动
 *
 * 顺序:
 *   1. 跑 channel.seed (6 个 channel 字典 upsert)
 *   2. 拿默认渠道 _id (地推)
 *   3. updateMany 把所有 Parent/ChildLead 的 source 设为默认渠道的 _id (兼容 String + null 两种状态)
 *   4. 同时: 给 ChildLead.source 单独跑 (有些可能没继承 parent.source)
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const Category = require('@models/Category.model')
const Parent = require('@models/Parent.model')
const ChildLead = require('@models/ChildLead.model')
const channelSeed = require('./db/seeds/channel.seed')

const MONGOOSE = require('mongoose')

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-channels] connected')

  // ─── 1. 写 Channel 字典 (6 条) ───
  await channelSeed.run()

  // ─── 2. 拿默认渠道 ───
  const defaultChannel = await Category.findOne({ model: 'Channel', name: '地推' })
    .select('_id name')
    .lean()
  if (!defaultChannel) {
    throw new Error('渠道字典未找到 "地推", 请检查 channel.seed 是否成功')
  }
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-channels] default channel: ${defaultChannel.name} (${defaultChannel._id})`)

  // ─── 3. Parent.source 回填 ───
  //   - 类型为 String (历史 'walkin' 等): 改 ObjectId
  //   - 类型为 null / 不存在: 也填默认 (新模型 default=null, 但历史数据应该是 String)
  //   - 类型已是 ObjectId: 不动 (前向兼容)
  // Mongoose $set 时: 用 $cond 区分, 但 $type 操作更稳
  const parentQuery = {
    $or: [
      { source: { $type: 'string' } },
      { source: null },
      { source: { $exists: false } }
    ]
  }
  const parentResult = await Parent.updateMany(
    parentQuery,
    { $set: { source: defaultChannel._id } }
  )
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-channels] parents updated: ${parentResult.modifiedCount} / matched: ${parentResult.matchedCount}`)

  // ─── 4. ChildLead.source 回填 (同上) ───
  const childQuery = {
    $or: [
      { source: { $type: 'string' } },
      { source: null },
      { source: { $exists: false } }
    ]
  }
  const childResult = await ChildLead.updateMany(
    childQuery,
    { $set: { source: defaultChannel._id } }
  )
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-channels] childLeads updated: ${childResult.modifiedCount} / matched: ${childResult.matchedCount}`)

  // ─── 5. 校核: 看看还有没有 String 类型的 source (漏网之鱼) ───
  const leftoverParentStrings = await Parent.countDocuments({ source: { $type: 'string' } })
  const leftoverChildStrings = await ChildLead.countDocuments({ source: { $type: 'string' } })
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-channels] leftover string source: parent=${leftoverParentStrings}, childLead=${leftoverChildStrings}`)

  // 顺手清缓存, 让 parent.service#getDefaultChannelId 重新读 DB (避免第一次缓存了 null 时)
  const parentService = require('@modules/parent/parent.service')
  if (typeof parentService._resetDefaultChannelCache === 'function') {
    parentService._resetDefaultChannelCache()
  }

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-channels] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-add-channels] failed:', e)
  process.exit(1)
})
