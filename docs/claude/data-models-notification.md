> 何时读这个文件：改推送通知 / 通知模板 / 用户偏好 / 渠道分发 / inbox / 红点 / 发送流水 时。

# 通知模块（Notification Module）— v0.9 立项

## 1. 业务定位

edustation 的「家长触达」基础设施。三层架构：

```
Layer 1 — Notification 模型（消息落库 / 红点 / 审计）── inbox 必到
Layer 2 — NotificationService.publish（拉偏好 → 计算可用渠道 → 调度）
Layer 3 — ChannelAdapter（inbox MVP / wechatMini P2 / sms P3 / push P3 / ws P4）
```

**关键设计原则**：

1. **Inbox 永远可达**：所有通知必落库，红点常驻；用户可在 C 端「消息 → 系统消息」翻历史
2. **Per 类型可关闭**（per-category）：用户关掉"课前提醒"的外发，但 inbox 仍可见
3. **Per 渠道可关闭**（per-channel）：用户不开"短信"，即使手机号存在也不发
4. **能力自动降级**：用户开"微信"但没绑微信 → capability=false → 跳过该渠道
5. **系统类不可关**：agreement_remind 等机构合规通知只能关总开关
6. **隐私红线**：通知正文严禁身份证/卡号；模板渲染走白名单字段

## 2. 数据模型（4 个）

### 2.1 `Notification` — 消息中心条目

```js
{
  org: ObjectId,                   // 多租户
  recipient: ObjectId,             // 接收人 User._id
  recipientRole: { type: String, enum: ['parent', 'staff', 'platform'], default: 'parent' },
  activeStudent: ObjectId,         // 业务关联的学员（C 端切孩子用）

  type: String,                    // lesson_remind_1h / task_due / order_paid / ...
  category: String,                // lesson / task / order / evaluation / point / pet / access / system

  title: String,                   // 渲染后
  body: String,                    // 渲染后

  payload: {
    entityType: String,
    entityId: ObjectId,
    deeplink: String               // /pages/schedule/detail?id=<lessonScheduleId> (R-1494, 2026-07-18)
  },

  status: { type: String, enum: ['unread', 'read', 'archived'], default: 'unread' },
  readAt: Date,
  archivedAt: Date,

  channels: [{                     // 渠道分发明细（per 渠道独立行）
    channel: String,               // inbox / wechatMini / wechatPublic / sms / push / websocket
    status: String,                // pending / sent / failed / skipped
    reason: String,                // opted_out / no_capability / rate_limited / invalid_target
    externalId: String,
    sentAt: Date,
    error: String
  }],

  scheduledFor: Date,              // null=即时；非空=定时发送
  source: { type: String, enum: ['event', 'cron', 'manual'], default: 'event' },
  meta: Mixed
}
```

**索引**：
- `{recipient, archivedAt, createdAt: -1}` — inbox 主查询
- `{recipient, status}` — 红点未读数
- `{recipient, activeStudent, status}` — 按孩子过滤
- `{scheduledFor, 'channels.status'}` — cron 待发扫描
- `{org, type, createdAt}` — 统计/管理后台

### 2.2 `NotificationPreference` — 用户偏好（per user per org）

```js
{
  user: ObjectId,                  // unique with org
  org: ObjectId,                   // 跨机构独立

  globalEnabled: { type: Boolean, default: true },

  categories: {                    // per 大类
    lesson:     { enabled: Boolean, channels: [String] },
    task:       { enabled: Boolean, channels: [String] },
    order:      { enabled: Boolean, channels: [String] },
    evaluation: { enabled: Boolean, channels: [String] },
    point:      { enabled: Boolean, channels: [String] },   // 默认 false
    pet:        { enabled: Boolean, channels: [String] },   // 默认 false
    access:     { enabled: Boolean, channels: [String] },
    system:     { enabled: Boolean, channels: [String] }    // system 仅 globalEnabled 控
  },

  channels: {                      // per 渠道 (capability 由系统派生)
    inbox:        { enabled: true,  capability: true  },    // 永远
    wechatMini:   { enabled: true,  capability: <绑微信?> },
    wechatPublic: { enabled: false, capability: <绑微信?> },
    sms:          { enabled: false, capability: <有手机?> },
    push:         { enabled: false, capability: false }
  },

  quietHours: {                    // P2
    enabled: Boolean,
    start: '22:00',
    end: '08:00'
  }
}
```

