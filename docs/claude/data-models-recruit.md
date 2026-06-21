# 数据模型 - 招生试听（Parent + ChildLead + TrialBooking + LeadActivity）

> **何时读这个文件**：改招生、潜客管理、家长业务档案、试听预约、转化流程、lifecycle 状态机时读。
> **一行摘要**：2026-06 重构 — Parent（家长业务档案，1:N ChildLead）+ ChildLead（孩子潜客）+ TrialBooking（试听预约）+ LeadActivity（触点日志），完整替代原 Lead 单模型。

---

完整业务规划见 [`../../.claude/plans/staged-roaming-honey.md`](../../.claude/plans/staged-roaming-honey.md)。

> **2026-06 重大调整**: 引入 **Parent + ChildLead 二分模型** 替代原单 `Lead` 模型
> - 触点/家长沟通/二次预约都是**家长维度**；原 Lead = 孩子维度，1 家长带多孩时多孩散落，销售无法批量跟进，跨年重试无法识别
> - Parent = 业务档案，1:N ChildLead；User (登录账号) 与 Parent 解耦，首个 ChildLead 转化时才 upsert
> - 试听仍 = 数据跟踪，**不**走排课系统 (`LessonSchedule`)；详见下文

---

> 所有外键使用小写实体名（如 `parent`、`student`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

---

## 核心实体（4 个 + 1 兼容字段，2026-06）

### Parent（家长业务档案，collection `parents`）

- 业务唯一键 `(org, phone)`：业务上 1 家长 1 手机号
- 与 User (登录账号) 解耦，`user` 字段首孩转化时回填
- **状态 `lifecycle` enum**：
  - `new` — 刚登记，所有孩子未报名
  - `partial` — 部分孩子报名（1 家长多孩，1 个已签）
  - `full` — 所有孩子都报名
  - `lost` — 打了 '已流失' LeadTag
  - `dormant` — 超 6 个月未联系（阶段 2 定时任务翻）
- **业务归因**：`promoteBy`（推广人）、`consultant`（咨询师）、`source`（渠道）、`referrer`（老带新指向另一 Parent）
- **触点快照**：`firstContactedAt` / `lastContactedAt/By`（冗余，由 createActivity 同步刷，真值在所有 ChildLead 触点）
- **标签**：`tags: [ObjectId<Category>]` — 套 Category 字典（`model='LeadTag'`）
- **跨年记忆**：`lastTrialAt`、`lastTrialYear`（阶段 2 dormant 判定）

### ChildLead（孩子潜客，collection `child_leads`）

- 替代原 Lead，1 Parent : N ChildLead
- **状态机**：`pending → contacted → scheduled → tried → converted | lost`（与原 Lead 一致）
- **转化结果**：`convertedStudent/At/Remark`（回填 Student，后续逻辑不依赖 Parent 关系）
- **跨年重试**：`sameAs: [ObjectId<ChildLead>]` — 链式追溯，2027 年新建 childLead.sameAs 指向 2026 childLead
- **1 孩多课**：`trialSubjects: [ObjectId<Subject>]`（数组，录入时按长度建 N 笔 TrialBooking，attemptNo=1..N）；`trialSubject` 字段是 trialSubjects[0] 快照

### TrialBooking（试听预约，collection `trial_bookings`）

- ChildLead 1:N（替代原 Lead 1:N）
- `preStudent: ObjectId<ChildLead>`（替代原 Lead）
- `parent: ObjectId<Parent>`（冗余，加速"该家长所有试听"查询）
- `consultant: ObjectId<User>`（谈单老师，与 teacher 上课老师分离）
- `result.negotiateTeacher` 是 consultant 的 alias（兼容老数据）
- 其余字段与原 Lead 模型一致（`joinMode` / `lessonSchedule` / `room` / `scheduledAt` / `status` / `result` 等）

### LeadActivity（触点日志，collection `lead_activities`）

- ChildLead 1:N
- `lead: ObjectId<ChildLead>`（替代原 Lead 引用）
- 触点类型 `call/wechat/visit/sms/note`
- 创建时同步刷 ChildLead + Parent 触点快照

### LessonSchedule.isTrialLesson（2026-06 deprecated）

保留字段（兼容历史数据），排课 UI 默认过滤 `isTrialLesson=false`；新流程不再创建 `isTrialLesson=true` 的排课。

## Category 字典（2026-06 扩展）

- `model` enum 加 `'LeadTag'`（家长标签字典，被 `Parent.tags` 引用）
- 预设标签：高意向 / 非目标客户 / 倾向他课 / 价格敏感 / 距离太远 / 年龄不合适 / 家庭条件 / 已流失
- 加 '已流失' 标签自动 `lifecycle='lost'`；删 '已流失' 标签触发 lifecycle 重算

## 录入家长账户 + 第一个孩子（1 API 核心）

