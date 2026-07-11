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
// 平台科普文章 + 小游戏 (2026-07-03 立项 MM=36 + MM=37): org=null 平台级, 跨机构对家长可见
const contentSeed = require('./seeds/content.seed')
// 员工任务模块 (2026-07-08 立项 MM=36): 系统岗位权限码 + 示例模板
const taskSeed = require('./seeds/task.seed')
// 机构法律协议 (2026-07-11): 7 个 key 默认模板 (2 必勾 + 5 仅展示占位), 复用 orgDefaultLegal
const legalSeed = require('./seeds/legal.seed')
// 通知模板 (2026-07-11 v0.9 立项): 2 个平台默认 inbox 模板 (lesson_remind_1h + task_due)
//   org=null 平台级; 机构可在 /admin/notifications/templates 覆盖
const notificationTemplateSeed = require('./seeds/notification-templates.seed')

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

  // 7. 平台科普文章 + 科普视频 (2026-07-03): 8 articles + 6 videos, platform-only
  //    幂等 bulkWrite upsert; 不依赖 initial.dropDatabase 流程
  //    (2026-07-03 同日加 videos: 与 article 一致评级, 平台超管发布, C 端 web-view 播放)
  //    2026-07-04: 游戏模块下线, content.seed 删 GAMES
  await contentSeed.run()

  // 8. 员工任务 (2026-07-08): 给系统岗位 (admin/教务/老师/财务/招生) 批量加 task 权限码
  //    + 给每个 org 写一个示例模板 (默认 isActive=false 让用户自己启用)
  await taskSeed.run()

  // 9. 机构法律协议 (2026-07-11): 给每个启用 org 写 7 个 key 默认 LegalDoc
  //    - 购买协议 + 退费规则 (带默认 markdown 文本, isRequired=true, scope=order)
  //    - 关于本机构 / FAQ / 积分规则 / 分享规则 / 联系方式 (空白占位, isRequired=false, scope=none)
  //    幂等: seedDefaultLegalDocs 已用 isActive=true 唯一性防覆盖; 已存在的不会动
  await legalSeed.run()

  // 10. 通知模板 (2026-07-11 v0.9): 平台默认 2 个 inbox 模板 (lesson_remind_1h / task_due)
  //     org=null 平台级; 机构可在 admin 后台覆盖
  await notificationTemplateSeed.run()
}

module.exports = { initSeeds }
