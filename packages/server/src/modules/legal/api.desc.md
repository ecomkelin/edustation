# Legal 模块 API

## 概览

法律协议与用户同意记录管理。

分两层:
- **平台级**: 用户协议 / 隐私 / 未成年人 / Cookie / 平台 SaaS,硬编码 `shared/legal/*.md`,版本号在 frontmatter
- **机构级**: 课程购买协议 / 退费规则 / 关于本机构 / FAQ / 积分规则 / 分享规则 / 联系方式,`LegalDoc` collection,机构后台编辑

同意记录 `UserConsent` 是 append-only,审计用。

## 端点清单

| Method | Path | 权限 | 用途 |
|--------|------|------|------|
| GET | `/legal/platform` | 公开 | 平台协议清单 (不含原文) |
| GET | `/legal/platform/:key` | 公开 | 单份平台协议 (markdown + html) |
| GET | `/legal/me/pending` | authenticate | 当前用户未对齐的协议清单 (响应里也由 login/me 注入) |
| POST | `/legal/me/consents` | authenticate | 批量落 UserConsent |
| GET | `/legal/me/consents` | authenticate | 我的同意历史 (分页) |
| GET | `/legal/orgs/:orgId/legal-docs` | legal.read | 机构协议列表 (isActive=true) |
| GET | `/legal/orgs/:orgId/legal-docs/:key` | 公开 | 公开读取机构某协议生效版 (家长 C 端用) |
| PUT | `/legal/orgs/:orgId/legal-docs/:key` | legal.write | 软停旧版 + 新建版本 (patch+1) |
| GET | `/legal/orgs/:orgId/legal-docs/:key/history` | legal.read | 历史版本 |
| POST | `/legal/orgs/:orgId/legal-docs/:key/disable` | legal.write | 停用当前生效版本 |

## 端点详情

### `GET /legal/platform`

返回:
```json
{ "items": [{ "key": "user-agreement", "title": "...", "version": "1.0.0", "required": true, ... }] }
```

### `GET /legal/platform/:key`

返回:
```json
{
  "key": "user-agreement",
  "title": "...",
  "version": "1.0.0",
  "effectiveAt": "2026-06-17",
  "markdown": "...",
  "html": "..."
}
```

### `GET /legal/me/pending`

按当前 `x-org-id` 计算 pending. 不带 `x-org-id` 时只算平台级.

返回 (与 auth.login 响应的 `pendingConsents` 字段同结构):
```json
{
  "items": [
    { "key": "user-agreement", "type": "platform", "scope": "login", "version": "1.0.0", "title": "...", "html": "..." }
  ]
}
```

### `POST /legal/me/consents`

入参:
```json
{
  "consents": [
    { "key": "user-agreement", "type": "platform", "version": "1.0.0" },
    { "key": "purchase-agreement", "type": "org", "version": "1.0.0", "org": "<orgId>" }
  ]
}
```

校验: `version` 必须与当前生效版本匹配,否则 400. (user, docKey, version) 唯一,重复写入 idempotent.

### `PUT /legal/orgs/:orgId/legal-docs/:key`

入参:
```json
{
  "title": "课程购买协议",
  "contentMarkdown": "# ...",
  "isRequired": true,
  "requireScope": "order"
}
```

行为: 软停旧版 (isActive=false) + 创建新版 (version patch+1). 服务端用 `marked` 编译 `contentHtml`.

## 模型结构

### LegalDoc (机构级)

`packages/server/src/models/LegalDoc.model.js`

- collection: `legal_docs`
- 索引: `(org, key, isActive)` partial unique (`isActive:true`); `(org, key, version)` 倒序

### UserConsent (同意记录)

`packages/server/src/models/UserConsent.model.js`

- collection: `user_consents`
- 索引: `(user, docKey, version)` unique; `(user, docKey, createdAt)` 倒序

## 协议升级流程

### 平台级
1. 改 `shared/legal/xxx.md` 的 frontmatter `version: 1.0.0` → `1.1.0`
2. git commit + 部署
3. server 启动 `legalCatalog.loadPlatformLegal()` 重新读取
4. 下次用户 login → `pendingConsents` 出现该项 → 前端拦截到同意页

### 机构级
1. 机构 admin 在 `/legal/org-docs` 编辑 (`PUT /legal/orgs/:orgId/legal-docs/:key`)
2. service 自动 patch+1 + 软停旧版
3. 下次该机构家长下单时,前端拉最新版 → 弹层重新同意 (`POST /orders` 时校验)

## 与其他模块的耦合

- `auth.service.login` / `auth.service.me` 注入 `pendingConsents: await legalService.computePendingConsents(...)`
- `order.service.create` 校验 `body.agreements`: 必须覆盖所有 `isRequired+requireScope='order'` 的 LegalDoc, 且 version 匹配
- `org.service.create` 末尾调 `orgDefaultLegal.seedDefaultLegalDocs(orgId)` 默认 seed 购买协议+退费规则
