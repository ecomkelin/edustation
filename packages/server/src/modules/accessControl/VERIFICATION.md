# 验证脚本 (VERIFICATION.md)

> 改完代码后**必须**跑这里的验证脚本。所有验证脚本**幂等**，可重跑。

---

## 1. 4 级验证

| 级别 | 内容 | 何时跑 | 期望时长 |
|------|------|--------|---------|
| **L1 模块加载** | 4 model / 5 driver / 12 enum / 33 route 全部加载成功 | 改完代码 / 提交前 | < 5s |
| **L2 数据库 schema** | 复合索引已建 / 必要字段 default 正确 | 部署前 | < 10s |
| **L3 API 自测** | 33 端点 curl 跑通 | 联调 / 上线前 | < 60s |
| **L4 端到端 PoC** | 真实硬件 + 真实人脸 + 完整业务流 | Day 11-12 | 1-2h |

---

## 2. L1：模块加载验证

### 2.1 一次性脚本

把下面脚本保存为 `packages/server/scripts/verify-access-control-load.js`：

```javascript
'use strict'

/**
 * accessControl 模块加载验证 (L1)
 * 不连 DB，只验证模块 require 不报错 + 关键导出齐备
 *
 * 用法: node packages/server/scripts/verify-access-control-load.js
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const checks = []
const fail = (name, msg) => { checks.push({ ok: false, name, msg }); console.error(`✗ ${name}: ${msg}`) }
const pass = (name) => { checks.push({ ok: true, name }); console.log(`✓ ${name}`) }

try {
  // 1. 4 个新 model
  const AccessDevice = require('@models/AccessDevice.model')
  const FaceProfile = require('@models/FaceProfile.model')
  const AccessEvent = require('@models/AccessEvent.model')
  const AuthorizedPickup = require('@models/AuthorizedPickup.model')
  if (AccessDevice.modelName === 'AccessDevice') pass('AccessDevice model') else fail('AccessDevice model', `modelName=${AccessDevice.modelName}`)
  if (FaceProfile.modelName === 'FaceProfile') pass('FaceProfile model') else fail('FaceProfile model', `modelName=${FaceProfile.modelName}`)
  if (AccessEvent.modelName === 'AccessEvent') pass('AccessEvent model') else fail('AccessEvent model', `modelName=${AccessEvent.modelName}`)
  if (AuthorizedPickup.modelName === 'AuthorizedPickup') pass('AuthorizedPickup model') else fail('AuthorizedPickup model', `modelName=${AuthorizedPickup.modelName}`)

  // 2. 共享 enum
  const enums = require('@shared/enums')
  const requiredEnums = [
    'ACCESS_DEVICE_VENDORS', 'DOOR_STATE_MODES', 'FACE_PROFILE_SUBJECT_TYPES',
    'FACE_PROFILE_SYNC_STATUSES', 'ACCESS_EVENT_TYPES', 'ACCESS_DIRECTIONS',
    'ACCESS_RESULTS', 'LIVENESS_RESULTS', 'SNAPSHOT_KINDS', 'PICKUP_PERSON_TYPES',
    'FACE_CONSENT_PURPOSES', 'CONSENT_SUBJECT_TYPES'
  ]
  for (const k of requiredEnums) {
    if (enums[k] && Object.keys(enums[k]).length > 0) pass(`enum ${k}`) else fail(`enum ${k}`, 'missing or empty')
  }

  // 3. 权限码
  const perms = require('@shared/permissions.json')
  const acGroup = perms.groups.find(g => g.key === 'access-control')
  if (acGroup) {
    pass('permissions.json: access-control group exists')
    for (const p of ['accessControl.read', 'accessControl.write', 'accessControl.pickup']) {
      if (acGroup.permissions.includes(p)) pass(`perm ${p}`) else fail(`perm ${p}`, 'missing')
    }
  } else {
    fail('permissions.json: access-control group', 'not found')
  }

  // 4. driver
  const { getDriver } = require('@modules/accessControl/drivers')
  for (const v of ['hanwang', 'zkteco', 'hikvision', 'dahua', 'custom']) {
    const d = getDriver(v)
    if (d && typeof d.normalizeEvent === 'function') pass(`driver ${v}`) else fail(`driver ${v}`, 'not found')
  }

  // 5. webhookAuth 中间件
  const webhookAuth = require('@modules/accessControl/webhookAuth.middleware')
  if (typeof webhookAuth === 'function' && webhookAuth.length === 3) pass('webhookAuth middleware') else fail('webhookAuth middleware', 'signature wrong')

  // 6. service / controller / validator
  const service = require('@modules/accessControl/accessControl.service')
  const controller = require('@modules/accessControl/accessControl.controller')
  const validator = require('@modules/accessControl/accessControl.validator')
  const expectedServiceFns = 34
  const serviceFns = Object.keys(service).filter(k => typeof service[k] === 'function')
  if (serviceFns.length >= expectedServiceFns) pass(`service (${serviceFns.length} fns)`) else fail(`service`, `expected >= ${expectedServiceFns} fns, got ${serviceFns.length}`)
  const ctrlFns = Object.keys(controller).filter(k => typeof controller[k] === 'function')
  if (ctrlFns.length >= 30) pass(`controller (${ctrlFns.length} fns)`) else fail(`controller`, `expected >= 30 fns, got ${ctrlFns.length}`)

  // 7. route 注册
  const routes = require('@modules/accessControl/accessControl.routes')
  const routeCount = routes.stack.filter(s => s.route).length
  if (routeCount === 33) pass(`routes (${routeCount} endpoints)`) else fail(`routes`, `expected 33, got ${routeCount}`)

  const webhookRoutes = require('@modules/accessControl/accessControl.webhookRoutes')
  const whRouteCount = webhookRoutes.stack.filter(s => s.route).length
  if (whRouteCount === 2) pass(`webhook routes (${whRouteCount} endpoints)`) else fail(`webhook routes`, `expected 2, got ${whRouteCount}`)

  // 总结
  const failed = checks.filter(c => !c.ok)
  console.log(`\n[verify-access-control-load] ${checks.length - failed.length}/${checks.length} passed`)
  process.exit(failed.length > 0 ? 1 : 0)
} catch (e) {
  console.error('[verify-access-control-load] FATAL:', e.message)
  console.error(e.stack)
  process.exit(2)
}
```

