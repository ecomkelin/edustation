# 人脸识别门禁 — 设计决策与架构

> 本文件是 accessControl 模块的**单一真理源（Single Source of Truth）**。
> 改代码前先看这里；改完代码后必须同步更新这里。

---

## 1. 三个关键决策

### 决策 #1：业务范围 = 学员到校识别 + 家长接送核验

**候选方案**：

| 范围 | 评估 | 决策 |
|------|------|------|
| 学员到校识别 only | PoC 简单 | ❌ |
| 学员到校 + 家长接送 | 闭环 | ✅ |
| 全场景（员工考勤 + 陌生人告警 + 门锁远程） | 大而全 | ❌ v2 |

**trade-off**：放弃"员工考勤"场景是因为教务/老师的考勤已有 SaaS 标准方案，硬件绑定会让离职/转岗变复杂；放弃"陌生人告警"是因为 PoC 阶段短信/语音推送链路复杂（unipush 申请 + 厂商认证 1 周），先把闭环跑通。

### 决策 #2：电子同意书 = 家长端小程序签

**候选方案**：

| 方案 | 评估 | 决策 |
|------|------|------|
| 纸质签字 → 后台录入 | 体验差、留痕弱 | ❌ |
| 家长端小程序签 | 体验最佳、留痕强 | ✅ |
| 现场一体机弹窗签 | 学员/陪同人流量大时拥堵 | ❌ |

**落地**：
- 复用 `UserConsent` collection（加 `subjectType` + `subject` 字段）
- 复用 `LegalDoc` 存 3 条 docKey（`face-consent-student` / `-pickup` / `-staff`）
- 新机构创建时由 `startupMigrations.seedFaceConsentDocs` 兜底 seed
- 历史机构跑 `scripts/seed-face-consent-docs.js` 补

### 决策 #3：不联动 LessonAttendance

**候选方案**：

| 方案 | 评估 | 决策 |
|------|------|------|
| 自动写 `LessonAttendance.status=attended` | 业务上希望 | ❌ |
| 仅记进出流水，不动考勤 | 隔离变更 | ✅ |
| 双写 + 后续合并 | 数据一致性难 | ❌ v2 |

**理由**：
1. 门禁识别 ≠ 实际到课（学员可能到校后去别处）
2. 双写风险大（任何门禁 bug 都会污染考勤历史）
3. PoC 阶段先解耦，**v2 引入"门禁 + 排课时间窗"匹配规则**再联动

> 注：`AccessEvent` 与 `LessonAttendance` **不写任何关联字段**。这意味着两者完全独立，不互相影响。

---

## 2. 架构总览

```
┌─────────────────┐   POST /access-control/webhook/:deviceSn
│  一体机 (F7S)   │ ─────────────────────────────────────────────┐
│  本地 InsightFace│   HMAC + timestamp + eventId 签名            │
└─────────────────┘                                              ▼
                                                    ┌──────────────────────────┐
                                                    │  webhookAuth (中间件)     │
                                                    │  - 验签 / 时间窗 / IP     │
                                                    │  - deviceSn → org 锁定    │
                                                    └────────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                    ┌──────────────────────────┐
                                                    │  driver.normalizeEvent   │
                                                    │  (hanwang 通用协议)        │
                                                    └────────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                    ┌──────────────────────────┐
                                                    │  service.recordEvent     │
                                                    │  - 强制规则 (liveness/    │
                                                    │    doorState/no match)   │
                                                    │  - snapshot → File(local)│
                                                    │  - AccessEvent.create    │
                                                    │    (unique 防重放)        │
                                                    └────────────┬─────────────┘
                                                                 │
                          ┌──────────────────────────────────────┼────────────────────┐
                          ▼                                      ▼                    ▼
              ┌──────────────────────┐         ┌──────────────────────┐   ┌──────────────────┐
              │ Admin (Vue3)         │         │ Client (uni-app)     │   │ Future hooks     │
              │ /access-control/*    │         │ /faceAccess/*        │   │ - points         │
              │ 设备/档案/流水/接送   │         │ enroll/pickup/log    │   │ - unipush        │
              └──────────────────────┘         └──────────────────────┘   │ - 告警           │
                                                                             └──────────────────┘
                          │                                      │
                          └──────────────┬───────────────────────┘
                                         ▼
                          ┌──────────────────────────────┐
                          │ 共享层                          │
                          │  - UserConsent (复用)          │
                          │  - File (snapshot 走这里)      │
                          │  - LegalDoc (协议模板)         │
                          │  - LegalService (签名/撤回)    │
                          └──────────────────────────────┘
```

---

## 3. 数据模型（4 新 + 3 复用）

### 3.1 新模型

