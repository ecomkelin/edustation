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
    deeplink: String               // /pages/lesson/detail?id=xxx
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

### 3.5 触发点（2026-07-11 MVP）

| type | category | 触发位置 | scheduledFor | 默认渠道 |
|---|---|---|---|---|
| `lesson_remind_1h` | lesson | `lessonSchedule.generateAttendancesForSchedule` | plannedStart-1h | inbox |
| `task_due` | task | `taskCron.notifyDueToday` (每分钟 tick) | null（即时） | inbox |

**未接入**（Phase 2+）：
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

### 3.7 C 端 me 端点范式

所有 `/me/*` 跳过 `requirePermission`，仅校验 `activeStudent`（沿用 c-end-me-endpoint-pattern，参考 [R-2078/R-2079](routes-server.md) 范式）。

`/me/unread-count` 用 `countDocuments` 聚合管道只返 count，不拉详情。

## 4. 路由（MM=40，详见 routes-server.md §40）

- R-4001 POST /notifications/publish (notification.send)
- R-4002 GET /notifications/me (activeStudent)
- R-4003 GET /notifications/me/unread-count
- R-4004 POST /notifications/:id/read
- R-4005 POST /notifications/me/read-all
- R-4006 POST /notifications/:id/archive
- R-4007 POST /notifications/me/archive-all
- R-4008 GET /notifications/me/preferences
- R-4009 PUT /notifications/me/preferences
- R-4010 GET /notifications/templates (notification.read)
- R-4011 PUT /notifications/templates/:type/:channel (notification.write)
- R-4012 GET /notifications/admin/logs (notification.read)

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

- **大量 inbox 累积**：Notification 是无限增长实体；复用 §8.2 软归档；NotificationLog TTL 30d 自动清理
- **cron 单点**：notificationCron 单进程跑，复用 archiveCron 范式（setInterval + tickAll + unref）
- **隐私**：通知正文严禁身份证/卡号；模板渲染白名单字段
- **微信订阅消息申请**：Phase 2 依赖机构先在微信公众平台申请模板 ID，提前 1 周提醒
- **触发点遗漏**：MVP 仅 2 个 type；后续接入需逐个 audit publish 调用