**索引**：`{user, org}` unique

### 2.3 `NotificationTemplate` — 模板

```js
{
  org: ObjectId,                   // null = 平台默认；非 null = 机构自定义
  type: String,
  channel: String,                 // inbox / wechatMini / wechatPublic / sms / push
  title: String,                   // 含 {studentName} {courseName} {time} {room} 等占位符
  body: String,
  wechatTemplateId: String,        // P2 微信订阅消息模板 ID
  smsTemplateCode: String,         // P3 短信平台模板 code
  isActive: { type: Boolean, default: true },
  meta: Mixed
}
```

**索引**：
- `{org, type, channel}` unique（org 非空时 partialFilterExpression）
- `{type, channel}` unique（org=null 时）
- `{type, channel, isActive}` — 列表

### 2.4 `NotificationLog` — 发送流水（审计）

```js
{
  org, notification: ObjectId, channel, status,
  request: Mixed, response: Mixed, error: String,
  retryCount: Number, sentAt: Date
}
```

**TTL**：30 天（`expireAfterSeconds: 30*86400`）

## 3. 业务规则

### 3.1 publish 流程（核心入口）

```
NotificationService.publish({ orgId, recipientId, type, payload, vars, scheduledFor, source })
  │
  ├─ 1. 拉模板（org+type → 渲染占位符 → title/body）
  ├─ 2. 拉偏好（user+org → NotificationPreference）；不存在则懒创建
  ├─ 3. 计算可用渠道 = intersection(模板.channels ∩ category.enabled ∩ channel.enabled ∩ channel.capability)
  ├─ 4. 创建 Notification 文档（channels[] 初始化 status=pending，inbox 永远在第一行）
  ├─ 5. 调度：
  │     scheduledFor=null → 立即 send
  │     scheduledFor!=null → 写 cron queue（notificationCron 每 5 分钟 tick）
  └─ 6. ChannelAdapter.send() → 回写 channel.status + 写 NotificationLog
```

### 3.2 默认偏好策略（懒创建）

- **globalEnabled**: true
- **categories**：
  - lesson / task / order / evaluation / access / system = enabled=true, channels=['inbox']
  - point / pet = enabled=false
- **channels**：
  - inbox: enabled=true, capability=true（永远）
  - wechatMini: enabled=true, capability=绑微信?
  - wechatPublic / sms / push: enabled=false

### 3.3 能力自动计算

`prefService.computeCapability(user)`：
- inbox: 永远 true
- wechatMini / wechatPublic: `user.wechatUnionId` 非空 → true
- sms: `user.mobile` 非空 → true（mobile 在 User schema 是必填 unique）
- push: 永远 false（无 UniPush 集成）

### 3.4 模板占位符白名单

```js
const PLACEHOLDER_KEYS = new Set([
  'studentName', 'courseName', 'time', 'endTime',
  'room', 'teacherName', 'orgName', 'orderNo',
  'amount', 'points', 'days', 'reason'
])
```

渲染时仅替换白名单字段；未提供的占位符保留原文（便于排查）。

**严禁渲染**：身份证号、银行卡号、密码哈希、家庭住址等敏感字段。

### 3.5 触发点

#### MVP 上线（2026-07-11, 2 个）

| type | category | 触发位置 | scheduledFor | 默认渠道 |
|---|---|---|---|---|
| `lesson_prepare_reminder` | lesson | `lessonSchedule.prepare()` (教务点「准备上课」按钮) | null（即时） | inbox |
| `task_due` | task | `taskCron.notifyDueToday` (每分钟 tick) | null（即时） | inbox |

#### v0.9 扩展（2026-07-13, +5 员工侧触发点）

**业务事件驱动，全部走 service 内 publish() + setImmediate fire-and-forget**。

| type | category | 触发位置 | 接收人 / recipientRole | 默认渠道 |
|---|---|---|---|---|
| `lesson_preparing` | lesson | `lessonSchedule.prepare()` 内（与 `lesson_prepare_reminder` 并存） | `LessonSchedule.teacher` / `staff` | inbox |
| `task_assigned` | task | `task.service.create()` 全体 / `update()` diff 新增 | 新增的 `assignees[].user` / `staff` | inbox |
| `task_rejected` | task | `task.service.review()` rejected/requested_changes 分支 | 所有 `assignees[].user` / `staff` | inbox |
| `task_approved` | task | `task.service.review()` approved 分支 | 所有 `assignees[].user` + `creator` / `staff` | inbox |
| `task_cancelled` | task | `task.service.cancel()` | 所有 `assignees[].user` + `supervisors` + `creator` / `staff` | inbox |

