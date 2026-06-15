'use strict'

/**
 * 种子编排入口。
 *
 * 由 `pnpm db:seeds` 调用（见 scripts/db/index.js）。当前只跑一个综合种子
 * `initial.seed.js`，把机构 / 用户 / 岗位 / 用户-机构关系 / 学员 / 类别 /
 * 地区 / 学科 / 教室 / 课程产品 一并写入并清空冲突数据。
 *
 * 历史示范种子（org / user / subject / room / courseProduct / ...）保留在
 * scripts/db/seeds/*.seed.js，方便回滚到 demo 数据；如需切换可在此处改 import。
 */

const initialSeed = require('./seeds/initial.seed')
const leadTagSeed = require('./seeds/leadTag.seed')
const channelSeed = require('./seeds/channel.seed')
const schoolSeed = require('./seeds/school.seed')

async function initSeeds() {
  // eslint-disable-next-line no-console
  console.log('[seed] initialising via seeds/initial.seed.js ...')
  const summary = await initialSeed.run()
  // eslint-disable-next-line no-console
  console.log('[seed] summary:', summary)

  // 招生家长标签 (2026-06): 独立幂等 seed, 不依赖 initial 的 dropDatabase 流程
  // 单独跑也不会破坏已有数据, 已存在则跳过并修正 sort/isActive
  await leadTagSeed.run()

  // 招生渠道 (2026-06-15): 同 LeadTag, 独立幂等 seed; 默认渠道 = 地推
  await channelSeed.run()

  // 学校档案: 给所有启用 org 写入周边学校名单, 幂等
  await schoolSeed.run()
}

module.exports = { initSeeds }