| Model | 关键字段 | 索引 |
|-------|---------|------|
| `AccessDevice` | `org, name, vendor, deviceSn, webhookSigningKey, doorState, isActive, lastHeartbeatAt` | `(org, deviceSn)` unique |
| `FaceProfile` | `org, subjectType, subject(refPath), consentRecord, deviceIds, enrollmentPhoto, revokedAt` | `(org, subjectType, subject)` partial unique `{revokedAt:null}` |
| `AccessEvent` | `org, device, deviceEventId, subjectType, subject, eventType, result, livenessResult, snapshots[]` | `(org, device, deviceEventId)` **unique** 防重放 |
| `AuthorizedPickup` | `org, student, pickupPersonType, pickupUser, pickupName/Phone, faceProfile, validFrom/Until, revokedAt` | `(org, student, revokedAt)` |

> polymorphic 字段（`subject` refPath=`subjectType`）支持 `student` / `parent` / `authorized_pickup` 三类主体。
> PoC 阶段接受 polymorphic 技术债，v2 拆 3 张表（详见 [V2-BACKLOG.md](V2-BACKLOG.md)）。

### 3.2 复用模型

| Model | 扩展点 | 说明 |
|-------|--------|------|
| `UserConsent` | + `subjectType` enum / + `subject` refPath | 已有 docKey + face-consent-* 3 条新 docKey |
| `File` | + 3 个 scope enum（`faceAccessEnrollment` / `faceAccessSnapshot` / `faceAccessStrangerSnapshot`） | 强制 local driver |
| `LegalDoc` | + 3 条 docKey | `face-consent-student` / `-pickup` / `-staff` |

### 3.3 12 个新 enum（`shared/enums.js`）

| Enum | 取值 | 用途 |
|------|------|------|
| `ACCESS_DEVICE_VENDORS` | `hanwang` / `zkteco` / `hikvision` / `dahua` / `custom` | AccessDevice.vendor |
| `DOOR_STATE_MODES` | `normal` / `always_open` / `always_closed` / `maintenance` | AccessDevice.doorState.mode |
| `FACE_PROFILE_SUBJECT_TYPES` | `student` / `parent` / `authorized_pickup` | FaceProfile.subjectType |
| `FACE_PROFILE_SYNC_STATUSES` | `pending` / `synced` / `failed` | FaceProfile.syncStatus |
| `ACCESS_EVENT_TYPES` | `recognized` / `rejected` / `stranger` / `manual_override` | AccessEvent.eventType |
| `ACCESS_DIRECTIONS` | `in` / `out` / `unknown` | AccessEvent.direction |
| `ACCESS_RESULTS` | `allowed` / `denied` / `unknown` | AccessEvent.result |
| `LIVENESS_RESULTS` | `passed` / `failed` / `not_attempted` | AccessEvent.livenessResult |
| `SNAPSHOT_KINDS` | `authorized` / `stranger` | AccessEvent.snapshots[].kind |
| `PICKUP_PERSON_TYPES` | `parent` / `authorized_third_party` | AuthorizedPickup.pickupPersonType |
| `FACE_CONSENT_PURPOSES` | `student` / `pickup` / `staff` | LegalDoc 关联 |
| `CONSENT_SUBJECT_TYPES` | `user` / `student` / `authorized_pickup` / `staff` | UserConsent.subjectType |

---

## 4. Webhook 安全（CLAUDE.md §17.4）

### 4.1 防重放三件套

```
X-Signature: hex(HMAC-SHA256(webhookSigningKey, `${ts}.${eventId}.${sha256(rawBody)}`))
X-Timestamp: 1718900000          // unix sec, |now - ts| < 300s
X-Nonce:     <设备原生 eventId>     // 与 body 内 recordId/eventId 一致
```

**两层防护**：
1. **HMAC + 5 分钟时间窗**（`webhookAuth.middleware`）：防伪造 + 防 5 分钟外重放
2. **Mongo 唯一索引 `(org, device, deviceEventId)`**（`AccessEvent` schema）：防 5 分钟内重放 + 网络抖动重发

**幂等返回**：`{deduplicated: true, ok: true}` —— 设备拿到 200 OK 不再重试。

### 4.2 强制规则（service.recordEvent）

| 条件 | 结果 |
|------|------|
| `livenessResult !== 'passed'` | `result='denied'`、`eventType` 降级为 `'rejected'` |
| 设备报 `recognized` 但服务端查不到 active FaceProfile | 降级为 `stranger` + `denied` |
| `device.doorState.mode ∈ {maintenance, always_closed}` | `result='denied'` |

### 4.3 软防御

- **IP 白名单**：`device.ipAddress` 非空时校验请求源 IP，不一致仅记 warn 日志不挡（一体机常在 4G/家用宽带，IP 不稳定）
- **org 锁定**：webhookAuth 中间件反查 `deviceSn → AccessDevice` 锁定 org，**不读 body 里的 org**（防越权）

---

## 5. 权限码（CLAUDE.md §17.6）

### 5.1 三个权限码语义

