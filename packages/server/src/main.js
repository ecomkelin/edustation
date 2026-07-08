'use strict'

// 必须在最顶部：注册 module-alias
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const config = require('@config/index')
const { connect } = require('@config/db')
const { createApp } = require('./app')

async function bootstrap() {
  // 1. 数据库
  await connect()
  // eslint-disable-next-line no-console
  console.log(`[mongo] connected to ${config.db.uri.replace(/\/\/[^@]+@/, '//***@')}`)

  // 1.2 加载平台级法律协议清单 (shared/legal/*.md → 内存单例).
  // 任一文件缺失 / frontmatter 不合法直接 throw, 阻止启动 (合规风险, fail-loud)
  require('@utils/legalCatalog').loadPlatformLegal()

  // 1.3 站点配置单例 (备案号 / 运营主体 / 版权年份). 已存在则 no-op
  await require('@modules/siteConfig/siteConfig.service').ensureSingleton()

  // 1.4 名师团队总开关 + 行级 showAsTeacher 回填 (2026-06)
  // 老数据默认无值会导致机构主页"什么都没显示", 这里把已有 Org 总开关设为 true,
  // 已有 staff UserOrgRel 自动勾上 (纯家长保持不勾). 新数据走 admin 显式管理.
  const teacherBackfill = await require('@utils/teacherBackfillSeed')()
  if (teacherBackfill.orgsUpdated || teacherBackfill.staffRelsSet || teacherBackfill.guardianRelsKept) {
    // eslint-disable-next-line no-console
    console.log('[teacher-backfill]', JSON.stringify(teacherBackfill))
  }

  // 1.5 注册 pet-system-v2 饥饿衰减 + 死亡 cron (2026-06-21)
  // require 即触发 setInterval(...).unref()，参照 captcha.service 模式
  require('@modules/pet/petCron')

  // 1.5.1 员工任务 cron (2026-07-08 立项)
  // - 每 60s: 1) 过期扫描; 2) 周期任务模板触发生成
  require('@modules/task/taskCron')

  // 1.6 Pet catalog 种子 (2026-06-22 user SVG 决策)
  // 启动时硬清三表 + 灌入内联 SVG 种子（platform 级共享）
  // 遵循 [[dev-stage-no-backcompat]] 开发期硬迁移原则
  await require('@utils/petCatalogSeed').runPetCatalogSeed()

  // 2. Express
  const app = createApp()

  // 3. 启动监听 (test 环境不 listen)
  if (!config.isTest) {
    const server = app.listen(config.port, '0.0.0.0', () => {
      // eslint-disable-next-line no-console
      console.log(`[server] listening on http://localhost:${config.port} (${config.env})`)
    })

    const shutdown = async (sig) => {
      // eslint-disable-next-line no-console
      console.log(`[server] received ${sig}, shutting down...`)
      server.close()
      try {
        await require('@config/db').disconnect()
      } catch (_) {
        /* ignore */
      }
      process.exit(0)
    }
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  }

  // 4. 导出供测试
  return app
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[server] bootstrap failed:', e)
  process.exit(1)
})
