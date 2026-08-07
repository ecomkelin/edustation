# 数据模型 - User / UserOrgRel / Position / 权限码

> **何时读这个文件**：改用户、登录账号、机构-用户关系、职位/权限码、新接入模块的权限挂载时读。
> **一行摘要**：SaaS 多租户身份层：User（登录账号）+ UserOrgRel（用户-机构关系）+ Position（机构内职位含权限码数组）。

---

## User（登录账号）

**核心字段**：

- `mobile`（unique，大陆 11 位手机号，登录主键）
- `passwordHash`（`select: false`）
- `realName`
- `avatarSvgKey`（**2026-07-05 起不再是 File ref** — 改为 `shared/avatars.js` 里的预制 SVG 枚举 key，默认 `mom`；不走 File 体系，没有 scope=avatar 上传）
- `idCard`（选填；填了则全局唯一，partial unique 排除 null）
- `region`（Region ref — 现居地，与 `Org.region` 同源）
- `wechatOpenId`（稀疏唯一 — **小程序登录实际用的身份标识**）
- `wechatUnionId`（稀疏唯一 — 当前登录流程不用，保留给通知渠道 capability 派生）
- `isPlatformAdmin` / `isActive` / `isBlocked` + `blockedAt` + `blockedReason`
- `requirePasswordChange: Boolean`（新建家长首次登录强制改密用）

> 敏感字段注意：见 [memory: mongoose-select-false-pitfall]，passwordHash 等 `select: false` 字段必须 `.select('+xxx')` 才能读到。

> **没有 `lastLoginAt`，也没有 LoginLog 表**。要"最近活跃"只能取该用户最新一条 `RefreshToken.createdAt`（登录 / 自动续期都会写），且 RefreshToken 有 TTL 索引会自动清过期行 —— 所以它是"当前会话"而不是登录历史。用户详情页 R-0217 的 `profile.lastActiveAt` 就是这么派生的。

## UserOrgRel（用户-机构关系）

- `user`（User ref）
- `org`（Org ref）
- `positions`（[Position ref] — 数组，可同时挂多个职位）
- `isMain`（是否主机构 — 切换机构时默认进入的）
- `showAsTeacher`（2026-06 加 — 是否作为"名师"在 C 端机构主页 / 课程产品页对外展示；仅 clientLevel=0 的员工岗可开，家长岗由 service 兜底拒绝）

唯一约束：`{user, org}` 唯一（同一用户在同一机构只有一条关系记录）。

业务规则：

- 一个 user 可以挂多个 org（多机构工作，如顾问兼课）
- 一个 user 在某 org 下可有多个 position（如某教务同时是老师）
- **平台超管没有 UserOrgRel**（天然跨机构，2026-07-22 起 `attachToOrg` 显式拒绝超管入机构）；因此超管在"游离用户"列表里出现是预期行为，不是脏数据
- 家长沟通画像字段（commStyle / familyBg / childFocus / followUp）已搬到 `Parent` 表，不在这里

> **User 是全系统关联面最广的实体**（35+ 个 model 引用它：监护人 / 任课老师 / 任务三角色 / 招生归因 / 财务经办 / 文件上传 …）。要一次看全某个人的所有痕迹，走用户详情页 R-0217 + R-0218，别自己一张张表拼。字段命名历史上长歪过几处，抄之前先核对：`StudentWork.uploadedBy` vs `File.uploader`、`Task.creator` vs `ChildLead.createdBy`、`LeadActivity.byUser` vs `FinanceTransaction.operator`、课评人在嵌套的 `LessonAttendance.evaluation.evaluatedBy`（不是顶层）、**`Order` 没有 createdBy / 销售字段**（归因只能走 `Parent.promoteBy` / `ChildLead.createdBy`）。

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