- `POST /api/v1/parents/with-child` — 1 API 创建 Parent + 1 ChildLead + N TrialBooking
- 软唯一：同 org 下 phone 命中 → 返回 `{duplicate: true, parent}` (200)；`body.force=true` 跳过
- `withChild` 内部自动建 N 笔 TrialBooking（attemptNo=1..N, status=awaiting_schedule）
- 同家长加孩：`POST /api/v1/parents/:id/children`（parentId 已存在，只建 ChildLead + N TrialBooking）

## 批量排试听日程（2026-06 简化）

- 端点 `POST /api/v1/trial-bookings/batch-schedule`
- **语义**："批量更新 N 个 TrialBooking 自身字段"，**不创建 LessonSchedule**
- **入参**：`bookingIds: [...], plannedStartTime, plannedEndTime, teacher, room?`（room 可空）
- **流程**：校验入参 → 拉所有 booking，全部 `status='awaiting_schedule'` → 校验 teacher/room 存在 → 算 `durationMinutes` → `updateMany` 写入 `scheduledAt/scheduledDuration/teacher/room/joinMode='solo'/status='scheduled'` → 翻对应 `ChildLead.status='scheduled'`
- **混合多课**：N 个 booking 允许 subject 不同，排课不覆盖 booking 自身 subject
- **跟班试听**（attached 模式，单笔）：`POST /api/v1/trial-bookings` 关联已有正常 LessonSchedule，字段从 schedule 拷贝

## 再约一次（2026-06 调整）

- `POST /api/v1/trial-bookings/:id/reschedule` 现在允许 `no_show` **和** `cancelled` 状态触发（1 行修复）
- 写 LeadActivity 记录"第 X 次未到/取消，重新约第 Y 次" + 新 TrialBooking（attemptNo=max+1）+ 内部调 batchSchedule

## 1 孩多课 + 1 家长多孩 业务模型（2026-06 强化）

- **1 孩可试多门课**：ChildLead.trialSubjects 数组，录入时按长度建 N 笔 TrialBooking，attemptNo=1..N
- **1 家长带多孩**：1 Parent : N ChildLead；软唯一在 Parent.phone（同 org）；销售 / 教务在 Parent 详情点"+ 加一个孩子"弹 ChildLeadEditDialog（parentId 预填）
- **跨年重试**：ChildLead.sameAs 链式追溯，2027 年新建 childLead.sameAs 指向 2026 childLead；Parent.lifecycle 从 dormant 激活
- **二次试听**（同孩 / 同家长 隔期再试）：`attemptNo` 递增，旧 booking 保留作审计

## 为现有孩子新建预约入口（2026-06-20）

`POST /api/v1/trial-bookings/for-child` — 解决"取消后再约"/"漏录科目"/"已转化想再试"场景。

详见 [memory: create-booking-for-child-entry]。

## Parent.lifecycle 状态机（2026-06 核心）

**触发自动重算**：

- `childLead.service.unconvert` 撤销转化后
- `trialBooking.service.convert` 转化后（1 家长带多孩，**不再**自动 mark 其他 ChildLead；哪个孩子真转化，哪个孩子真建 Student）
- `parent.service.addChild` 加孩后
- `parent.service.addTag/removeTag` 涉及 '已流失' 时强制

**手动重算**：`POST /api/v1/parents/:id/recompute-lifecycle`

**推导逻辑**：

- `total === 0 || converted === 0` → `'new'`
- `converted < total` → `'partial'`
- `converted === total` → `'full'`
- 打了 '已流失' 标签或全 lost → `'lost'`

**`converted` 数法**：`ChildLead.countDocuments({parent, convertedStudent: { $ne: null }})`（数真建了 Student 的，避免虚高）

历史（2026-06 初次重构）数 `status='converted'`，会把 auto-mark 的兄弟也算进去；2026-06-16 删 auto-mark 后改用此条件。

## 转化两步式（claim token 模式，2026-06 改造；2026-06-16 去 auto-mark）

- 试听完成后（`status=completed`，`result.isEnrolled=true`）触发转化
- `POST /api/v1/trial-bookings/:id/convert-preview` 返回 `initialPassword` + 即将创建 User/Student 预览；若 parent.user 已存在，标注 `alreadyExists: true`，复用现有 User
- `POST /api/v1/trial-bookings/:id/convert` 真提交：
  1. **Claim token**：`findOneAndUpdate({_id, status='completed', 'result.isEnrolled':true, 'result.enrolledAt':null}, {$set: {'result.enrolledAt': now}})` — 原子翻转，重试安全
  2. **User upsert**（仅首次）：`findOneAndUpdate({mobile: parent.phone}, {$setOnInsert: {mobile, passwordHash: bcrypt(parent.phone.slice(-6)), realName: '家长-'+parent.phone.slice(-4), requirePasswordChange: true}}, {upsert: true, new: true})` — 同 phone 下首孩建，次孩复用
  3. **UserOrgRel upsert**：查"家长" Position
  4. **Parent.user 回填**（仅首次）：`Parent.findOneAndUpdate({_id: parent._id, user: null}, {$set: {user: user._id}})`
  5. **Student create**：从 ChildLead 拷 name/gender/school/grade/className
  6. **ChildLead 写回**：status='converted'，convertedStudent/At/Remark
  7. **(2026-06-16 取消) 同 Parent 下其他 ChildLead 自动 mark**：之前用 `ChildLead.updateMany` 把兄弟翻 'converted' + remark='同家长其他孩子已报名'，但**只翻状态不建 Student**，销售误以为都建了账号，实则不然；改为"逐个转化"才真建学员档案
  8. **Parent.lifecycle 重算**：`parent.service.recomputeLifecycle`（数 convertedStudent != null）
  9. 返回 `{idempotent, initialPassword, user, student, childLead, parent: {lifecycle}, undoWindowMs}`
