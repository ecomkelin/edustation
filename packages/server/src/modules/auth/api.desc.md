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
- **失败**：
  - `401` 手机号不存在 / 密码错误 / 账号已停用 / 账号已禁用
  - `400 + reason: 'captcha_required'` 失败次数触发滑块验证（详见下文"滑块验证"）
  - `429` 登录防刷触发（详见下文"登录防刷"）
- **请求体扩展**（可选）：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| captchaPass | String | 视情况 | 当后端返回 `captcha_required` 后，前端通过 `/captcha/verify` 拿到 pass，下一次 `/auth/login` 必须带上 |

- **响应头（每次 /login 都有）**：
  - `X-RateLimit-Limit` 当前限流线阈值（5 或 30）
  - `X-RateLimit-Remaining` 窗口内剩余次数
  - `X-RateLimit-Reset` 窗口 / 锁定期结束的 unix 秒
  - `Retry-After` 触发 429 时的封禁剩余秒数

#### 登录防刷（2026-06）

为防止暴力破解 / 凭证填充，`POST /auth/login` 在 `validateRequest` 之后挂了一个进程内的频次限制中间件 `loginRateLimit`。两条独立限流线，任意一条超阈值即返回 `429`：

| 维度 | 默认阈值 | 触发封禁时长 | 环境变量 |
| ---- | -------- | ------------ | -------- |
| per-mobile | 5 次 / 15 分钟 | 15 分钟 | `LOGIN_RL_MOBILE_MAX` / `LOGIN_RL_MOBILE_LOCK_MS` |
| per-IP | 30 次 / 15 分钟 | 15 分钟 | `LOGIN_RL_IP_MAX` / `LOGIN_RL_IP_LOCK_MS` |

- 算法：固定窗口 + 触发即封。锁定期内该 key 的所有 `/auth/login` 请求直接 `429`，不再计数。
- 成功登录：`mobile` 桶会被清空（避免"输错几次后输对一次仍被锁"），`ip` 桶**不清**（防"1 真账号 + N 假账号"混合扫绕过）。
- 响应：`429` + `Retry-After: <秒>` 响应头 + 错误 `data: { reason: 'mobile' | 'ip', retryAfterMs }`。
- **前端配套**（`packages/admin/src/views/Login.vue`）：
  - 每次 401 响应把 `X-RateLimit-Remaining` 读出来，登录页 **inline 提示"密码错误, 还剩 N 次尝试机会"**（颜色由红到橙，最后一次变锁图标）
  - 触发 429 时按钮**禁用 + 实时倒计时**（"已锁定 (14:59)"），输入框和协议勾选也禁用，倒计时归零自动恢复
  - 锁定期间前端直接拦截请求，不发到后端
- **注意**：中间件挂在参数校验**之后**，所以格式错误的请求不消耗任何桶配额（也防 DoS 任意正常用户）。
- 部署：进程内 Map，**单实例**有效。多实例部署需换 Redis（阶段 2 TODO）。

#### 滑块验证（2026-06）

为挡住"输错密码"的中等水平脚本，在频次限制**之前**插入一道交互验证。**触发门槛**：同一 mobile 在 15 分钟内失败 **`CAPTCHA_AFTER_FAILURES` 次**（默认 2）后，下一次登录必传 `captchaPass`，否则返回 `400` + `data: { reason: 'captcha_required' }`。

**端点**：

1. **`GET /api/v1/captcha/challenge`** — 拿挑战
   - 响应：
     ```json
     {
       "token": "<challenge token>",
       "backgroundSvg": "<svg>含目标槽虚线</svg>",
       "pieceSvg": "<svg>拼图块</svg>",
       "width": 320, "height": 160, "pieceWidth": 50,
       "expiresAt": 1781679562572
     }
     ```
   - 挑战有效期 `CAPTCHA_CHALLENGE_TTL_MS`（默认 2 min），过期作废

