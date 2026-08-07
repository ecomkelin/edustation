# User 模块 API 文档

> 基础路径：`/api/v1/users`
>
> 当前机构下的用户管理。机构上下文从 `x-org-id` 请求头解析（由 `mws.requireOrg` 中间件统一注入到 `req.orgId`）。
> 用户本身是平台级实体（`User`），而 `UserOrgRel` 维护"用户-机构-职位"的多对多关系。本模块默认作用于**当前 org**。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`，机构切换通过请求头 `x-org-id`。
- 删除用户实际是**解除用户与本机构的关系**（删除 `UserOrgRel`），不删 `User` 本身。
- 权限码：
  - `user.read` —— 查看用户列表/详情
  - `user.write` —— 创建/更新/删除/分配职位
  - `user.resetPassword` —— 重置他人密码

---

## 1. 当前机构用户列表

- **Method / Path**：`GET /api/v1/users`
- **权限**：`user.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按 `mobile` / `realName` 模糊匹配 |
| position | String (ObjectId) | 按职位 ID 过滤 |
| isActive | Boolean | 是否启用 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data.items | UserRel[] | 元素结构见下 |
| data.total | Number | 总数 |
| data.page / pageSize | Number | 分页 |

`UserRel` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | User._id |
| mobile | String | 手机号 |
| realName | String | 姓名 |
| avatarSvgKey | String | 头像枚举 key（2026-07-05 起不再是 URL/File ref） |
| positions | Position[] | `{ id, name }` |
| isMain | Boolean | 是否主机构 |
| isActive | Boolean | 用户全局启用状态 |

---

## 2. 用户详情

- **Method / Path**：`GET /api/v1/users/:id`
- **权限**：`user.read`
- **路径参数**：`id` —— User._id
- **成功响应** (`200 OK`)：返回该用户在本机构下的 `UserRel` 详情对象（结构同上）。
- **失败**：`404` —— 用户不在本机构。

---

## 3. 创建用户

- **Method / Path**：`POST /api/v1/users`
- **权限**：`user.write`
- **说明**：若手机号已存在，则只创建 `UserOrgRel`；否则先创建 `User`，密码使用默认或传入的初始密码（通常要求首次登录修改）。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| mobile | String | 是 | 11 位手机号 |
| realName | String | 否 | 真实姓名 |
| password | String | 否 | 初始密码；不传则用系统默认 |
| positions | String[] | 否 | 职位 ID 列表 |
| isMain | Boolean | 否 | 是否主机构，默认 false |
| avatar | String | 否 | 头像 URL |

- **成功响应** (`201 Created`)：返回 `UserRel`。

---

## 4. 更新用户

- **Method / Path**：`PUT /api/v1/users/:id`
- **权限**：`user.write`
- **请求体**（均可选）：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| realName | String | 姓名 |
| avatar | String | 头像 |
| idCard | String | 身份证号，校验 15/18 位 |
| region | String (ObjectId) | 现居地（Region） |
| meta | Object | 扩展属性 |

- **成功响应** (`200 OK`)：返回更新后的 `UserRel`。
- **注意**：不在此接口修改密码，请使用 `/change-password` 或 `/reset-password`。

---

## 5. 解除用户与本机构的关系

- **Method / Path**：`DELETE /api/v1/users/:id`
- **权限**：`user.write`
- **说明**：删除 `UserOrgRel`，用户本身保留；如该用户仅在本机构存在，依然可登录但 `me` 中不再包含此 org。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 6. 修改自己的密码

- **Method / Path**：`POST /api/v1/users/:id/change-password`
- **权限**：authenticated，且 `:id` 必须为当前登录用户
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| oldPassword | String | 是 | 旧密码 |
| newPassword | String | 是 | 新密码，长度 6-32 |

- **成功响应** (`200 OK`)：`{ success: true }`。
- **失败**：`401` —— 旧密码错误。

---

## 7. 管理员重置用户密码

- **Method / Path**：`POST /api/v1/users/:id/reset-password`
- **权限**：`user.resetPassword`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| newPassword | String | 是 | 新密码，长度 6-32 |

- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 8. 分配职位