### 2.2 跑法

```bash
cd /Users/kelin/prog/rgzw/edustation
node packages/server/scripts/verify-access-control-load.js
```

### 2.3 期望输出

```
✓ AccessDevice model
✓ FaceProfile model
✓ AccessEvent model
✓ AuthorizedPickup model
✓ enum ACCESS_DEVICE_VENDORS
... (12 个 enum)
✓ permissions.json: access-control group exists
✓ perm accessControl.read
✓ perm accessControl.write
✓ perm accessControl.pickup
✓ driver hanwang
... (5 个 driver)
✓ webhookAuth middleware
✓ service (34 fns)
✓ controller (34 fns)
✓ routes (33 endpoints)
✓ webhook routes (2 endpoints)

[verify-access-control-load] 30/30 passed
```

> 注：脚本尚未落盘到 `scripts/`，先放在本文件作为可粘贴模板。**Day 7 之前必须落盘**。

---

## 3. L2：数据库 schema 验证

### 3.1 一次性脚本（落盘待办）

`packages/server/scripts/verify-access-control-db.js`（同样在 Day 7 之前落盘）：

```javascript
'use strict'

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const AccessDevice = require('@models/AccessDevice.model')
const AccessEvent = require('@models/AccessEvent.model')
const FaceProfile = require('@models/FaceProfile.model')

async function main() {
  await connect()
  console.log('[verify-access-control-db] connected')

  // 1. 复合索引已建
  const adIdx = await AccessDevice.collection.indexes()
  const adUnique = adIdx.find(i => i.key && i.key.org === 1 && i.key.deviceSn === 1 && i.unique)
  if (adUnique) console.log('✓ AccessDevice (org, deviceSn) unique index') else console.error('✗ AccessDevice (org, deviceSn) unique index MISSING')

  const aeIdx = await AccessEvent.collection.indexes()
  const aeUnique = aeIdx.find(i => i.key && i.key.org === 1 && i.key.device === 1 && i.key.deviceEventId === 1 && i.unique)
  if (aeUnique) console.log('✓ AccessEvent (org, device, deviceEventId) unique index') else console.error('✗ AccessEvent unique index MISSING')

  const fpIdx = await FaceProfile.collection.indexes()
  const fpUnique = fpIdx.find(i => i.key && i.key.org === 1 && i.key.subjectType === 1 && i.key.subject === 1 && i.unique)
  if (fpUnique && fpUnique.partialFilterExpression && fpUnique.partialFilterExpression.revokedAt === null) {
    console.log('✓ FaceProfile (org, subjectType, subject) partial unique index')
  } else {
    console.error('✗ FaceProfile partial unique index MISSING')
  }

  await disconnect()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
```