2. **`POST /api/v1/captcha/verify`** — 提交答案
   - 请求体：`{ token, x, track? }`，`x` 为拼图块左边缘相对背景左边缘的像素距离
   - 容差 `CAPTCHA_TOLERANCE` 像素（默认 5）
   - 答错 → 标记 challenge 已用，**该 challenge 不能再试**（防暴力试答案）
   - 答对 → 颁发 `pass`（一次性令牌，有效期 `CAPTCHA_PASS_TTL_MS` 默认 60s）
   - 响应：`{ pass, expiresAt }`

3. **`POST /api/v1/auth/login`** 带 `captchaPass`
   - 满足滑块门槛时必传，登录成功后 pass 自动作废
   - 缺 / 无效 → `400 + reason: 'captcha_required'`，前端再弹一次

**安全模型**：
- 滑块是防"无脑脚本"（直接 POST 字典攻击），**不是**防高水平 AI（OCR 可破解 SVG 中的目标位置）
- 真阻断靠频次限制：失败 5 次 / 15 min 锁 IP+mobile 15 min，攻击者即使绕过滑块也跑不完一轮
- 阶段 2 可升级：接极验 / 腾讯防水墙 / 鼠标轨迹分析

**前端**：`packages/admin/src/components/SliderCaptcha.vue`（弹窗拖拽组件），`Login.vue` 检测到 `captcha_required` 自动打开，验证通过后**自动重试登录**带 pass，用户无感。

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
| data.idCard | String\|null | 身份证号 |
| data.region | Object\|null | `{ id, name, level, code }` 现居地 |
| data.isPlatformAdmin | Boolean | 是否平台超管 |
| data.createdAt | String | 注册时间 ISO |
| data.orgs | Object[] | 用户的机构列表，元素结构见下表 |

`data.orgs[]` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| org | Object | `{ id, name, nameAbbreviation, type, region, isActive }` |
| positions | Object[] | `{ id, name, isSystem }` |
| permissions | String[] | 聚合后的所有职位权限码（去重） |
| isMain | Boolean | 是否主机构 |

---

## 5. 自助修改资料（个人中心）

- **Method / Path**：`PUT /api/v1/auth/me`
- **权限**：authenticated
- **说明**：登录用户修改自己的资料。只允许 `realName / avatar / idCard / region` 四个字段（白名单），其他字段（手机号、超管标记、启用状态、黑名单）一律由管理员走 `users` 模块修改。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| realName | String | 否 | 真实姓名，最长 50 |
| avatar | String | 否 | 头像 URL，最长 500 |
| idCard | String | 否 | 身份证号 15/18 位；置空字符串可清空 |
| region | String | 否 | 地区 id；置空字符串可清空 |

- **成功响应** (`200 OK`)：与 `GET /auth/me` 完全一致（前端可直接覆盖 store）。
- **失败**：
  - `400` 校验失败 / 身份证号格式不对
  - `409` 身份证号已被其他用户占用

---

## 6. 自助修改密码

- **Method / Path**：`POST /api/v1/auth/change-password`
- **权限**：authenticated
- **说明**：登录用户修改自己的密码。校验原密码 → 写新密码 → 同步撤销该用户所有未撤销的 refresh token（强制其他设备重新登录）。本次请求的 access token 等其自然过期即可（短有效期）。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| oldPassword | String | 是 | 原密码 |
| newPassword | String | 是 | 新密码 6-64 位，且不能与原密码相同 |

- **成功响应** (`200 OK`)：`{ success: true }`
- **失败**：
  - `400` 原密码错误 / 新密码与原密码相同 / 校验失败

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 请求体校验失败 / 滑块验证缺失（`captcha_required`） |
| 401 | 未登录 / refresh token 无效或过期 / 密码错 / 账号状态错 |
| 429 | 登录防刷限制触发 |
| 500 | 服务器内部错误 |
