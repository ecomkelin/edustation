# 数据模型 - Org / OrgPromotion / Category

> **何时读这个文件**：改机构、Org schema、推广信息（OrgPromotion）、业态分类（Org.type）、Category 字典、per-org 隔离整改时读。
> **一行摘要**：SaaS 多租户根实体 Org + 1:1 推广子表 OrgPromotion + per-org 共享字典 Category 的 schema / 字段权限 / 整改历史。

---

## Org（机构，2026-06 强化）

**基础信息**

- `unicode`（内部编码）
- `name`（全称）
- `nameAbbreviation`（简称）
- `type`（机构业态分类 — 见下方"业态分类"段）
- `region`（地区-字典）
- `principal`（负责人，User ref)

**联系**

- `contactPerson`
- `contactPhone`（内部对接电话 — 与 OrgPromotion.hotline 区分）
- `address`

**业务**

- `establishedDate`（开设日期，2026-06 起允许超管修改）
- `isActive`

**合规（仅平台超管可写）**

- `socialCreditCode`（统一社会信用代码）
- `legalPerson`（法人代表）
- `licenseNumber`（办学许可证号）

**媒体**

- `logo`（File ref）

**扩展**

- `meta: Mixed`

### 字段权限分层（`org.service.update` 硬卡）

| 层级 | 字段 | 写权限 |
|---|---|---|
| super-admin-only | `unicode` / `name` / `nameAbbreviation` / `socialCreditCode` / `legalPerson` / `licenseNumber` / `principal` / `type` / `region` / `establishedDate` | 非超管写直接 403 |
| shared | `contactPerson` / `contactPhone` / `address` / `logo` | 都可写 |
| 启用切换 | `isActive` | 走 toggle-active |

## 业态分类（`Org.type`，2026-06 整改）

**整改前**：`Org.type` 是 ObjectId，引用 `Category(model='Org')` 字典文档。

**整改后**：String enum，10 种平台层统一枚举：

| 值 | 含义 |
|---|---|
| `academic` | 学科类 |
| `arts` | 艺术类 |
| `sports` | 体育类 |
| `stem` | 科技类 |
| `comprehensive` | 综合素质 |
| `language` | 语言类 |
| `vocational` | 职业/成人 |
| `preschool` | 学前/托育 |
| `tutoring_arts` | 艺考集训 |
| `other` | 其他 |

- 定义位置：`@shared/enums#ORG_TYPES` / `ORG_TYPE_LABELS`（前后端硬编码共享）
- Category 字典 `model` enum 移除 `'Org'`
- 老的 `Category(model='Org')` 文档全部 drop（迁移脚本 `scripts/migrate-org-type-to-string.js`）

## OrgPromotion（推广信息，2026-06 新增，1:1 with Org）

**collection**：`org_promotions`

**拆分原因**：Org 10 字段 vs Promotion 20+ 字段；更新频率差异大；权限天然分层（基础超管 / 推广机构改）；未来装修/多语言/校区级推广挂这里不动 Org。

### A. 基础展示

- `description`（简介）
- `brandStory`
- `teachingFeatures[]`（教学特色 tag）
- `facultyIntro`（师资简版）
- `environmentImages[]`（环境图，Ref<File>）
- `businessHours`
- `businessScope[]`（经营范围 tag）

### B. 联系方式

- `hotline`（招生热线 — **与 Org.contactPhone 区分**：hotline=对外宣传，contactPhone=内部对接）
- `serviceWechat`
- `serviceQq`
- `email`
- `website`
- `wechatPublic`
- `wechatQrcode`（Ref<File>）

### C. 自媒体

- `douyin`
- `xiaohongshu`
- `videoAccount`

### D. 地图

- `longitude` / `latitude` / `nearbyLandmark`

### E. 资质荣誉

- `registeredCapital`（展示用）
- `certificates[]`（Ref<File>）
- `honors[]`

### F. SEO

