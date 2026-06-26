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
const petCatalogSeed = require('./seeds/pet-catalog.seed')
// 财务模块 (2026-06-25 立项): 8 条 FinanceReason 字典 + 4 本账本 + 3 条演示流水
const financeSeed = require('./seeds/finance.seed')

async function initSeeds() {
  // 1. 主体种子: dropDatabase + 写入 22+ 个集合（机构 / 用户 / 岗位 / 学员 / 课包 / 排课 / 考勤 / 作品 / 积分 / 宠物 / 招生链路 / 推广 / 文件 等）
  // eslint-disable-next-line no-console
  console.log('[seed] initialising via seeds/initial.seed.js ...')
  const summary = await initialSeed.run()
  // eslint-disable-next-line no-console
  console.log('[seed] summary:', summary)

  // 2. 招生家长标签 (2026-06): 独立幂等 seed, 不依赖 initial 的 dropDatabase 流程
  //    单独跑也不会破坏已有数据, 已存在则跳过并修正 sort/isActive
  //    initial.seed.js 已经把 LeadTag 一并写入, 这里跑只是"二次校验" sort/isActive
  await leadTagSeed.run()

  // 3. 招生渠道 (2026-06-15): 同 LeadTag, 独立幂等 seed; 默认渠道 = 地推
  await channelSeed.run()

  // 4. 学校档案: 给所有启用 org 写入周边学校名单, 幂等
  //    initial.seed.js 已经把梓潼人工智网下的学校档案写入, 这里跑会补全其他 org 的学校
  await schoolSeed.run()

  // 5. 宠物图鉴 (2026-06-22 pet-shop): species/items/consumables 内联 SVG 种子
  //    平台级共享（无 org 维度）；幂等 upsert by key
  //    不依赖 initial 的 dropDatabase，单跑也行
  await petCatalogSeed.run()

  // 6. 财务 (2026-06-25): 8 条 FinanceReason 字典 + 4 本账本 + 3 条演示流水
  //    幂等: Category/FinanceAccount 走唯一索引, FinanceTransaction 按 (account,type,amount,occurredAt,remark) 查重
  await financeSeed.run()
}

module.exports = { initSeeds }