- **Method / Path**：`PUT /api/v1/users/:id/positions`
- **权限**：`user.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| positionIds | String[] | 是 | 职位 ID 列表（空数组表示清空） |
| isMain | Boolean | 否 | 是否设为主机构关系（与本机构） |

- **成功响应** (`200 OK`)：返回更新后的 `UserRel`。
- **约束**：职位必须属于本机构；用户必须先存在于本机构（否则 `404`）。

## 9. 把已有用户加入本机构

- **Method / Path**：`POST /api/v1/users/:id/org`
- **权限**：`user.write`
- **说明**：将一个**已存在**的 User 关联到当前 org（创建 `UserOrgRel`），适用于：
  - 跨机构场景——某用户已在其他机构存在，现需纳入本机构管理
  - 用户曾被「解除」移出本机构后再次加入
  - 平台超管将某账户纳入运营

  与 `POST /users`（创建用户）的区别：本接口**不会创建新的 User 记录**，仅创建 `UserOrgRel`。
- **路径参数**：`id` —— User._id（通过 `GET /users/lookup?mobile=xxx` 获取）
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| positions | String[] (ObjectId) | 否 | 分配到本机构的职位 ID 列表；留空表示仅入机构、暂不分配职位 |
| isMain | Boolean | 否 | 是否设为主属机构，默认 `false` |

- **成功响应** (`201 Created`)：返回新建的 `UserOrgRel`（`positions` 已 populate）。
- **约束**：
  - 职位必须全部属于当前 org，否则 `400`。
  - 用户已在本机构 → `409`（先 `DELETE /users/:id` 解绑再加入）。
  - 用户不存在 → `404`。
  - **2026-07-22 业务硬约束**：目标用户 `isPlatformAdmin=true`（平台超管） → `400 "该账号 ... 是平台超管, 无需也不能加入任何机构"`。超管天然跨机构, 不应该挂在某个 org 下。
- **不卡**：`isActive`——停用账号可被加入；`isMain` 透传、不自动计算。

---

## 10. 按手机号查找用户（跨机构）

- **Method / Path**：`GET /api/v1/users/lookup`
- **权限**：`user.read`
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| mobile | String | 是 | 11 位手机号 |

- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | User._id |
| mobile | String | 手机号 |
| realName | String | 姓名 |
| avatarSvgKey | String | 头像枚举 key（2026-07-05 起不再是 URL/File ref） |
| idCard | String\|null | 身份证号（未脱敏，按需在前端展示时脱敏） |
| region | {id,name}\|null | 现居地 |
| isActive | Boolean | 用户全局启用状态 |
| currentOrgRel | Object\|null | 该用户**在当前 org** 的 rel；若为 `null` 表示未加入本机构，可直接 `POST /:id/org` |

- **失败**：`404` —— 该手机号未注册。
- **使用场景**：管理后台「添加已有用户」流程的前置查询。

---

## R-0217 `GET /users/:id/overview` —— 用户详情页聚合概览

权限 `user.read`。用户详情页 (`admin /users/:id`) 的主数据源，一次拿全，不用前端拼 N 个接口。

- **响应**：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| scope | `'platform'` \| `'org'` | 视角。前端据此决定是否渲染「安全与审计」tab、是否显示机构列 |
| profile | Object | 账号档案。`wechat` 只给 `{openIdBound, unionIdBound}` 两个 bool，**不下发 openId 明文**；`lastActiveAt` 由最新 RefreshToken.createdAt 派生（User 没有 lastLoginAt 字段） |
| orgs | Array | 机构 + 职位（含每个职位的 permissions）。**scope=org 时只有当前机构那一条** |
| effectivePermissions | `{isPlatformAdmin, codes[]}` | 由 orgs[].positions[].permissions 聚合去重。超管返 `isPlatformAdmin:true` + 空 codes（其在 requirePermission 里被短路成 `['*']`，逐条列没意义） |
| counters | Object | 18 项业务计数，一次 `Promise.all`。`sessions` / `auditLogs` 对非超管返 `null` |

## R-0218 `GET /users/:id/related/:domain` —— 分域明细（分页）

权限 `user.read`。query：`page` / `pageSize`（走 `normalizePagination`，pageSize 上限 200）。

- **domain 取值**（16 个，统一返回 `{items, total, page, pageSize}`）：

`students` `courseInstances` `lessonSchedules` `evaluations` `works` `tasks` `parents` `childLeads` `trialBookings` `financeTx` `giftedProducts` `refunds` `files` `consents` `sessions` `audit`

- **`sessions` / `audit` 仅平台超管**（非超管 `403`）：RefreshToken 没有 org 字段、AuditLog 模块本身就是 platform-only，机构视角下无法安全裁剪。
- 未知 domain → `400`。
- `parents` / `childLeads` / `trialBookings` / `tasks` 的每行带 `roles[]`，标明该用户在这条记录里担任了哪些角色（一个人可能身兼两职）。

## 可见性（R-0217 / R-0218 共用 `resolveScope`）

| 调用者 | org 过滤 | 目标不属于本机构 |
| ------ | -------- | ---------------- |
| 平台超管 | 不加（全平台视角；游离用户也能看到其历史痕迹） | — |
| 机构管理员 | 强制 `{ org: req.orgId }` | **404**（不是 403 —— 403 会泄露"这个账号在别家存在"，可被枚举；与 R-0206 lookup 同口径） |

`orgs[]` 在机构视角下只返当前机构那一条，连"他还在别家"都不暴露。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 参数校验失败 |
| 401 | 未登录 / 旧密码错误 |
| 403 | 权限不足 / 修改他人密码被拒 |
| 404 | 用户不在本机构 / 用户不存在 / 职位不存在 |
| 409 | 身份证号已被他人占用 / 该用户已在当前机构 |