- **不用 mongoose 事务**（单节点 Mongo 不支持）；用 upsert 链 + claim token 模式实现重试安全

## 5 分钟撤销窗口

`POST /api/v1/child-leads/:id/unconvert`（改路径，旧 `/leads/:id/unconvert` 已下线）

- 校验 `convertedAt` 在 5 分钟内
- 校验 Parent.user 没用作其他 ChildLead.convertedStudent 主监护人
- **不级联**回退同 parent 下其他"自动转化的" ChildLead（2026-06-16 后这分支不会命中，因为没有 auto-mark；业务上的兄弟转化是逐个点 convert，各管各的）
- User 仅在"无其他 converted 兄弟"时删；否则保留 User 但从 Parent.user 解绑
- 物理删 Student（校验无下游引用）
- 重算 Parent.lifecycle

## 初始密码策略

- 新建家长 `User.passwordHash = bcrypt(mobile.slice(-6))`（手机号后 6 位）
- `User.requirePasswordChange = true`
- `auth.service.login` 在响应里返回 `requirePasswordChange: true`
- 前端 auth store 存该标志，路由守卫（`router/index.js` beforeEach）拦截任何非 `/reset-password` 访问，强制跳改密页
- `auth.service.changePassword` 改密成功后清掉 `requirePasswordChange` 标志

## 权限码（复用 `recruit` 组，不新增）

- `recruit.read` — 列表/详情/触点时间线/标签
- `recruit.write` — 新建/编辑/加孩/批量排日程/打卡/完成
- `recruit.convert` — 转化预览/转化执行/撤销转化
- 共享给 Parent + ChildLead + TrialBooking 三个模块，减少权限码数
- 加到 `管理员` 和 `教务` 系统职位（默认）；不加到 `老师`/`家长`/`财务`
- 历史机构通过 `migrate-add-recruit-perms.js` 一次性补（$addToSet + $nin 前置过滤，幂等）
- 销售/教务分级：服务端在 `parent.service.list` 时，若用户无"看全部"权限强制 `promoteBy=me`（`scope=mine`）；教务可看全部

## 删除保护（与 CLAUDE.md §8.1 互锁）

- `lessonSchedule.lessonScheduleUsageChecks` **第三项**保留：`TrialBooking.lessonSchedule=scheduleId`（仅 attached 模式命中）→ 阻挡物理删除
- `parentUsageChecks`（Parent 删）：`ChildLead` + `TrialBooking` + `LeadActivity`（via childLead 派生）引用都阻挡
- `childLeadUsageChecks`（ChildLead 删）：`TrialBooking` + `LeadActivity` 引用都阻挡
- 物理删除走 `requirePlatformPassword`（高风险）

## 招生看板（2026-06 新增）

- `GET /api/v1/reports/recruit-promoter` — 推广人员 ROI（按 Parent.promoteBy 聚合：家长数/孩子数/转化数/转化率）
- `GET /api/v1/reports/recruit-teacher-conversion` — 试听老师转化率（按 TrialBooking.teacher 聚合：试听过/到店/完成/已报名/转化率）
- 看板权限码 `recruit.read`（挂在 `recruit` 组，不复用 `report.read`）
- 阶段 2 再做：`recruit-parent-lifecycle`（家长生命周期分布） + `recruit-source-roi`（渠道 ROI）

详见 [dashboards.md](./dashboards.md)。

## 老师"试听日程"视图（未来）

老师"我的日程"原本只看 LessonSchedule；2026-06 起，还要 union 查 `TrialBooking.teacher=me, status ∈ {scheduled, arrived}`。
当前排课日历只显示 LessonSchedule，老师若要查"今天我有几节试听"，需进 `/recruit/trial-bookings` 看板按"试听老师=me"过滤（TODO：阶段 2 加统一日程聚合）。

## 迁移 & 启动清理

- 旧 Lead 模型（collection `leads`）/ LeadActivity（collection `lead_activities`）**完全下线**（2026-06 重构）
- `../packages/server/src/utils/startupMigrations.js#dropLegacyLeadCollections` 在 server 启动时主动 drop 这两个 collection（开发期兜底）
- 业务上是假数据，不需要数据迁移脚本