| 权限码 | 语义 | 端点示例 |
|--------|------|----------|
| `accessControl.read` | 查看设备/档案/流水/接送 | `GET /devices`、`GET /access-events` |
| `accessControl.write` | 管理设备/录入/撤销/切换门 | `POST /devices`、`POST /face-profiles` |
| `accessControl.pickup` | 接送授权管理 | `POST /pickups`、`POST /pickups/:id/revoke` |

### 5.2 系统职位挂载

| 职位 | read | write | pickup |
|------|------|-------|--------|
| 管理员 | ✅ | ✅ | ✅ |
| 教务 | ✅ | ✅ | ✅ |
| 老师 | ✅ | ❌ | ❌ |
| 财务 | ✅ | ❌ | ❌ |
| 家长 | (走 client auth + activeStudent) | | |

### 5.3 4 处同步（关键！）

| # | 位置 | 内容 |
|---|------|------|
| 1 | `shared/permissions.json` | 加 `access-control` group |
| 2 | `packages/server/src/modules/position/position.service.js#DEFAULT_POSITIONS` | 5 个系统职位挂载 |
| 3 | `packages/server/scripts/migrate-add-access-control-perms.js` | 历史机构 updateMany |
| 4 | `packages/server/src/utils/startupMigrations.js` | 新机构创建后兜底 |

> 漏一处就完蛋：典型坑是新权限码在 JSON + DEFAULT_POSITIONS 都加了但忘跑迁移，老机构依然 403。

---

## 6. 合规（CLAUDE.md §17.5）

> 详见 [COMPLIANCE.md](COMPLIANCE.md)，本节只列硬约束：

1. **录入前必须先签 UserConsent** —— service `enrollFaceProfile` 第一步查 `UserConsent.findActive({user, docKey, version})`，null 则 412
2. **撤回不删 UserConsent** —— 写 `withdrawAt` + 级联 `FaceProfile.updateMany({consentRecord}, {$set:{revokedAt:now}})`
3. **snapshot 30 天保留** —— `retentionUntil=+30d`，v2 cron 清理
4. **人脸照片必须本地化** —— 3 个新 File scope **强制走 local driver**，禁 S3/OSS（`STORAGE_DRIVER=local` 硬卡）
5. **硬件显著标识** —— 摄像头张贴"人脸识别采集"提示（物理 + 软件双重）

---

## 7. 客户端隔离

### 7.1 双路径

| 端点 | 用途 | 隔离 |
|------|------|------|
| `POST /client/face-profiles/enroll-my-child` | 家长给当前 active 学员录入 | `requireActiveStudent` + `student.guardians.includes(req.user.id)` |
| `POST /client/face-profiles/enroll-self` | 家长给自己录入（接送用） | `auth` only |
| `GET /client/access-events/as-pickup` | 我接送时刻的流水 | `auth` + `subjectType='parent'` + `subject=me` |
| `GET /client/access-events/my-child` | 我孩子的全天进出 | `requireActiveStudent` + `student.guardians` |

### 7.2 不在 PoC 范围

- 学员自己录脸（学员不登录系统，由家长代理）
- 第三方接送人脸录入（PoC 走纸质登记兜底）
- 家长给非 active 学员操作（强制只对 active 学员）

---

## 8. PoC 简化清单（v2 补）

| 不实现项 | 理由 | v2 落地 |
|---------|------|---------|
| `anti-tailgating` (尾随检测) | 设备不支持 | v2 |
| 设备本地白名单自动同步 | 依赖一体机自身同步策略 | 重试队列 + 退避 |
| 温度检测 / 戴口罩识别 | 设备能力差异大 | 视设备定 |
| 第三方接送人人脸录入 | 走纸质登记兜底 | 第三方人脸录入 UI |
| 自动清理过期 snapshot 的 cron | 手动 SQL | cron job |
| FaceProfile polymorphic 拆 3 表 | 接受技术债 | 性能瓶颈时拆 |
| 与 LessonAttendance 联动 | 解耦 | 时间窗匹配规则 |
| points hook（识别→积分） | 业务待定 | trigger 占位 |
| 多机构对比看板 | 平台超管视角 | 平台 dashboard |
| 报警推送 | 推送链路复杂 | unipush + 短信 |

> 完整 v2 计划见 [V2-BACKLOG.md](V2-BACKLOG.md)。

---

## 9. 已知风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 厂商 SDK 私有协议各异 | driver 维护成本 | 先只做 hanwang 通用协议，stub 留 hikvision/dahua |
| 一体机本地白名单同步失败 | 离线场景失效 | 报警 + 手动重试；v2 重试队列 |
| 设备 RTC 电池没电 → 时钟漂移 | 流水时间不准 | `clockSkewMs` 监控 + 报警；NTP 推送（v2） |
| polymorphic 索引脏 | 性能 | 接受 PoC，v2 拆表 |
| 撤回级联未跑事务 | 并发下可能漏 | 接受 PoC，v2 事务 |
| webhookAuth 5 分钟窗口太短 | 部分设备时钟漂移 | 实测后再调（10 分钟） |