- `seoTitle` / `seoKeywords` / `seoDescription`

### G. 第三方集成

- `baiduAnalyticsId` / `wechatMiniAppId`

### 分享

- `sharePoster`（Ref<File>）

### 端点

- `GET /api/v1/orgs/:id/promotion`（不存在返回空文档，前端借此判断"还没填"）
- `PUT /api/v1/orgs/:id/promotion`（upsert + fileBind）

### 权限码

- `org-promotion.read` / `org-promotion.write`
- 挂在「管理员」「教务」系统职位，不挂「老师」「家长」「财务」

## Category 字典（2026-06 整改）

### 整改前状况

- Category 是平台级共享字典（无 org 字段），写权限仅平台超管
- `model` enum 含 5 个：`Org / Student / Subject / LeadTag / Channel`
- `Org.type` 引用 `Category(model='Org')`，其余 4 个 model 被本机构业务（Parent.tags / Subject.category / 等）引用

### 问题

- LeadTag/Channel/Student/Subject 都是 per-org 业务数据，但全局共享导致不同机构互相干扰（"高意向"标签含义可能不同 / "VIP 客户"渠道名冲突）
- Org.type 用 ObjectId 引用 Category 太重——机构业态是平台层统一枚举，不该走 per-org 字典

### 整改后

**Org.type**：从 ObjectId 改成 String enum（10 种，详见上方"业态分类"段）

**Category 加 `org` 字段**（ObjectId, ref Org, **required: true**, indexed）：

- 4 个 model（`Student / Subject / LeadTag / Channel`）全 per-org
- **2026-06-19 起 `org` 改为必填**：所有 Category 必须归属某机构，平台级共享字典完全下线。开发阶段已清理 21 条 `org=null` 的历史 platform-level 类别（python/C++/Scratch/Spike/大颗粒 等 Subject 分类）
- list / tree / detail 默认按 `req.orgId` 过滤
- create 时 controller 强制 `org = req.orgId`；schema 校验拒绝任何缺 org 的 Category

### 写权限下放机构（复用各引用方写权限，不新增）

| Category.model | 写权限码 |
|---|---|
| `Student` | `student.write` |
| `Subject` | `subject.write` |
| `LeadTag` | `recruit.write` |
| `Channel` | `recruit.write` |

### 路由

- 所有路由走 `requireOrg` 中间件（拿 req.orgId）
- GET 任何登录用户可调
- POST/PUT 在 controller 内部按 `body.model` 动态选权限码

### 删除

- 仍走 `requirePlatformPassword`（高风险）
- 互锁检查 `categoryUsageChecks(orgId, doc, id)` 按本 org 隔离

### 唯一性索引

`{org, model, name, parentCategory}` unique —— 同 org 内同 model 同 parent 下 name 不可重复，跨 org 同名不冲突。

## 前端（Categories.vue）

- 业务域选项去掉 'Org'：MODELS = `['Student', 'Subject', 'LeadTag', 'Channel']`
- 顶部说明改为"按 x-org-id 隔离"
- 菜单 `/categories` 不再 `requirePlatform: true`（机构 admin 可访问本机构字典）
- 删除按钮 `precheck-notes` 由"无任何机构引用该类别"改为"无业务实体引用该类别"

## 种子清理

- `scripts/db/seeds/category.seed.js` → noop（保留为兼容文件）
- `scripts/db/seeds/org.seed.js` → `type: 'arts'` 硬编码
- `scripts/db/seeds/initial.data.json` → 删 2 个 Org Category；梓潼/绵阳的 org.type 从 ObjectId 改成 `"stem"`

## 迁移顺序

1. `node scripts/migrate-org-type-to-string.js`（老 ObjectId → 新 String enum + drop 老 Org Category）
2. （可选）`node scripts/db/seeds/leadTag.seed.js` / `channel.seed.js` 给本机构 LeadTag/Channel seed 基础项