**幂等设计**：
- `lesson_preparing` / `lesson_prepare_reminder`：状态机幂等 (`scheduled → preparing` 单次)，重复点会抛 400 不重复发
- `task_rejected` / `task_approved`：状态机幂等 (`submitted → rejected/approved` 单次)
- `task_cancelled`：状态机幂等（终态不可重复 cancel）
- `task_assigned`：`update` 时 diff 旧 `assignees` 集合，只对新加入者发；`create` 时全体发

**模板占位符（5 条新模板）**：
- `taskTitle` 任务标题
- `actorName` 操作人姓名 (creator / reviewer / canceller)
- `comment` 审批意见 / 取消原因
- `score` 审批打分（可选）
- `dueAt` 截止时间 (友好文本)
- `priority` 优先级 (友好中文：紧急/高/普通/低)
- `studentNames` 多个学生拼接 ("张三、李四" 或 "张三... 等 8 人")

**架构要点**：
- 所有触发点共用 `notificationService.publish({ recipientRole: 'staff', ... })`，不发家长 `parent`
- 失败不阻塞主流程：service 内 `setImmediate(() => publish().catch(console.warn))`
- 模板缺失 fallback：title = type, body = type（管理员可后期补模板）

**新增 type 流程（2026-07-14 新增约定）**：

type 是"业务代码 ↔ 模板"约定的字符串，**必须三处同步**：

1. **数据库** — `packages/server/scripts/db/seeds/notification-templates.seed.js` `TEMPLATES` 数组加一条
2. **Admin UI** — `packages/admin/src/constants/notificationTriggers.js` `NOTIFICATION_TRIGGERS` 加一条
3. **业务代码** — 在对应 service 内 `setImmediate(() => publish({ type: 'xxx', ... }))`

漏一处：
- 漏 seed → 上线后 admin 看得到 type 但模板没文案，走 fallback 丑陋
- 漏 constants → admin UI 表格行变成 "?" 兜底 + 灰感叹号，用户懵
- 漏 publish → 写的模板永远没机会发，孤儿

**新增 type 检查清单**：

- [ ] seed 文件加 (TEMPLATES.push)
- [ ] constants 加 (NOTIFICATION_TRIGGERS.push)
- [ ] 业务代码 publish 调用点确定 (task / lessonSchedule / 未来 pointsCron 等)
- [ ] 占位符白名单 PLACEHOLDER_KEYS 确认足够 (notificationTemplate.service.js)
- [ ] 占位符 chip 标签补 (Templates.vue PLACEHOLDERS 数组)
- [ ] docs/claude/data-models-notification.md §3.5 触发点表加一行
- [ ] docs/claude/routes-server.md 看是否需要新 R 号 (新 publish / 新端点)
- [ ] MEMORY 不写, 这是 code/data 同步规则不是一次性教训

#### 未接入（Phase 2+）

- lesson_remind_24h / lesson_absent
- order_paid / order_refunded
- evaluation_published
- point_grant / point_deduct
- pet_critical
- access_stranger（accessControl P1-1）
- system_notice

### 3.6 软归档（CLAUDE.md §8.2）

- inbox 默认 list 隐藏 archivedAt 非空（`?archived=true` 才看历史）
- 详情 `?includeArchived=true` bypass 403（归档 tab 跳详情用）
- 写操作拦截：`if (doc.archivedAt) throw 422('已归档, 不可操作')`

#### 3.6.1 客户端删除 = archive + 90d 物理清理（2026-07-18）

**业务定位**：C 端用户看 inbox 想要"删除"按钮，但 inbox 永远可达（§1 设计原则）不能直接物理删。
采用"两步走"：

1. **客户端"删除"= 调 R-4006 archive（软归档）**
   - UI 层（C 端 InboxList 长按 ActionSheet / admin StaffInbox 行内删除按钮）调 archive 端点
   - archive 行为：`archivedAt = now`，若 unread 自动 `status = 'read'`
   - 用户视角"删了"，但 DB 还留着（兜底可恢复窗口）
