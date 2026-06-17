# SiteConfig 模块 API

## 概览

平台级站点配置 (备案号 / 运营主体 / 版权年份 / 客服电话 / 平台 logo)。

**单例模型** (scope='global' unique),启动时由 `siteConfig.service.ensureSingleton` 自动 upsert。

## 端点清单

| Method | Path | 权限 | 用途 |
|--------|------|------|------|
| GET | `/site-config` | 公开 | 读站点配置 (admin Footer + client 我的页底部都要) |
| PUT | `/site-config` | requirePlatformAdmin | 平台超管修改备案 / 运营主体等 |

## 字段说明

| 字段 | 类型 | 用途 |
|------|------|------|
| `copyrightYear` | String | 版权年份,Footer 显示 `© 2026` |
| `operatorName` | String | 运营主体公司全称 (营业执照名称) |
| `operatorAddress` | String | 注册地址 |
| `operatorContact` | String | 联系方式 (电话或邮箱) |
| `icpNumber` | String | ICP 备案号,前端必须链到 `https://beian.miit.gov.cn` |
| `policeBeianNumber` | String | 公安网安备案号 |
| `customerServicePhone` | String | 客服 / 投诉电话 (《电子商务法》第 15 条要求) |
| `platformLogo` | ObjectId<File> | 平台 logo (与机构 logo 区分) |

## 使用方式

- 后端: `await siteConfigService.ensureSingleton()` 在 main.js bootstrap 调一次
- 前端 admin: `siteConfigApi.get()` 在 main.js mount 前调一次,塞到 Pinia store
- 前端 client: 同上,在 App.vue onLaunch 调一次

## 升级路径

阶段 2 (远期) 如要扩展"分租户 SaaS 站点配置" (例如不同 SaaS 客户用不同备案号),可:
- 加 `clientId` 字段并改 unique key 为 `(scope, clientId)`
- 或拆出 `TenantSiteConfig` 1:N with 主 SiteConfig

目前单例够用。
