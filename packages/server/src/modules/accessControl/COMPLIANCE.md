# 合规设计 (COMPLIANCE.md)

> 人脸识别属**敏感个人信息**（PIPL / 个人信息保护法 28 条）。本文件列出**所有**合规硬约束及落地实现。
> 改任何合规相关代码前**必须**先看本文件；改完**必须**更新本文件。

---

## 1. 法律依据

| 法规 | 关键条款 | 我们的应对 |
|------|---------|-----------|
| 《个人信息保护法》(PIPL) 2021 | 敏感个人信息需"单独同意" + "充分必要性" | 强制走 UserConsent 流程（不同意则无法录入） |
| PIPL 47 条 | 知情权：处理目的、方式、种类、期限 | 同意书模板列明 5 项要素 |
| PIPL 47 条 | 撤回权：提供便捷的撤回方式 | 客户端"我的 → 撤回"一键撤回 |
| GB/T 35273-2020《信息安全技术 个人信息安全规范》 | 数据最小化、本地化、限期保留 | 30 天 snapshot 保留策略 |
| 《关于加强人脸识别监管的指导意见》(最高检 2021) | 不得强制采集、不得用于考勤（除特定场景） | 我们的设计：只识别进出，不强制、不连考勤 |

---

## 2. 5 项硬约束

### 约束 1：录入前必须先签 UserConsent

**实现位置**：`accessControl.service.enrollFaceProfile` + `clientEnrollMyChild` + `clientEnrollSelf`

**逻辑**：
```javascript
// 伪代码
const consent = await UserConsent.findOne({
  user: req.user.id,
  docKey: 'face-consent-student',  // 或 face-consent-pickup
  version: 1,
  withdrawAt: null
})
if (!consent) {
  throw new ApiError.preconditionFailed('请先签署人脸采集同意书')
}
```

**前端体验**：未签同意书时访问 enroll 页 → 弹 agreement-modal → 同意 → 返回 enroll 页继续。

### 约束 2：撤回走 withdrawAt 写入（不物理删 UserConsent）

**实现位置**：`accessControl.service.withdrawConsent`

**逻辑**：
```javascript
// 1. 写 withdrawAt（append-only）
const consent = await UserConsent.findOneAndUpdate(
  { _id: consentId, withdrawAt: null },
  { $set: { withdrawAt: now, withdrawBy: req.user.id, withdrawIp: req.ip } },
  { new: true }
)

// 2. 级联软撤销所有引用此 consent 的 active FaceProfile
await FaceProfile.updateMany(
  { consentRecord: consentId, revokedAt: null },
  { $set: { revokedAt: now, revokedBy: req.user.id, revokeReason: 'consent withdrawn' } }
)
```

**PIPL 留痕**：撤回动作本身可追溯（who/when/ip），但**不**让用户撤回撤回。

### 约束 3：snapshot 30 天保留

**实现位置**：`accessControl.service.recordEvent`（写 `retentionUntil=now+30d`）

**清理策略（PoC：手动 SQL；v2：cron）**：

```javascript
// mongosh 手动清理（PoC）
const expireBefore = new Date(Date.now() - 30 * 24 * 3600 * 1000)
const expired = await db.access_events.find(
  { 'snapshots.retentionUntil': { $lte: expireBefore } },
  { 'snapshots.$': 1 }
).toArray()

for (const ev of expired) {
  for (const snap of ev.snapshots) {
    if (snap.retentionUntil <= expireBefore) {
      // 删物理文件
      await storageService.remove(snap.file)
      // 删 File 文档
      await db.files.deleteOne({ _id: snap.file })
    }
  }
}
```


### 约束 4：人脸照片必须本地化（hard rule）

**业务背景**：合规要求人脸照片**不得**存储于公有云（S3/OSS/七牛）。

**实现位置**：
- `File.model.js` SCOPE enum 加 `faceAccessEnrollment` / `faceAccessSnapshot` / `faceAccessStrangerSnapshot`
- `accessControl.service.uploadSnapshotFile` 强制 `STORAGE_DRIVER=local`

**落地代码（service.uploadSnapshotFile）**：
```javascript
const config = require('@config/index')

async function uploadSnapshotFile({ buffer, mime, scope, retentionUntil }) {
  if (config.storage.driver !== 'local') {
    throw new ApiError.internal('合规要求：人脸照片必须本地化存储（STORAGE_DRIVER=local）')
  }
  // ... 走 storage.service.uploadOne, scope=faceAccessSnapshot ...
}
```