2. **`notificationPurgeCron` 每 24h 物理删除 90d+ 归档**
   - 阈值常量：`ARCHIVE_TTL_DAYS = 90`（与 StaffInbox.vue 注释"默认存留 90 天"对齐）
   - 过滤：`{ status: 'archived', archivedAt: { $ne: null, $lt: now-90d } }`
   - `leaderElect: true` 多副本仅 leader 跑（deleteMany 幂等但减 db 流量）
   - 注册到 `cronRegistry`，R-4102 手动 trigger 端点可见
   - 启动于 `main.js` 1.5.6，与 archiveCron / notificationCron 并列

**为什么是 90d 不是更短**：
- 太短（≤7d）：用户误删无救
- 太长（≥365d）：inbox 无限增长，索引膨胀
- 90d 是行业惯例（Gmail 30d 垃圾桶，企微 90d 撤回窗口），与 StaffInbox 文案一致

**不直接给客户端 DELETE 端点的原因**：
- inbox 永远可达是核心设计原则
- 物理删除需要审计（误删无法追查）
- 现有 R-4006 archive 已能覆盖"用户视角删除"语义，UI 层翻译即可

### 3.7 C 端 me 端点范式

所有 `/me/*` 跳过 `requirePermission`，仅校验 `activeStudent`（沿用 c-end-me-endpoint-pattern，参考 [R-2078/R-2079](routes-server.md) 范式）。

`/me/unread-count` 用 `countDocuments` 聚合管道只返 count，不拉详情。

### 3.8 消息详情页范式 (2026-07-18)

R-4019 `GET /notifications/:id` 是 inbox 单条详情端点，**员工/家长共用**，资源属主校验（`recipient == req.user.id`），**不动 status**。

**为什么需要**：
- 之前 InboxList / StaffInbox 点消息直接 `uni.navigateTo(deeplink)` → 跳业务页 (课程详情 / 任务详情)
- 但很多场景用户**只想看完整 body**（2 行省略看不出全貌），不想真跳业务
- 任务审批打回 / 订单退款等长文本通知尤其需要展开

**范式（端到端）**：
```
InboxList.onTap  ─┐
                  ├→  markRead (幂等, 兜底) + uni.navigateTo detail
StaffInbox.onItem ─┘
  ↓
detail.vue.onLoad/mounted
  ├─ 1. detail(id)        // R-4019, 资源属主校验
  ├─ 2. markRead(id)      // 幂等, 推迟到进详情才算"真看"
  ├─ 3. 渲染 hero + body (完整) + meta + channels[] + 「前往查看」/「删除」footer
  └─ 4. 「前往查看」按钮 → 显式 navigateTo(payload.deeplink)
```

**markRead 双重触发** (tap 一次 + detail onLoad 一次) 都幂等, 不出问题:
- tap 即 mark: 「瞥一眼列表」也算看过, 红点立刻少
- detail onLoad 再 mark: 兼容「列表里没 mark 但跳 detail」的场景 (防御性, 当前 flow 不会触发)
- 服务端 markRead 已写 `if (doc.status === 'unread')` 守门, 重复调 0 影响

**为什么 R-4019 不动 status**:
- 跟 markRead 职责分离, 详情只是「看」, 不强制改状态
- 前端可以决定何时 mark (tap 即 mark / 进 detail 才 mark / 都 mark)
- 未来想加「已读回执」「最后查看时间」等元数据, 不影响 status 字段

**为什么不做 /notifications/me/:id**:
- 单条详情**不带 activeStudent 上下文** (员工 / 平台超管也要看, 不能挂 activeStudent middleware)
- 公共区 `/:id` 段最干净, 服务端资源属主校验足够防越权

**C 端 / admin 平行设计**:
- C 端: `pages/notification/detail.vue` + `/pages/notification/detail?id=xxx` (uni-app uni.navigateTo)
- admin: `views/notifications/Detail.vue` + `/notifications/inbox/:id` (vue-router push)
- 共用 R-4019 + 同一套 field rendering (title/body/meta/channels), 但 UI 范式不同:
  - C 端: 移动端纵向滚动 + sticky footer 操作
  - admin: 桌面端 el-card 三段 + 右上角 el-page-header 返回

**数据**:
- 返回完整 doc (含 channels[] / payload / meta / readAt / archivedAt)
- 前端渲染 channels[] 时展示「渠道 / 状态 / 发送时间 / 错误」, 给用户审计透明度
- 状态/原因翻译表 (C 端 + admin 复用, 详见各端 detail.vue)

