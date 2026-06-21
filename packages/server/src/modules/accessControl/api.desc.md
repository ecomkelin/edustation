# accessControl 模块 API 文档

> 人脸识别门禁 (2026-06 立项, accessControl)
>
> **业务范围**：学员到校识别 + 家长接送核验。
> **算法路径**：一体机本地 InsightFace 级 SOTA（不依赖云 API）。
> **合规**：电子同意书复用 `UserConsent` collection（add 2 字段：subjectType/subject + withdrawAt）。

---

## 1. 端点清单

### 1.1 Webhook（一体机回调，**无 auth，HMAC 验签**）

| Method | Path | 鉴权 | 说明 |
|--------|------|------|------|
| `POST` | `/webhook/:deviceSn` | HMAC | 一体机推送进出事件，幂等去重 |
| `POST` | `/webhook/:deviceSn/heartbeat` | HMAC | 设备心跳，更新 `lastHeartbeatAt` |

**Webhook 安全三件套**（仿 GitHub/Stripe webhook）：

```
X-Signature: hex(HMAC-SHA256(webhookSigningKey, `${ts}.${eventId}.${sha256(rawBody)}`))
X-Timestamp: 1718900000          // unix sec, |now - ts| < 300s
X-Nonce:     <设备原生 eventId>     // 与 body 内 recordId/eventId 一致
```

**幂等保证**：`AccessEvent.(org, device, deviceEventId)` 复合唯一索引。设备重发/网络抖动重放 → Mongo 11000 → 返回 `{deduplicated: true, ok: true}`，设备不重试。

**强制规则**（CLAUDE.md §17.4）：

1. `livenessResult !== 'passed'` → `result='denied'`，`eventType` 降级为 `'rejected'`
2. 设备报 `recognized` 但服务端查不到 active FaceProfile → 降级为 `stranger` + `denied`
3. `device.doorState.mode='maintenance'|'always_closed'` → `result='denied'`

**hanwang driver 字段映射**（PoC 第一版）：

| 厂商字段 | 标准字段 | 备注 |
|---------|---------|------|
| `recordId` / `eventId` / `event_id` | `deviceEventId` | 必填，唯一 |
| `type: 'manual'` | `eventType='manual_override'` | 人工放行 |
| `result: 'success'\|'pass'` + `userId` 命中 | `eventType='recognized'` | |
| `result: 'fail'` | `eventType='rejected'` | |
| 无 `userId` | `eventType='stranger'` | |
| `direction` / `inout` | `direction` | `in`/`out`/`unknown` |
| `liveness` / `liveResult` | `livenessResult` | `pass`/`fail`/`none` |
| `similarity` | `similarity` | 0-1 |
| `snapshot` / `image` (base64) | `snapshotBuffer` | 走 File，30 天保留 |
| `timestamp` (unix sec) | `deviceTimestamp` | 不可信，仅监控 `clockSkewMs` |

### 1.2 Admin 端（auth + `accessControl.*` 权限码）

| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| `GET` | `/devices` | read | 设备列表 |
| `POST` | `/devices` | write | 注册设备（一次性返回 `webhookSigningKey`） |
| `GET` | `/devices/:id` | read | 设备详情（**不返回** signing key） |
| `PUT` | `/devices/:id` | write | 更新设备（不含 signing key） |
| `GET` | `/devices/:id/removable-check` | read | 删除预检 |
| `POST` | `/devices/:id/regenerate-secret` | write | 重置 webhook signing key（**一次性返回**新 key） |
| `POST` | `/devices/:id/door-state` | write | 远程切门锁状态 |
| `DELETE` | `/devices/:id` | super-admin + 密码 | 物理删除（removable-check 预检：进出流水 + 同步档案阻挡） |

| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| `GET` | `/face-profiles` | read | 人脸档案列表（filter: subjectType/studentId/userId/isActive） |
| `GET` | `/face-profiles/:id` | read | 详情 |
| `POST` | `/face-profiles` | write | 录入人脸（必传 `consentRecordId`） |
| `POST` | `/face-profiles/:id/revoke` | write | 软撤销（写 `revokedAt`） |
| `GET` | `/face-profiles/:id/removable-check` | read | 删除预检（通常走 soft revoke 而非物理删） |

| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| `GET` | `/access-events` | read | 流水（filter: device/subjectType/subject/eventType/direction/result/from/to） |
| `GET` | `/access-events/stats` | read | 按 `result` 聚合（看板用） |
| `GET` | `/access-events/:id` | read | 详情（populate snapshot File） |

| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| `GET` | `/pickups` | read | 接送授权列表 |
| `GET` | `/pickups/:id` | read | 详情 |
| `POST` | `/pickups` | pickup | 创建（parent 类型必传 `pickupUser` + `faceProfile`） |
| `PUT` | `/pickups/:id` | pickup | 编辑 |
| `POST` | `/pickups/:id/revoke` | pickup | 软撤销 |

| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| `GET` | `/consent/template?docKey=face-consent-student` | read | 取协议模板（走 LegalDoc） |

### 1.3 Client 端（家长小程序，auth + 部分走 `requireActiveStudent`）

| Method | Path | 隔离 | 说明 |
|--------|------|------|------|
| `POST` | `/client/face-profiles/enroll-my-child` | activeStudent + guardians 校验 | 家长给当前 active 学员录入人脸 |
| `POST` | `/client/face-profiles/enroll-self` | auth | 家长给自己录入人脸（接送用） |
| `GET` | `/client/face-profiles/me` | (待补) | 列出我的所有人脸档案 |

| Method | Path | 隔离 | 说明 |
|--------|------|------|------|
| `GET` | `/client/pickups` | activeStudent + guardians | 我能给当前 active 学员配置的接送人 |
| `POST` | `/client/pickups` | activeStudent + guardians | 新增接送人 |
| `POST` | `/client/pickups/:id/revoke` | activeStudent + guardians | 撤销 |

| Method | Path | 隔离 | 说明 |
|--------|------|------|------|
| `GET` | `/client/access-events/as-pickup` | auth | 仅 `subjectType='parent'` + `subject=me` 的事件（接送时刻） |
| `GET` | `/client/access-events/my-child` | activeStudent + guardians | active 学员的全天进出 |

| Method | Path | 隔离 | 说明 |
|--------|------|------|------|
| `GET` | `/client/consent/my` | auth | 我当前有效的 face-consent-* 列表 |
| `POST` | `/client/consent/sign` | auth | 签署电子同意书（写 UserConsent） |
| `POST` | `/client/consent/:id/withdraw` | auth | 撤回（级联撤销 FaceProfile） |

---

## 2. 模型结构

### 2.1 `AccessDevice` (collection `access_devices`)

```js
{
  org, name, vendor, vendorModel, deviceSn,
  ipAddress, macAddress, firmwareVersion, location,
  webhookSigningKey,            // HMAC raw, 列表不返回
  capabilities: [String],       // ['face','card','qr','body_temp']
  doorState: { mode, changedBy, changedAt, reason },
  isActive, lastHeartbeatAt, registeredBy, meta
}
```

索引：`(org, deviceSn)` unique / `(org, isActive)` / `(org, lastHeartbeatAt)`

### 2.2 `FaceProfile` (collection `face_profiles`, polymorphic)

```js
{
  org, subjectType,              // 'student'|'parent'|'authorized_pickup'
  subject,                       // ObjectId, refPath='subjectType'
  consentRecord,                 // ref UserConsent, required
  enrollmentQuality,             // 0-1
  syncStatus,                    // 'pending'|'synced'|'failed'
  deviceIds,                     // [ref AccessDevice]
  enrollmentPhoto,               // ref File (faceAccessEnrollment scope)
  enrolledAt, enrolledBy,
  revokedAt, revokedBy, revokeReason,
  meta
}
```

索引：`(org, subjectType, subject)` partial unique `{revokedAt: null}` / `(org, deviceIds)` / `(org, revokedAt)`

### 2.3 `AccessEvent` (collection `access_events`)

```js
{
  org, device, deviceEventId,    // 复合唯一, 防重放
  subjectType, subject,          // null = 陌生人
  eventType, direction, result, livenessResult, similarity,
  matchFaceProfile,              // null = 陌生人
  recognizedAt, deviceTimestamp, clockSkewMs,
  snapshots: [{ kind, file, retentionUntil }],
  sourceIp, meta
}
```

索引：
- `(org, device, deviceEventId)` **unique** — Mongo 层幂等
- `(org, recognizedAt)`
- `(org, device, recognizedAt)`
- `(org, subjectType, subject, recognizedAt)`
- `(org, result, recognizedAt)`

