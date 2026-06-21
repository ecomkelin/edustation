# 迁移与初始化 (MIGRATION.md)

> 本文件说明：accessControl 模块从 0 → 上线的所有"在数据库 / 配置文件上动手"的操作。
> 重点：**幂等**（可重跑）、**可回滚**（出问题时能 undo）。

---

## 1. 总览：4 步走

```
步骤 1: 跑迁移脚本     →  历史机构补权限码
步骤 2: seed 协议     →  历史机构补 3 条 face-consent LegalDoc
步骤 3: 启动服务      →  startupMigrations 兜底（新机构自动生效）
步骤 4: 验证          →  跑 VERIFICATION.md 的脚本
```

---

## 2. 步骤 1：跑迁移脚本（权限码）

### 2.1 作用

历史机构已存在的 `Position` 文档需要补 `accessControl.*` 三个权限码。
新机构**不**需要此步骤（`DEFAULT_POSITIONS` 已含，走 `position.service.ensureDefaultPositions` 自动生效）。

### 2.2 命令

```bash
cd /Users/kelin/prog/rgzw/edustation
node packages/server/scripts/migrate-add-access-control-perms.js
```

### 2.3 期望输出

```
[migrate-add-access-control-perms] connected
[migrate-add-access-control-perms] 管理员/教务: touched=N matched=N
[migrate-add-access-control-perms] 老师/财务: touched=N matched=N
[migrate-add-access-control-perms] done
```

> `matched=0` 是正常的（说明历史机构都已有权限码，跳过）；`matched>0 touched=0` 也正常（已加过）；`touched>0` 才是真生效。

### 2.4 幂等性

`$nin` 前置过滤 + `$addToSet`，**多次跑不会重复添加**。建议在每台服务器部署前跑一次。

### 2.5 回滚

如需撤回权限码：

```javascript
// mongosh
use <db>
db.positions.updateMany(
  { isSystem: true, name: { $in: ['管理员', '教务'] } },
  { $pull: { permissions: { $in: ['accessControl.read', 'accessControl.write', 'accessControl.pickup'] } } }
)
db.positions.updateMany(
  { isSystem: true, name: { $in: ['老师', '财务'] } },
  { $pull: { permissions: 'accessControl.read' } }
)
```

---

## 3. 步骤 2：seed 协议（LegalDoc）

### 3.1 作用

写入 3 条机构级 LegalDoc 模板（docKey = `face-consent-student` / `-pickup` / `-staff`）。
用户在前端签同意书时，走 `UserConsent` collection，引用 `LegalDoc` 模板 + version。

### 3.2 状态

- ✅ `scripts/seed-face-consent-docs.js` — **待开发**（Day 10 任务）
- ⏳ `startupMigrations.js#seedFaceConsentDocs` — **待注册**（Day 10 任务）
- ⏳ 3 份 LegalDoc 正文（v1.0） — **待准备**（Day 10 任务，参考文末"协议正文模板"）

### 3.3 草稿命令（待脚本完成后正式使用）

```bash
# 待 Day 10 完成
node packages/server/scripts/seed-face-consent-docs.js
```

### 3.4 幂等性

seed 脚本按 `(org, docKey, version)` upsert；多次跑不会重复。

---

## 4. 步骤 3：启动服务

```bash
cd packages/server && npm run dev
```

启动时 `startupMigrations.js` 会做两件相关的事：

1. `seedFaceConsentDocs(orgId)`：为**新机构**自动 seed 3 条 LegalDoc
2. 其它已有迁移（如 `dropLegacyLeadCollections`）：**与 accessControl 无关**，但确保 lead 旧 collection 已 drop

> 启动日志示例（待 Day 10 seedFaceConsentDocs 注册后）：
> ```
> [startup] seedFaceConsentDocs for org=<orgId> inserted 3 docs
> ```

---

## 5. 步骤 4：验证

详见 [VERIFICATION.md](VERIFICATION.md)。核心 3 步：

```bash
# 模块加载验证
node packages/server/scripts/verify-access-control-load.js

# 数据库 schema 验证
node packages/server/scripts/verify-access-control-db.js

# 跑 33 端点注册验证
node -e "require('module-alias/register'); require('dotenv').config(); const r = require('./src/routers'); console.log(r.stack.filter(s => s.route).length, 'routes')"
```

---

## 6. 字段级 schema 迁移

> 字段扩展（`UserConsent` / `File` / `enums`）走 **Mongoose schema 演进** 模式：
> 新字段加 `default: null` 或 `default: []`，老文档读时**自动填充 default**，**不需要写数据库**。
> 老字段的 default 不变的**完全不需要动**。

### 6.1 已落地的 schema 扩展

| Model | 新增字段 | 旧数据兼容性 |
|-------|---------|------------|
| `UserConsent` | `subjectType` (default='user') / `subject` (refPath, default=null) | 老文档 user/student/authorized_pickup 自由组合 |
| `File` | 3 个 scope enum 值 | 老文档 scope 字段不变，string 已通过 schema 校验 |
| `shared/enums.js` | 12 个新 enum | 老代码用不到，新增 enum 不影响 |

### 6.2 复合索引（重要）