**测试**：把 `STORAGE_DRIVER` 改成 `s3`，重启服务，POST 一条事件 → 期望 500 + 错误信息。

### 约束 5：硬件显著标识

**物理层面**：摄像头处张贴"本区域进行人脸识别采集，已签同意书方可使用"提示。

**软件层面**：
- Admin 端"门禁设备"页 设备名后标 `(人脸识别)` 角标
- 客户端 enroll 页 第一屏提示"本机构将采集您的人脸信息用于门禁识别"

**CLAUDE.md 引用**：本约束的来源是 PIPL 17 条"显著标识"要求。

---

## 3. 数据生命周期

### 3.1 学员人脸

```
录入 ─→ [FaceProfile.active] ─→ 毕业/离校 ─→ [FaceProfile.revokedAt] ─→ 30 天 ─→ 物理清
                                          ↑                                    ↓
                                          └──── UserConsent.withdrawAt 触发 ──┘
```

### 3.2 家长人脸

```
录入 ─→ [FaceProfile.active] ─→ 不再接送 ─→ [FaceProfile.revokedAt] ─→ 30 天 ─→ 物理清
                                       ↑                                    ↓
                                       └──── UserConsent.withdrawAt 触发 ──┘
```

### 3.3 snapshot（抓拍图）

```
产生 ─→ [AccessEvent.snapshots[]] ─→ 30 天 ─→ 物理清（删 File + 删物理文件）
```

### 3.4 进出流水（不带图）

```
产生 ─→ [AccessEvent] ─→ 保留 2 年（业务存档需求，不带人脸）──→ 物理清
```

> 2 年是默认值，可调；不带图的流水**不含人脸**，合规风险低。

---

## 4. 用户权利

PIPL 第 4 章赋予用户 7 项权利，我们的实现：

| 权利 | 实现 | 端点 |
|------|------|------|
| 知情权 | LegalDoc 模板 + 客户端 enroll 弹窗 | `GET /access-control/consent/template` |
| 同意权 | 客户端 enroll 流程前置签同意 | `POST /access-control/client/consent/sign` |
| 撤回权 | 客户端"我的 → 撤回" | `POST /access-control/client/consent/:id/withdraw` |
| 查询权 | "我的 → 人脸档案" | `GET /access-control/client/face-profiles/me` |
| 更正权 | 重新录脸（自动 revoke 旧） | `POST /access-control/client/face-profiles/enroll-self` |
| 删除权 | 通过撤回同意书级联删除 | `POST /access-control/client/consent/:id/withdraw` |
| 解释权 | 客服回邮件 / 公告 FAQ | - |

> 解释权 / 投诉通道在 Admin 端的"机构信息"页配置客服电话/邮箱。

---

## 5. 撤回流程详解

### 5.1 家长撤回自己的人脸同意书

```
[用户操作] 客户端"我的 → 人脸档案 → 撤回"
   ↓
[前端] POST /access-control/client/consent/:id/withdraw
   ↓
[后端 service.withdrawConsent]
   1. 校验 consent 属当前 user (subjectType='user' 或 'parent', subject=userId)
   2. 写 withdrawAt = now, withdrawBy = userId, withdrawIp
   3. 遍历所有引用此 consent 的 active FaceProfile
      - FaceProfile.updateMany({consentRecord, revokedAt:null}, {$set:{revokedAt, revokedBy, revokeReason}})
   4. 异步: driver.removeFaceProfile(device, profile) → 设备本地白名单清除 (PoC noop)
   5. 返回: { ok: true, revokedFaceProfiles: N }
   ↓
[响应] 200 OK
   ↓
[前端] 显示"撤回成功，X 条人脸档案已停用"
```

### 5.2 学员监护人撤回学员的同意书（家长代操作）

> 学员不登录系统，由监护人在客户端操作。

```
[用户操作] 客户端"我的 → 切换孩子 → 当前孩子 [A] → 人脸档案 → 撤回"
   ↓
[前端] POST /access-control/client/consent/:id/withdraw
   ↓
[后端 service.withdrawConsent]
   1. 校验 consent subjectType='student', subject=currentStudentId
   2. 校验 student.guardians.includes(req.user.id) (只主监护人能撤)
   3. 同 5.1 后续流程
   ↓
[响应] 200 OK
```

### 5.3 撤回后 30 天的清理

