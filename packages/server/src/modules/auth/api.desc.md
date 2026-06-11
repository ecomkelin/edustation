# Auth 模块 API 文档

> 基础路径：`/api/v1/auth`
>
> 认证模块负责用户登录、Access Token 刷新、登出以及当前用户信息查询。
> Access Token 短有效期，通过 `Authorization: Bearer <access>` 请求头传递。
> Refresh Token 长有效期，**仅**通过 httpOnly Cookie 传递，路径限定在 `/api/v1/auth/refresh`。

---

## 通用约定

- 响应统一格式：`{ success: true, data }` / `{ success: false, message, code }`。
- 所有需要登录态的接口，前置中间件 `mws.authenticate`。
- Refresh Token Cookie 属性：`HttpOnly; Secure(生产); SameSite=Strict; Path=/api/v1/auth/refresh`。
- 登录成功会同时下发 access token 和新的 refresh token（轮换），旧的 refresh token 立即撤销。

---

## 1. 用户登录

- **Method / Path**：`POST /api/v1/auth/login`
- **权限**：无需登录
- **说明**：校验手机号 + 密码，成功后返回 access token，并通过 `Set-Cookie` 下发 refresh token。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| mobile | String | 是 | 手机号，11 位，匹配 `/^1[3-9]\d{9}$/` |
| password | String | 是 | 密码（明文传输，生产环境必须 HTTPS） |

- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data.accessToken | String | Access Token，默认 2 小时有效 |
| data.user | Object | `{ id, mobile, realName, avatar, isPlatformAdmin }` |

- **Set-Cookie**：`refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=...`
- **失败**：手机号不存在或密码错误返回 `401`。

---

## 2. 刷新 Access Token

- **Method / Path**：`POST /api/v1/auth/refresh`
- **权限**：依赖 Cookie 中的 refresh token，无需 Authorization 头
- **说明**：读取请求中的 `refreshToken` Cookie，验证有效后签发**新的 access + refresh**（旧的 refresh 立即撤销，避免重放）。
- **请求体**：无
- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data.accessToken | String | 新的 Access Token |

- **副作用**：响应头会再次 `Set-Cookie` 覆盖 refresh token。
- **失败**：refresh token 缺失/过期/已撤销返回 `401`。

---

## 3. 当前用户登出

- **Method / Path**：`POST /api/v1/auth/logout`
- **权限**：authenticated
- **说明**：撤销当前 refresh token 并清除 Cookie；access token 等待其自然过期即可。
- **请求体**：无
- **成功响应** (`200 OK`)：`{ success: true }`
- **副作用**：`Set-Cookie: refreshToken=; Max-Age=0`

---

## 4. 当前用户信息（含所属机构 + 权限）

- **Method / Path**：`GET /api/v1/auth/me`
- **权限**：authenticated
- **说明**：返回当前登录用户基础信息，并聚合所有 `UserOrgRel` 中的职位权限码。
- **请求体**：无
- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data.id | String | User._id |
| data.mobile | String | 手机号 |
| data.realName | String | 真实姓名 |
| data.avatar | String\|null | 头像 URL |
| data.isPlatformAdmin | Boolean | 是否平台超管 |
| data.orgs | Object[] | 用户的机构列表，元素结构见下表 |

`data.orgs[]` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| org | Object | `{ id, name, nameAbbreviation, type, region, isActive }` |
| positions | Object[] | `{ id, name, isSystem }` |
| permissions | String[] | 聚合后的所有职位权限码（去重） |
| isMain | Boolean | 是否主机构 |

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 请求体校验失败 |
| 401 | 未登录 / refresh token 无效或过期 |
| 429 | 登录防刷限制（如启用） |
| 500 | 服务器内部错误 |