### 3.9 业务通知 deeplink 跳法约定 (2026-07-18)

家长 / 员工从 inbox 详情页点「前往查看」,deeplink 跳哪一页有讲究:

| 通知 type | 接收人 | deeplink 模板 | 跳到 | Why |
|---|---|---|---|---|
| `lesson_prepare_reminder` (上课通知) | 家长 | `/pages/schedule/detail?id=<lessonScheduleId>` | **课程详情(单节)** (R-1494) | 家长想看"我这节课", 不是单纯考勤 row |
| `lesson_preparing` (排课准备) | 员工 | `/admin/schedule?highlight=<lessonScheduleId>` | admin 日历 (高亮) | 教务回日历继续准备, 没有详情路由 |
| `task_*` / `order_*` / `evaluation_*` | 员工/家长 | 业务路由 (admin 或 C 端) | 业务详情 | — |

**易错点**:
- ❌ `lesson_prepare_reminder` 一开始写的是 `/pages/attendance/detail?attendanceId=...` —— 跳进去只看到考勤状态, **没有课程名/老师/教室/作品/课评**, 用户反馈"该跳课程详情不是考勤"
- ✅ 改成 `/pages/schedule/detail?id=<lessonScheduleId>` —— 页面带完整课时信息, 考勤作为子模块挂下面
- 员工 `lesson_preparing` 不能复用同一个 C 端路由 (admin 没用 uni-app), 走 admin 日历 highlight 是 D2-A 决策的妥协 (admin/schedule/:id 路由不存在)

**deeplink 拼装点**: `lessonSchedule.service.js` 的 `publishLessonPrepareReminder` (家长) + `publishLessonPreparingToTeacher` (员工), 改 deeplink 时同步改这里。

### 3.10 模板「启用本机构」v4 范式 (2026-07-18)

**用户语义 (v4)**: 「本机构开关 = 本机构要不要这条通知」。
- 新机构**默认所有通知都不发** (必须显式启用才会发)
- 开关 off = 通知不发 (不论有没有 platform 默认)
- 开关 on = 通知按本机构副本文案发送 (无副本时 upsert 时以 platform 文案为初始)

**后端 v4 改动**:
1. `getTemplate(orgId, type, channel)` 只查 `org=orgId`, **不再 fallback 到 platform** (org=null)
2. `publish` 入口:
   - `tpl.isActive === false` → `return { skipped: true, reason: 'org_template_disabled' }`
   - `tpl == null` → `return { skipped: true, reason: 'org_template_not_enabled' }` (默认不发)
   - 两者都不进 publish 落库逻辑
3. list 接口仍返 `{ type, channel, org, platform, effective }` (org + platform 都返), **仅用于 UI 预览**, 不参与 publish 路径

**UI v4 改造**:
- 启用列: 单开关, 列名「启用本机构」
- 无 chip (开关本身就是状态)
- tooltip 解释三种语义:
  - 默认 (无 org 副本 + 开关 off): "本机构未启用 (通知不发送)；点击启用后将以平台默认文案为基础创建本机构副本"
  - 开关 off + 有 org 副本: "本机构已停用，点击启用 (通知恢复发送)"
  - 开关 on: "本机构已启用，点击停用 (通知将彻底不发)"
- 顶部说明: 「启用本机构 = 本机构启用该通知 (默认未启用); 停用 = 本机构该通知彻底不发; 重置 = 删除本机构自定义, 回到未启用状态」

**反复迭代记录**:
- v1: 单开关 (UI 看着对, 但 service isActive:true 过滤 fallback 到 platform, toggle 无效)
- v2: 双开关 (本机构 + 平台默认) → 平台默认不该暴露给机构管理员, 复杂
- v3: 单开关 + 三态 chip → 仍然是「未启用=跟随平台默认」, 新机构没主动 toggle 也会发通知
- **v4 (当前)**: 单开关 + 默认未启用, getTemplate 改 org-only, publish 双跳 (org_template_disabled / org_template_not_enabled)

**禁止**:
- ❌ 在 `getTemplate` 继续 fallback 到 platform —— 这是 v4 之前的行为, 必须移除
- ❌ 在 `publish` 找不到 tpl 时兜底 title=type —— 用户没启用就不该有任何通知
- ❌ 在本 UI 暴露「平台默认」开关 —— 平台默认是 SaaS 全局配置, 机构管理员不感知

