# 数据模型 - User / UserOrgRel / Position / 权限码

> **何时读这个文件**：改用户、登录账号、机构-用户关系、职位/权限码、新接入模块的权限挂载时读。
> **一行摘要**：SaaS 多租户身份层：User（登录账号）+ UserOrgRel（用户-机构关系）+ Position（机构内职位含权限码数组）。

---

## User（登录账号）

**核心字段**：

- `mobile`（unique）
- `passwordHash`
- `realName`
- `avatar`（File ref — 跨租户，diffSingle 维护）
- `wechatUnionId`
- `requirePasswordChange: Boolean`（新建家长首次登录强制改密用）

> 敏感字段注意：见 [memory: mongoose-select-false-pitfall]，passwordHash 等 `select: false` 字段必须 `.select('+xxx')` 才能读到。

## UserOrgRel（用户-机构关系）

- `user`（User ref）
- `org`（Org ref）
- `positions`（[Position ref] — 数组，可同时挂多个职位）
- `isMain`（是否主机构 — 切换机构时默认进入的）

业务规则：

- 一个 user 可以挂多个 org（多机构工作，如顾问兼课）
- 一个 user 在某 org 下可有多个 position（如某教务同时是老师）

## Position（机构内职位）

- `org`（Org ref）
- `name`（职位名）
- `permissions`（[String] — 权限码数组）
- `isSystem`（是否系统职位 — 系统职位不可删，不可改 name）

### 系统职位（默认 5 个）

| 名称 | 默认权限码范围 |
|---|---|
| 平台超管 | 全部权限 + 仅平台层可见的 `platform.*` 权限 |
| 机构管理员 | 大部分业务权限 |
| 教务 | 教务相关 |
| 老师 | 教学相关 |
| 家长 | 学员/课表/订单查看等只读权限 |

> 新增权限码时必须 **4 处同步**：`shared/permissions.json` + `routes` + `DEFAULT_POSITIONS` + 已有机构 updateMany 补齐。详见 [memory: position-dual-hardcode-pitfall] / [memory: report-permission-rollout]。

## 权限码

- **单一来源**：`shared/permissions.json`（前后端共享）
- **命名规范**：`<domain>.<action>`，如 `student.read` / `order.write` / `recruit.convert`
- **认证中间件**：业务路由挂 `requirePermission('xxx.yyy')`；权限不足返 403

### 权限码组（截至 2026-06）

| 组 | 权限码 |
|---|---|
| `student` | `student.read` / `student.write` |
| `subject` | `subject.read` / `subject.write` |
| `course` | `course.read` / `course.write` |
| `room` | `room.read` / `room.write` |
| `order` | `order.read` / `order.write` / `studentProduct.gift` |
| `recruit` | `recruit.read` / `recruit.write` / `recruit.convert` |
| `org` | `org.read` / `org.write` / `org-promotion.read` / `org-promotion.write` |
| `position` | `position.read` / `position.write` |
| `storage` | `storage.read` / `storage.write` |
| `dashboard` | `dashboard.read`（看板通过复用 `student.read` / `order.read` 等已有码，不新增） |
| `agent` | `agent.chat` / `agent.manage` |

## 角色与登录代理

- **学生不登录系统**，由家长（User）切换上下文代理操作。
- 家长登录后始终在顶部显示当前活跃子女（单子女不跳过选择步骤，保持 UI 统一）。
- 所有学生接口在请求头中传递 `x-active-student-id`。

## 家长初始密码策略（转化/新建）

- 新建家长 `User.passwordHash = bcrypt(mobile.slice(-6))`（手机号后 6 位）
- `User.requirePasswordChange = true`
- `auth.service.login` 响应里返回 `requirePasswordChange: true`
- 前端 auth store 存该标志，路由守卫 (`router/index.js` beforeEach) 拦截任何非 `/reset-password` 访问，强制跳改密页
- `auth.service.changePassword` 改密成功后清掉 `requirePasswordChange` 标志