### 3.2 跑法

```bash
node packages/server/scripts/verify-access-control-db.js
```

### 3.3 如索引缺失，手动建

```javascript
// mongosh
use <db>
db.access_devices.createIndex({ org: 1, deviceSn: 1 }, { unique: true })
db.access_events.createIndex({ org: 1, device: 1, deviceEventId: 1 }, { unique: true })
db.face_profiles.createIndex(
  { org: 1, subjectType: 1, subject: 1 },
  { unique: true, partialFilterExpression: { revokedAt: null } }
)
db.user_consents.createIndex({ subjectType: 1, subject: 1, docKey: 1, createdAt: -1 })
```

---

## 4. L3：API curl 自测

### 4.1 前置：登录拿 token

```bash
# 1. 启动 server
cd packages/server && npm run dev

# 2. 另一个终端登录拿 access token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mobile":"13800000001","password":"123456"}' | jq -r '.data.accessToken')
echo "TOKEN=$TOKEN"

# 3. 选个 org
ORG_ID=$(curl -s http://localhost:3000/api/v1/users/me/orgs \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0]._id')
echo "ORG_ID=$ORG_ID"
```

### 4.2 测试 admin 端 6 大类

```bash
# 1. 注册设备（一次性返回 webhookSigningKey）
curl -X POST http://localhost:3000/api/v1/access-control/devices \
  -H "Authorization: Bearer $TOKEN" -H "x-org-id: $ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "前门测试机",
    "vendor": "hanwang",
    "vendorModel": "F7S",
    "deviceSn": "TEST-DEV-001",
    "webhookSigningKey": "test-signing-key-123"
  }'
# 期望: 200 OK, data 含 device 完整对象 + webhookSigningKey 原文

# 2. 设备列表
curl http://localhost:3000/api/v1/access-control/devices \
  -H "Authorization: Bearer $TOKEN" -H "x-org-id: $ORG_ID"
# 期望: 200 OK, data: [{ ... 不含 webhookSigningKey ... }]

# 3. 详情（仍不含 signing key）
curl http://localhost:3000/api/v1/access-control/devices/<deviceId> \
  -H "Authorization: Bearer $TOKEN" -H "x-org-id: $ORG_ID"

# 4. 改门状态
curl -X POST http://localhost:3000/api/v1/access-control/devices/<deviceId>/door-state \
  -H "Authorization: Bearer $TOKEN" -H "x-org-id: $ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{"mode":"maintenance","reason":"测试"}'

# 5. 重置 secret（一次性返回新 key）
curl -X POST http://localhost:3000/api/v1/access-control/devices/<deviceId>/regenerate-secret \
  -H "Authorization: Bearer $TOKEN" -H "x-org-id: $ORG_ID"
```

### 4.3 测试 webhook（HMAC 验签）