### 2.4 `AuthorizedPickup` (collection `authorized_pickups`)

```js
{
  org, student,                  // 被接送的学员
  pickupPersonType,              // 'parent'|'authorized_third_party'
  pickupUser,                    // parent 类型必填, ref User
  pickupName, pickupPhone,       // 第三方类型必填 (parent 时冗余自 User)
  pickupIdCardLast4, relationship,
  faceProfile,                   // parent 必填, 第三方可选
  validFrom, validUntil,
  createdBy,
  revokedAt, revokedBy, revokeReason,
  meta
}
```

索引：`(org, student, revokedAt)` / `(org, pickupUser, revokedAt)` / `(org, faceProfile)` / `(org, validFrom, validUntil)`

### 2.5 `UserConsent`（**复用** schema 扩展）

新增字段（其它不变）：

```js
{
  subjectType: { enum: ['user','student','authorized_pickup','staff'], default: 'user' },
  subject: { refPath: 'subjectType', default: null },
  withdrawAt, withdrawBy, withdrawIp,
  revokeReason
}
```

新 docKey（poC 三种，机构级）：

- `face-consent-student` — 学员人脸采集同意书
- `face-consent-pickup` — 第三方接送人脸采集同意书
- `face-consent-staff` — 员工人脸采集同意书（PoC 不强制）

撤回走 `withdrawAt` 写入（不物理删），级联撤销引用此 consent 的 active FaceProfile。

### 2.6 `File`（**复用** scope 扩展）

新增 scope 值：

- `faceAccessEnrollment` — 录入时的清晰人脸照（保留 30 天）
- `faceAccessSnapshot` — 进出抓拍图（授权人）
- `faceAccessStrangerSnapshot` — 进出抓拍图（陌生人）

**强约束**（CLAUDE.md §17.5）：上述 3 个 scope 必须走 local driver，**禁止 S3/OSS 公有云**。

---

## 3. 升级流程

1. **新机构创建**：`org.service.create` 完成后，`startupMigrations.seedFaceConsentDocs` 兜底为该 org 写入 3 条 `LegalDoc`（docKey = `face-consent-*`，版本 v1.0）
2. **历史机构补 docKey**：跑 `node packages/server/scripts/seed-face-consent-docs.js`（一次性）
3. **历史机构补权限码**：跑 `node packages/server/scripts/migrate-add-access-control-perms.js`（一次性，幂等）
4. **新机构自动生效**：`position.service.ensureDefaultPositions` 已挂 accessControl.* 三个权限码

---

## 4. 跨模块耦合

| 模块 | 耦合点 | 备注 |
|------|--------|------|
| `legal` | 复用 `LegalDoc` 存协议模板，复用 `UserConsent` 存签署记录 | 撤回级联 |
| `storage` | 抓拍图走 `File`（scope=`faceAccess*`），强制 local driver | 30 天后由 cron 清理（v2） |
| `student` | `FaceProfile.subject` ref Student；`AuthorizedPickup.student` ref Student | |
| `user` | `FaceProfile.subject` (subjectType='parent') ref User；`AuthorizedPickup.pickupUser` ref User | 需校验 UserOrgRel |
| `org` | 多租户隔离，全部 model 都有 `org` 字段 | |
| `position` | 5 个系统职位挂载 accessControl.* 权限码 | 见 position.service.js |

---

## 5. PoC 简化清单（v2 补）

- [ ] **不实现** anti-tailgating（设备不支持）
- [ ] **不实现** 设备本地白名单自动同步（PoC: 仅后端 DB 记录，依赖一体机自身同步策略；syncStatus 暂不强制驱动实现）
- [ ] **不实现** 温度检测 / 戴口罩识别
- [ ] **不实现** 第三方接送人人脸录入（PoC: 走纸质登记兜底）
- [ ] **不实现** 自动清理过期 snapshot 的 cron（手动 SQL 清理）
- [ ] **不实现** FaceProfile polymorphic 拆 3 表（StudentFaceProfile / UserFaceProfile / PickupFaceProfile）
- [ ] **不实现** 与 LessonAttendance 联动（CLAUDE.md §17 决策：只记进出）
- [ ] **不实现** points hook（识别→积分）
- [ ] **不实现** 多机构对比看板（平台超管视角）
- [ ] **不实现** 报警推送（陌生人频繁出现→教务手机短信）