## 4. 路由（MM=40，详见 routes-server.md §40）

- R-4001 POST /notifications/publish (notification.send)
- R-4002 GET /notifications/me (activeStudent, 家长)
- R-4003 GET /notifications/me/unread-count
- R-4004 POST /notifications/:id/read (员工/家长共用)
- R-4005 POST /notifications/me/read-all
- R-4006 POST /notifications/:id/archive (员工/家长共用)
- R-4007 POST /notifications/me/archive-all
- R-4008 GET /notifications/me/preferences
- R-4009 PUT /notifications/me/preferences
- R-4010 GET /notifications/templates (notification.read)
- R-4011 PUT /notifications/templates/:type/:channel (notification.write)
- R-4012 GET /notifications/admin/logs (notification.read)
- **R-4013** GET /notifications/me/staff (员工 inbox 列表, 不挂 activeStudent) [2026-07-13]
- **R-4014** GET /notifications/me/staff/unread-count (员工红点)
- **R-4015** POST /notifications/me/staff/read-all (员工一键已读)
- **R-4016** POST /notifications/me/staff/archive-all (员工一键归档)
- **R-4017** DELETE /notifications/templates/:type/:channel (机构覆盖 → 重置为平台默认, 幂等) [2026-07-14] — Templates UI「重置」按钮调用
- **R-4018** POST /notifications/templates/reset-all (批量重置本机构全部覆盖, 幂等 deleteMany) [2026-07-14] — Templates UI「全部重置」按钮调用; 不可逆, 前端二级 confirm
- **R-4019** GET /notifications/:id (单条详情, 员工/家长共用, 资源属主校验, 不动 status) [2026-07-18] — 详情页用, 见 §3.8
- **R-4020** PUT /notifications/templates/platform/:type/:channel (平台超管 toggle/编辑平台默认模板, requirePlatformAdmin) [2026-07-18] — Templates UI 「平台默认」开关 (仅超管可见), 见 §3.10

## 5. 权限码（3 个）

- `notification.read` — 所有员工/超管默认有（看 inbox + 流水）
- `notification.write` — 仅机构管理员 + 超管（改模板）
- `notification.send` — 教务/老师（手动补发）

DEFAULT_POSITIONS：
- 管理员 = read + write + send
- 教务 / 老师 = read + send
- 财务 = read
- 家长 N/A（C 端走 /me）

## 6. 实施分阶段

| 阶段 | 范围 | 周期 |
|---|---|---|
| Phase 1 MVP | 4 model + 3 service + inbox adapter + cron + 2 触发点 | v0.9.x，2 周 |
| Phase 1.1 (2026-07-18) | 客户端"删除"按钮 + archive 软归档 + notificationPurgeCron 90d 物理清理 | v0.9.3 |
| Phase 2 | 微信小程序订阅消息 + wechatMini ChannelAdapter | v0.10.x |
| Phase 3 | 短信 (阿里云) + 微信公众号模板消息 | v0.11.x |
| Phase 4 | WebSocket 实时推送 + UniPush | v1.0 |

## 7. 关键决策（2026-07-11）

| 决策 | 原因 |
|---|---|
| chat tab 改名为「消息」+ 二级 tab 切 Inbox/AI | 用户决策 |
| 默认开 lesson/task/order/access，关 point/pet | 用户决策 |
| MVP 仅站内 Inbox | 用户决策（2 周闭环） |
| MM=40（35 audit + 40 跳号 36/37/38 内容 + 39 task） | routes-server.md 编号空间 |
| 触发点先接 lesson_remind_1h + task_due | 字段已埋（LessonAttendance.remindedAt）+ 业务高频 |

## 8. 风险与边界

- **大量 inbox 累积**：Notification 是无限增长实体；复用 §8.2 软归档；NotificationLog TTL 30d 自动清理；**notificationPurgeCron 每 24h 物理清理 archivedAt < now-90d**（2026-07-18）
- **cron 单点**：notificationCron / notificationPurgeCron 单进程跑（leaderElect 多副本只让 leader 跑），复用 archiveCron 范式（setInterval + tickAll + unref）
- **隐私**：通知正文严禁身份证/卡号；模板渲染白名单字段
- **微信订阅消息申请**：Phase 2 依赖机构先在微信公众平台申请模板 ID，提前 1 周提醒
- **触发点遗漏**：MVP 仅 2 个 type；后续接入需逐个 audit publish 调用