```bash
# 1. 手算 HMAC
TS=$(date +%s)
EVENT_ID="evt-curl-test-001"
BODY='{"recordId":"evt-curl-test-001","type":"face","result":"success","direction":"in","similarity":0.92,"liveness":"pass","userId":"<someUserId>","userType":"student","timestamp":'$TS'}'
BODY_HASH=$(echo -n "$BODY" | shasum -a 256 | cut -d' ' -f1)
PAYLOAD="${TS}.${EVENT_ID}.${BODY_HASH}"
SIGNING_KEY="test-signing-key-123"  # 上面 regenerate-secret 拿到的真 key
HMAC=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SIGNING_KEY" | sed 's/^.* //')

# 2. POST webhook
curl -X POST http://localhost:3000/api/v1/access-control/webhook/TEST-DEV-001 \
  -H "X-Signature: $HMAC" \
  -H "X-Timestamp: $TS" \
  -H "X-Nonce: $EVENT_ID" \
  -H "Content-Type: application/json" \
  -d "$BODY"
# 期望: 200 OK, data: { ok: true, eventId, deduplicated: false }

# 3. 重复 POST 同一条 → 验证防重放
curl ... # 同样 body + headers
# 期望: 200 OK, data: { deduplicated: true, ok: true }

# 4. 时间窗越界
TS_OLD=$(($(date +%s) - 600))
# ... 重算 HMAC ...
curl -X POST ... -H "X-Timestamp: $TS_OLD" ...
# 期望: 401 Unauthorized, message: "X-Timestamp 越界"

# 5. HMAC 错
curl -X POST ... -H "X-Signature: deadbeef" ...
# 期望: 401 Unauthorized, message: "HMAC 签名不匹配"
```

### 4.4 测试 client 端

```bash
# 用 parent token 测
PARENT_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -d '{"mobile":"13800000002","password":"123456"}' | jq -r '.data.accessToken')

# active student id
ACTIVE_STUDENT=$(curl -s http://localhost:3000/api/v1/client/students \
  -H "Authorization: Bearer $PARENT_TOKEN" | jq -r '.data[0]._id')

# 给当前 active 学员录人脸
curl -X POST http://localhost:3000/api/v1/access-control/client/face-profiles/enroll-my-child \
  -H "Authorization: Bearer $PARENT_TOKEN" -H "x-org-id: $ORG_ID" \
  -H "x-active-student-id: $ACTIVE_STUDENT" \
  -F "consentRecordId=<signedConsentId>" \
  -F "photo=@/path/to/face.jpg"
# 期望: 200 OK, data: { faceProfile: { ... } }

# 列出接送授权
curl http://localhost:3000/api/v1/access-control/client/pickups \
  -H "Authorization: Bearer $PARENT_TOKEN" -H "x-org-id: $ORG_ID" \
  -H "x-active-student-id: $ACTIVE_STUDENT"
```

### 4.5 33 端点 sweep 脚本

> Day 7 之前落盘到 `scripts/verify-access-control-api.sh`（基于上面手工 curl 整理成循环）。

---

## 5. L4：端到端 PoC

详见 [HW-INTEGRATION.md](HW-INTEGRATION.md)。

---

## 6. 失败排查

| 失败现象 | 可能原因 | 修复 |
|---------|---------|------|
| `Cannot find module '@modules/accessControl/...'` | `module-alias` 未注册 | 在脚本顶部 `require('module-alias/register')` |
| `MONGODB_URI not set` | 没 `.env` | `cp packages/server/.env.example packages/server/.env` |
| `E11000 duplicate key` in AccessEvent | 正常（防重放命中）| 看响应 `deduplicated: true` |
| `X-Timestamp 越界` | 设备时钟漂移 | 调一体机 NTP；或放宽窗口到 600s（v2） |
| snapshot 上传失败 | STORAGE_DRIVER=local 没配 | `STORAGE_DRIVER=local UPLOAD_DIR=uploads` |
| webhook 一直 404 deviceSn | 设备未注册 | 先 `POST /access-control/devices` |

---

## 7. CI 集成（建议）

> 暂未集成；Day 10 之后再加。

```yaml
# .github/workflows/ci.yml (建议片段)
- name: Verify accessControl module
  run: |
    node packages/server/scripts/verify-access-control-load.js
- name: Lint
  run: cd packages/server && npm run lint
```

---