| 索引 | 加索引方式 | 时机 |
|------|----------|------|
| `AccessEvent.(org, device, deviceEventId)` unique | 自动（schema.index） | 首次写入时 |
| `FaceProfile.(org, subjectType, subject)` partial unique | 自动 | 首次写入时 |
| `AccessDevice.(org, deviceSn)` unique | 自动 | 首次写入时 |
| `UserConsent.(subjectType, subject, docKey, createdAt)` | 自动 | 首次写入时 |
| `File.scope + key` unique | 已有 | - |

> **Mongoose 不会自动给已存在 collection 加索引**。如 collection 已存在但无索引，需要手动：
> ```javascript
> // mongosh
> db.access_events.createIndex({ org: 1, device: 1, deviceEventId: 1 }, { unique: true })
> db.face_profiles.createIndex(
>   { org: 1, subjectType: 1, subject: 1 },
>   { unique: true, partialFilterExpression: { revokedAt: null } }
> )
> db.access_devices.createIndex({ org: 1, deviceSn: 1 }, { unique: true })
> ```
> 建议在 `startupMigrations.js` 加 `ensureAccessControlIndexes` 自动跑。

---

## 7. 环境变量

accessControl 模块**不**新增环境变量。复用的相关 env：

```bash
# storage driver（必须 = local，禁 S3/OSS）
STORAGE_DRIVER=local
UPLOAD_DIR=uploads
UPLOAD_BASE_URL=/uploads

# 其它
MONGODB_URI=mongodb://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
```

---

## 8. 回滚方案

如需下线 accessControl 模块：

```bash
# 1. 注释掉 routers/index.js 第 83 行 (router.use('/access-control', accessControlRoutes))
# 2. 注释掉 app.js 第 25-26 行 (app.use('/api/v1/access-control', accessControlWebhook))
# 3. 跑权限码撤回（见 2.5）
# 4. 删 collection（可选，会丢失数据）
#    db.access_devices.drop()
#    db.face_profiles.drop()
#    db.access_events.drop()
#    db.authorized_pickups.drop()
# 5. 删 LegalDoc
#    db.legal_docs.deleteMany({ docKey: { $in: ['face-consent-student', 'face-consent-pickup', 'face-consent-staff'] } })
# 6. 删 UserConsent（只删 face-consent-* 的）
#    db.user_consents.deleteMany({ docKey: { $in: ['face-consent-student', 'face-consent-pickup', 'face-consent-staff'] } })
# 7. 删 File（只删 faceAccess* scope 的）
#    db.files.deleteMany({ scope: { $in: ['faceAccessEnrollment', 'faceAccessSnapshot', 'faceAccessStrangerSnapshot'] } })
```

> ⚠️ **强警告**：物理删 collection 前**必须**备份！合规要求保留 30 天 snapshot。

---

## 9. 协议正文模板（参考，待 Day 10 完善）

### 9.1 face-consent-student（学员人脸采集同意书）

> 本机构（"我们"）拟在门禁系统中使用您孩子的人脸信息用于到校/离校识别。您理解并同意：
>
> 1. **采集目的**：仅用于学员到校/离校识别，不用于考勤判定、不与第三方共享。
> 2. **采集方式**：通过一体机摄像头采集清晰正面照，存储于本机构服务器。
> 3. **存储期限**：学员有效期内 + 离校后 30 天内，期间您可随时撤回。
> 4. **撤回方式**：家长端小程序 → 我的 → 人脸档案 → 撤回。撤回后门禁将不再识别您的孩子，请通过刷卡等方式进出。
> 5. **数据安全**：人脸照片**仅存储于本机构服务器本地**（不存储于任何公有云），不导出、不分析、不用于商业目的。
>
> 同意书版本：v1.0 / 更新日期：2026-06-21

### 9.2 face-consent-pickup（第三方接送人脸采集同意书）

> 您作为学员的接送人/被授权人，本机构拟在门禁系统中采集您的人脸信息用于接送核验。
>
> 1. **采集目的**：仅用于家长/授权接送人刷脸进门接送学员。
> 2. **采集方式**：通过一体机摄像头采集清晰正面照，存储于本机构服务器。
> 3. **存储期限**：接送授权有效期内 + 撤销后 30 天。
> 4. **撤回方式**：学员家长可在小程序 → 接送授权 → 撤销您的授权。撤销后您需通过登记等其他方式接送。
> 5. **数据安全**：人脸照片仅存储于本机构服务器本地。
>
> 同意书版本：v1.0 / 更新日期：2026-06-21

### 9.3 face-consent-staff（员工人脸采集同意书）

> PoC 阶段**不强制**，留口子。员工考勤走 SaaS 标准方案。
>
> 同意书版本：v1.0 / 更新日期：2026-06-21

---

## 10. 上线 checklist

- [ ] 步骤 1 跑通（迁移权限码）
- [ ] 步骤 2 跑通（seed 协议）— **待 Day 10 脚本完成**
- [ ] 步骤 3 启动服务无报错
- [ ] 步骤 4 三项验证全过
- [ ] 数据库复合索引已建（mongosh 查 `db.access_events.getIndexes()`）
- [ ] `STORAGE_DRIVER=local` 已确认
- [ ] 至少一个机构的 3 条 LegalDoc 已在 db 中（`db.legal_docs.find({ docKey: /^face-consent-/ })`）
- [ ] 撤回流程跑通：模拟用户撤回 → FaceProfile.revokedAt 已写