- 撤回后 30 天内：FaceProfile.revokedAt 还在，`AccessEvent` 流水还能查
- 30 天后：cron 删 FaceProfile 文档 + 对应 enrollmentPhoto File
- AccessEvent 保留更久（业务存档）

---

## 6. 同意书模板

> 见 [MIGRATION.md §9](MIGRATION.md#9-协议正文模板参考待-day-10-完善)。
> 完整 v1.0 模板由法务 / 业务负责人 Day 10 落地。

### 6.1 必含 5 项要素

1. **处理者身份**：本机构名称（自动从 Org 抓）
2. **处理目的**：门禁识别（具体业务）
3. **处理方式**：摄像头采集 + 本地存储
4. **存储期限**：有效期内 + 撤回后 30 天
5. **撤回方式**：客户端路径

> 漏一项就可能违规；模板由法务最终签字。

---

## 7. 异常场景处理

| 场景 | 风险 | 应对 |
|------|------|------|
| 设备被偷 | 物理盗取 | webhookSigningKey 立即重置（Admin 端"重置 secret"按钮） |
| webhookSigningKey 泄漏 | 重放攻击 | 同上 |
| 一体机本地白名单泄漏 | 离网识别 | 重要档案定期重新录入；监控 clockSkewMs |
| 数据库被拖 | 大规模泄漏 | 加密磁盘 + IP 白名单 + 严格备份策略（运维层） |
| 用户投诉"我没授权" | 同意书真伪 | UserConsent append-only + IP + UA + 设备指纹 |
| 学员毕业 | 数据未清 | 业务层联动：Student.isActive=false → 30 天后自动清 |
| 离职员工 | 权限残留 | UserOrgRel 走正常离职流程；accessControl.* 自动失效 |

---

## 8. 审计与日志

### 8.1 必留审计日志的动作

| 动作 | 落点 | 字段 |
|------|------|------|
| 签署同意书 | UserConsent.create | userId, ip, ua, docKey, version |
| 撤回同意书 | UserConsent.withdrawAt | userId, ip, reason |
| 录入人脸 | FaceProfile.create | enrolledBy, ip, enrollmentPhoto |
| 撤销人脸 | FaceProfile.revokedAt | revokedBy, ip, reason |
| 注册设备 | AccessDevice.create | registeredBy, ip |
| 重置 secret | AccessDevice.webhookSigningKey = new | (仅操作人记) |
| 远程开关门 | AccessDevice.doorState | changedBy, ip, reason |
| 物理删除 | (任一 model) | platform admin + 密码 + ip |

### 8.2 audit 留痕时长

- UserConsent / FaceProfile / AccessDevice：永久（合规存档）
- AccessEvent（流水）：2 年（业务存档）
- snapshot File：30 天（详见 §3.3）

---

## 9. 第三方共享

**PoC 阶段：零共享。** 即不向：
- 公安系统
- 教育局
- 第三方厂商（百度 / 腾讯 / 阿里）
- 培训机构之间

任何形式的共享。

如未来需要（如响应公安部门要求），必须：
1. 走 PIPL 23 条"法定职责"评估
2. 留存书面请求 + 审批记录
3. 在同意书补充"共享给 XX 部门"条款
4. 触发 v2 设计改动

---

## 10. 合规自查 checklist（每月）

- [ ] 当月新录入的 FaceProfile 数量 vs 当月新签 UserConsent 数量（应相等）
- [ ] 当月撤回的 UserConsent 数量 → 检查 FaceProfile 是否同步撤销
- [ ] 30 天前的 snapshot File 是否已清理
- [ ] 设备 `isActive=false` 的，最近一次 webhook 是哪天
- [ ] 是否有 student 已 isActive=false 但 FaceProfile.revokedAt 仍为 null
- [ ] `STORAGE_DRIVER` 是否还是 `local`（防运维误改）

---

## 11. 风险登记

| 风险 | 等级 | 缓解 |
|------|------|------|
| 一体机本地存储被取走 | 中 | 不存储原始人脸图，仅存 embedding（v2） |
| snapshot 30 天后未及时清 | 中 | 加 cron（v2 任务） |
| 撤回后旧 deviceEventId 仍能识别 | 低 | deviceEventId 流水不影响开门；FaceProfile 已 revoke |
| 用户撤回后 30 天内要求立即清 | 低 | 走"特殊删除"人工流程 |
| 同意书模板漏 5 要素 | 高 | Day 10 法务签字；v1.0 锁定后改 v1.1 |
