# 数据模型 - 员工任务（Task）

> **何时读这个文件**：改任务/任务条目/核查记录/评论/任务模板/生成流水，或改状态机、可见性、权限码时读。
> **一行摘要**：员工内部协作任务 — 发起人 / 多执行人 / 监督人三角色，checklist 条目各自勾选，监督人审批；周期任务由 TaskTemplate 模板 + cron 触发生成。

---

## 1. 任务（Task）

**核心字段**

- `org`（多租户隔离，Org ref）
- `title`（标题，≤ 200 字）
- `description`（描述，markdown / plain text，≤ 5000 字）
- `type`（任务类型，见 [§5 类型 / 优先级](#5-类型--优先级)）
- `priority`（优先级，见 [§5](#5-类型--优先级)）
- `creator`（发起人 User ref；**平台超管** 可在创建时改成"机构管理员"，**普通员工**只能 creator=self，由 [task.controller.create](packages/server/src/modules/task/task.controller.js) 强制兜底）
- `assignees`（执行人列表，**≥ 1**，子文档数组 — 见 [§2](#2-执行人子文档)）
- `supervisors`（监督人列表，**必填 ≥ 1**，默认 = creator，User ref 数组）
- `startAt`（开始时间，可选；空 = 创建时间）
- `dueAt`（到期时间，**必填**；过期由 cron 标 `expired`）
- `status`（状态机，见 [§3](#3-任务状态机)）
- `progress`（0~100，service 聚合 `TaskItem.done / total` 写回）
- `tags`（自由标签，`String[]`；2026-08-06 规范化：后端 `task.service._sanitizeTags` 统一 trim+去重+拒空+限长(单标签 1~30, 总数 ≤30)；前端可直接信赖存进 DB 的是标准数组，不必自清洗。索引 `{org:1, tags:1}` 走 multikey 覆盖 list 单值 `?tag=` / 多值 `?tag=a,b` ($in) / 多选 AND `?tags=a,b` ($all) / `Task.distinct('tags')` 四种用法）
- `relatedTo`（关联业务实体：`{ entity, id }`，跳转上下文）
- `fromTemplate`（TaskTemplate ref；周期任务生成时写入，便于追溯）
- `meta`（Mixed 扩展属性）

**索引**（按使用频率排序）

```js
TaskSchema.index({ org: 1, status: 1, dueAt: 1 })     // 列表/看板主索引
TaskSchema.index({ org: 1, createdAt: -1 })           // 列表按创建时间
TaskSchema.index({ org: 1, creator: 1 })              // 我创建的
TaskSchema.index({ org: 1, 'assignees.user': 1 })     // 我执行的(数组字段索引)
TaskSchema.index({ org: 1, supervisors: 1 })          // 我监督的
TaskSchema.index({ status: 1, dueAt: 1 })             // cron 过期扫描
TaskSchema.index({ fromTemplate: 1 })                 // 模板追溯
TaskSchema.index({ org: 1, tags: 1 })                 // 2026-08-06 P1.1/P2.1/P1.2 — 标签筛选 + distinct
```

---

## 2. 执行人子文档（TaskAssigneeSchema）

**嵌入在 `Task.assignees[]` 中**，不单独成 collection。

| 字段 | 说明 |
|---|---|
| `user` | User ref |
| `status` | `not_started` / `in_progress` / `submitted`（个人状态机） |
| `submittedAt` | 个人提交时间（status=submitted 时） |
| `progress` | 个人进度 0~100，service 聚合 `自己的 done / 自己的 total` |

**设计取舍**：

- 用子文档而不是单独 collection：assignees 数量小（通常 1~5 人），随 Task 一起读，列表/看板/详情一次到位。
- 个人状态机独立于任务整体状态机：可能"我提交了"但"任务还是 partial_submitted"（其他执行人未交）。

---

## 3. 任务状态机

```
   draft ─→ assigned ─→ in_progress ─→ partial_submitted ─→ submitted ─→ approved
              ↑              │                  │                │
              │              └──── rejected ────┘                │
              │                               │                  │
              └───────────────────────────────┴── 任意时候 ──→ cancelled
                                                          ↓
                                                       expired (cron)
```

**状态枚举**（`@shared/enums` 中 `TASK_STATUSES`）：

| status | 中文 | 终态? | 触发 |
|---|---|---|---|
| `draft` | 草稿 | — | 仅 creator 可见（预留；MVP 默认跳过） |
| `assigned` | 待办 | — | 创建时；或 cron 扫描到无进度 |
| `in_progress` | 进行中 | — | 任一执行人开始勾选 |
| `partial_submitted` | 部分已提交 | — | 部分执行人 submitted |
| `submitted` | 待审核 | — | **全员** submitted |
| `approved` | 已完成 | ✅ | 监督人 review result=approved |
| `rejected` | 已打回 | — | 监督人 review result=rejected / requested_changes（任务回到 in_progress 留痕） |
| `expired` | 已逾期 | ✅ | cron 扫描 `dueAt < now && status ∈ {非终态}` |
| `cancelled` | 已取消 | ✅ | 发起人 / task.write 取消 |

**状态机由 `task.service.recomputeTaskState(taskId)` 维护**：

- 每次 `toggleItem` / `submit` 后调用
- 已 approved/expired/cancelled/submitted/rejected 的任务**不**重算状态（避免审批中又把任务标为 in_progress）
- 仅重算 `progress`（终态场景）

**监督人 review 写 TaskReview 留痕**（不覆盖前一次）：
- `result=approved` → 任务 → `approved`
- `result=rejected` / `requested_changes` → 任务 → `rejected`，所有 `submitted` 的执行人退回 `in_progress`

---

## 4. 关联子表（独立 collection）

### 4.1 TaskItem（任务条目/checklist）

| 字段 | 说明 |
|---|---|
| `task` | Task ref |
| `org` | 冗余，便于按 org 直接统计 |
| `title` | 条目文案 ≤ 200 |
| `assignee` | **必填**的 User ref（MVP 不做自由认领） |
| `done` | boolean |
| `doneBy` | 谁勾的（User ref） |
| `doneAt` | 勾选时间 |
| `order` | 排序 |

**索引**：

```js
TaskItemSchema.index({ task: 1, order: 1 })           // 详情拉全条目
TaskItemSchema.index({ org: 1, assignee: 1, done: 1 }) // 我的条目聚合
```

**约束**：

- `assignee ⊂ Task.assignees.user`（创建时 service 校验）
- 勾选权限：条目 assignee 本人 / 持有 `task.write`

### 4.2 TaskReview（核查记录）

每次监督人审批留一条，**不覆盖**前一次（"打回 → 再交 → 再批" 可追溯）。

| 字段 | 说明 |
|---|---|
| `task` | Task ref |
| `org` | 冗余 |
| `reviewer` | User ref |
| `result` | `approved` / `rejected` / `requested_changes` |
| `comment` | 评语 ≤ 2000 |
| `score` | 可选评分 1~5 |
| `reviewedAt` | 核查时间 |

**索引**：

```js
TaskReviewSchema.index({ task: 1, reviewedAt: -1 })
```

### 4.3 TaskComment（评论）

扁平结构，不做二级回复。

| 字段 | 说明 |
|---|---|
| `task` | Task ref |
| `org` | 冗余 |
| `author` | User ref |
| `content` | ≤ 2000 |
| `mentions` | 被 @ 的 User 列表（通知中心用） |

**索引**：

```js
TaskCommentSchema.index({ task: 1, createdAt: 1 })
```

---

## 5. 类型 / 优先级

**类型**（`@shared/enums` 中 `TASK_TYPES`）：

- `admin` 行政
- `teaching` 教务
- `recruiting` 招生
- `finance` 财务
- `marketing` 市场
- `facility` 后勤
- `other` 其他

**优先级**（`@shared/enums` 中 `TASK_PRIORITIES`）：

- `low` / `normal` / `high` / `urgent`

**个人状态**（`@shared/enums` 中 `TASK_ASSIGNEE_STATUSES`）：

- `not_started` / `in_progress` / `submitted`

**核查结果**（`@shared/enums` 中 `TASK_REVIEW_RESULTS`）：

- `approved` / `rejected` / `requested_changes`

---

## 6. 可见性策略（关键）

**无 `task.read` 权限的员工**只能看到与自己相关的任务：

```js
filter.$or = [
  { creator: actor.userId },
  { 'assignees.user': actor.userId },
  { supervisors: actor.userId }
]
```

**有 `task.read`**：可见 org 内全部任务。

**平台超管**：见 org 内全部（`actor.isPlatformAdmin` 强门）。

**可见性由 `task.service.canViewTask(actor, task)` 校验**：

- 详情接口 `/tasks/:id` 调 `canViewTask`，否则抛 `403`
- 列表接口 `list({ orgId, actor })` 自动叠加 `$or` 过滤
- 看板接口 `kanban({ orgId, scope, actor })` 同上

---

## 7. 任务模板（TaskTemplate，2026-07-08 立项）

周期/重复任务的定义。

**核心字段**

- `org`
- `title` / `description` / `type` / `priority`
- `defaultAssignees`（`[{ user, role? }]`，阶段 2 解析 role）
- `defaultSupervisors`（User ref 数组，必填 ≥ 1）
- `itemTemplates`（`[{ title, assigneeRole?, order }]`）
- `defaultTags`（`String[]`，**2026-08-06 P3.1**：`generateFromTemplate` 写入生成任务的 `tags` 字段；空数组 = 不自动加任何标签；不设时兜底 `['周期任务']` 保后向兼容。`task.service._sanitizeTags` 同样 trim+去重+限长。顺序：tags = `tpl.defaultTags || ['周期任务']`）
- `schedule.kind`：daily / weekly / monthly / cron（cron 阶段 2）
- `schedule.hour`：`[Number]` 生成时刻 0~23
- `schedule.weekdays`：weekly 用 0~6（0=周日）
- `schedule.daysOfMonth`：monthly 用 1~31
- `schedule.cron`：cron 表达式（阶段 2）
- `schedule.startAt` / `schedule.endAt`：周期生效区间
- `nextRunAt`：定时任务扫描这个字段；`null` = 未启用或已结束
- `lastRunAt`
- `isActive`：暂停开关
- `createdBy`

**索引**：

```js
TaskTemplateSchema.index({ isActive: 1, nextRunAt: 1 })  // scheduler 主索引
TaskTemplateSchema.index({ org: 1, createdAt: -1 })
```

**Scheduler（taskCron.js）**：

- 每 60s tick 一次
- 1) `expireOverdue()`：把 `dueAt < now && status ∈ {非终态}` 标 `expired`
- 2) 找 `{ isActive: true, nextRunAt: { $lte: now } }` 的模板，逐个调 `generateFromTemplate`：
  - 把 `defaultAssignees/defaultSupervisors` 复制为 `Task.assignees/supervisors`
  - 把 `itemTemplates` 展开为 `TaskItem`（assignee 默认 = `defaultAssignees[0]`，阶段 2 解析 role）
  - `dueAt = now + 24h`（阶段 2 加 `dueOffsetHours`）
  - 写 `TaskGenerationLog`
  - 更新 `nextRunAt = computeNextRunAt(schedule, now)`

---

## 8. 任务生成流水（TaskGenerationLog）

| 字段 | 说明 |
|---|---|
| `template` | TaskTemplate ref |
| `org` | 多租户 |
| `task` | 生成的 Task ref（成功时） |
| `runAt` | 触发时刻 |
| `status` | `success` / `failed` |
| `error` | 失败原因 |
| `scheduledFor` | 触发周期（便于多模板同 tick 区分） |

**索引**：

```js
TaskGenerationLogSchema.index({ template: 1, runAt: -1 })
```

---

## 9. 权限码

按 CLAUDE.md §0 开发阶段，5 个权限码（`@shared/permissions.json` 中 `task` group）：

| 权限码 | 含义 | 典型持有者 |
|---|---|---|
| `task.read` | 查看本机构全部任务（看板/列表/统计） | 管理员 / 教务 / 老师 |
| `task.write` | 新建 / 编辑任务 | 管理员 / 教务 / 老师 |
| `task.assign` | 把任务分派给其他员工 | 管理员 / 教务 |
| `task.review` | 监督人审批（通过/打回） | 管理员 / 教务（作为 supervisor 角色） |
| `task.delete` | 物理删除任务（走 §8.1 三重防护） | 平台超管 / 管理员 |

**Seed 分配**（`scripts/db/seeds/task.seed.js`）：

- 管理员：5 全开
- 教务：read + write + assign + review（4 开）
- 老师：read + write
- 财务 / 招生：read

**特殊路由**：

- `DELETE /tasks/:id` 走 `requirePlatformPassword`（超管 + 密码二次确认，§8.1）
- 业务硬门：`status ∈ {approved, submitted}` 不允许物理删除

---

## 9.5. 归档 (2026-07-08 立项)

**业务硬门**：`status ∈ {approved, submitted}` 不允许物理删除 — 走归档 (软隐藏) 替代。

**字段**：
- `archived: boolean` (默认 false, index: true)
- `archivedAt: Date` (归档时间)
- `archivedBy: User ref` (归档操作人, 默认 task.delete 持有者)

**行为**：
- 列表 / 看板 / 统计 默认 `archived=false` (隐藏已归档)
- `?archived=true` query 看历史
- 详情默认 403 '任务已归档, 请在「已归档」列表中查看', `?includeArchived=true` 绕过
- 所有写操作 (update / submit / review / cancel / addItem / toggleItem / addComment) 拦截, 返回 422 '任务已归档, 不可操作; 请先取消归档'
- 看板 / 统计不计入已归档任务 (与"业务终止"语义对齐)

**端点**：
- `POST /tasks/:id/archive` (require task.delete)
- `POST /tasks/:id/unarchive` (require task.delete)

**与状态机 (status) 区别**：
- `status=approved` 表达"任务做完了", 是**业务终态**
- `archived=true` 表达"运维上不再活跃", 是**运维动作**
- 两者**正交**: `approved + archived=true` 是合理的 (做完 + 不再看了)
- 自动化建议: cron 把 `status ∈ {approved, cancelled, expired} && dueAt < 90d前 && archived=false` 自动归档

详见 [§14 跨模型归档范式]。

---

## 10. 物理删除互锁（§8.1）

```js
function taskUsageChecks(orgId, taskId) {
  return [
    { model: TaskItem,    filter: { org: orgId, task: taskId }, label: '任务条目',     hint: '请先删除 checklist 条目' },
    { model: TaskReview,  filter: { org: orgId, task: taskId }, label: '任务核查记录', hint: '请先删除核查历史' },
    { model: TaskComment, filter: { org: orgId, task: taskId }, label: '任务评论',     hint: '请先删除评论' }
  ]
}
```

**业务硬门**：`status=submitted`（待审）/`approved`（已完成）禁止物理删除，挡板提示走 `removableCheck`。

**预检端点** `GET /tasks/:id/removable-check`：`task.read` 持有者即可调，前端 `DestructiveConfirm` 用 `:precheck` prop 接入。

---

## 11. 端点编号

MM=39（避开 article=36 / video=38），R-3900~R-3919 共 20 个主体端点 + R-3920/R-3921 归档 + **R-3922 checklist 条目删除**（2026-07-08 补, 堵物理删除挡板无入口的洞）。详见 [routes-server.md](routes-server.md) §MM=39。

---

## 12. 不在 Task 模块范围内

- **家长侧任务**：走 C 端 `PendingConsents` / 通知中心；本模块仅服务员工
- **学生作业**：走 `StudentWork`（已存在）
- **自动排课**：走 `LessonSchedule`（已存在）
- **招生跟进活动流**：走 `LeadActivity`（已存在）
- **财务对账流程**：可由 Task 模板承载（"每月 5 号财务对账"），不与 `FinanceTransaction` 联动

---

## 13. 变更记录

- 2026-07-08 立项：MM=39 任务模块上线，6 表 + 20 端点 + 5 视图 + 周期任务模板 + cron
- 2026-07-08 补：R-3922 `DELETE /tasks/:id/items/:itemId` — 配合挡板, 让用户清空 checklist 后能物理删除任务 (R-3904 业务硬门 `submitted/approved` → 走归档, 但其他状态仍可走物理删除, 需先清空条目)
