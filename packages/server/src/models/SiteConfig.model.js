'use strict'

const { Schema, model } = require('mongoose')

/**
 * 站点全局配置 (SiteConfig)
 *
 * 设计 (2026-06 立项):
 *   - 平台级单例 (scope='global' unique). 启动时 service.ensureSingleton 自动 upsert 空文档.
 *   - 仅平台超管可写 (路由层 requirePlatformAdmin), 任何机构 admin / 家长读取公开端点即可.
 *   - 数据用途: admin Footer / client "我的"页底部展示备案号 + 版权 + 运营主体.
 *
 * 字段语义:
 *   - copyrightYear: 版权年份 (展示用, "© 2026")
 *   - operatorName: 运营主体公司全称 (营业执照上的名称)
 *   - operatorAddress: 运营主体注册地址
 *   - operatorContact: 运营主体联系电话 / 邮箱
 *   - icpNumber: 工信部 ICP 备案号 (例 "沪ICP备 00000000号")
 *     前端必须把它链到 https://beian.miit.gov.cn (工信部硬性要求)
 *   - policeBeianNumber: 公安部网安备案号 (例 "沪公网安备 00000000000000号")
 *     前端可链到 http://www.beian.gov.cn/portal/registerSystemInfo
 *   - customerServicePhone: 客服 / 投诉电话 (《电子商务法》第 15 条)
 *   - platformLogo: 平台 logo 文件 ref (走 File 模块; 仅平台级 logo, 非机构 logo)
 *
 * 之所以做成模型而非 .env:
 *   - 备案号上线后可能更换 (例如服务器迁移 / 主体变更), 后台改不重启
 *   - 平台超管可在 admin /system/site-config 直接维护, 不必发 PR
 */
const SiteConfigSchema = new Schema(
  {
    // 单例锁: scope='global' unique, 整个数据库只有一条
    scope: { type: String, default: 'global', unique: true, immutable: true },

    copyrightYear: { type: String, default: '' },
    operatorName: { type: String, default: '' },
    operatorAddress: { type: String, default: '' },
    operatorContact: { type: String, default: '' },

    icpNumber: { type: String, default: '' },
    policeBeianNumber: { type: String, default: '' },
    customerServicePhone: { type: String, default: '' },

    // 平台 logo (与 Org.logo 区分: 这是 SaaS 平台主体 logo)
    platformLogo: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // 扩展位 (2026-06-23 删除了 meta.pet.hungerDecayMinutes — 改由 PetSpecies 控制)
    meta: {
      type: Schema.Types.Mixed,
      default: () => ({})
    }
  },
  { timestamps: true, collection: 'site_configs' }
)

module.exports = model('SiteConfig', SiteConfigSchema)
