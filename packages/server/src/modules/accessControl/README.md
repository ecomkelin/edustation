# 人脸识别门禁 (accessControl)

> 2026-06 立项，单校区门禁 + 接送核验。
> 算法路径：一体机本地 InsightFace 级 SOTA（**不依赖云 API**，免合规评估）。
> 算法采购预算 < ¥1,000；本模块只承担"算法结果回传 + 业务编排"，算法本身跑在一体机本地。

---

## 📚 文档导航

| 文档 | 内容 | 谁要看 |
|------|------|--------|
| **[README.md](README.md)** | 总纲（本文） | 全员 |
| **[DESIGN.md](DESIGN.md)** | 架构、数据模型、3 个关键决策、12 个 enum、安全设计 | 后端 / 架构师 |
| **[API.md](api.desc.md)** | 33 端点完整 API 文档（已存在） | 前端 / 联调 |
| **[MIGRATION.md](MIGRATION.md)** | 迁移步骤、初始化 checklist、回滚 | 运维 / 上线 |
| **[VERIFICATION.md](VERIFICATION.md)** | curl 自测、模块加载验证、联调 checklist | 联调 / QA |
| **[HW-INTEGRATION.md](HW-INTEGRATION.md)** | 熵基 F7S / 汉王 D8 现场接入步骤 | 部署 / 硬件 |
| **[COMPLIANCE.md](COMPLIANCE.md)** | PIPL / 撤回 / snapshot 30 天 / 本地化存储硬约束 | 法务 / 合规 |
| **[TODO.md](TODO.md)** | Day 7-14 待办清单 | 全员 |
| **[V2-BACKLOG.md](V2-BACKLOG.md)** | v2 计划 + 已知风险 | 架构师 / PM |

---

## 业务范围（一句话）

学员到校刷脸识别 + 家长接送刷脸核验；其余场景（员工考勤、陌生人告警、尾随检测）**不实现**，v2 再说。

## 3 个关键决策（已锁，不再讨论）

| # | 决策 | 落地 |
|---|------|------|
| 1 | **范围** = 学员到校识别 + 家长接送核验 | 4 个新 model + 9 client 端点 |
| 2 | **电子同意书** = 家长端小程序签 | 复用 `UserConsent` 加 2 字段 + `LegalDoc` 3 条 docKey |
| 3 | **考勤联动** = 不联动（只记进出） | `AccessEvent` 与 `LessonAttendance` **不写关联字段** |

> 完整决策背景与 trade-off 详见 [DESIGN.md §1](DESIGN.md#1-三个关键决策)。

## 核心数据模型

| Model | Collection | 用途 |
|-------|-----------|------|
| `AccessDevice` | `access_devices` | 门禁一体机注册（SN/厂商/HMAC key/门锁状态） |
| `FaceProfile` | `face_profiles` | 人脸档案（polymorphic: 学员/家长/第三方接送人） |
| `AccessEvent` | `access_events` | 进出流水（含 snapshot 文件引用、防重放唯一索引） |
| `AuthorizedPickup` | `authorized_pickups` | 家长接送授权（有效区间 + 软撤销） |

**复用现有 model**：`UserConsent`（加 `subjectType`/`subject`） / `File`（加 3 个 scope） / `LegalDoc`（3 条 docKey）。

## 端点速览（33 个）

- **Webhook 2 个**（无 auth，HMAC 验签）
  - `POST /api/v1/access-control/webhook/:deviceSn` — 进出事件
  - `POST /api/v1/access-control/webhook/:deviceSn/heartbeat` — 设备心跳
- **Admin 22 个**（auth + `accessControl.read/write/pickup` 权限码）
  - 设备 8 / 人脸档案 5 / 流水 3 / 接送 5 / 同意书 1
- **Client 9 个**（auth + 部分走 `requireActiveStudent`）
  - 录入 2 / 接送 3 / 流水 2 / 同意书 3

> 完整 endpoint 表格见 [api.desc.md](api.desc.md)。

## 权限码（3 个，挂 4 个系统职位）

```
accessControl.read    - 管理员/教务/老师/财务 全挂
accessControl.write   - 管理员/教务
accessControl.pickup  - 管理员/教务
家长走 client 端 auth + activeStudent，**不**走权限码
```

## 文件结构

```
modules/accessControl/
├── README.md                    # 本文件（总纲）
├── DESIGN.md                    # 设计决策 + 架构
├── api.desc.md                  # API 端点完整文档
├── MIGRATION.md                 # 迁移步骤
├── VERIFICATION.md              # 验证脚本 + curl
├── HW-INTEGRATION.md            # 硬件联调
├── COMPLIANCE.md                # PIPL / 撤回 / snapshot
├── TODO.md                      # Day 7-14 待办
├── V2-BACKLOG.md                # v2 计划
│
├── accessControl.routes.js              # 主路由（admin + client 端）
├── accessControl.webhookRoutes.js       # webhook 路由（先于 express.json 挂）
├── accessControl.controller.js          # 34 HTTP handler
├── accessControl.service.js             # 34 业务函数（899 行）
├── accessControl.validator.js           # 20 组 express-validator
├── webhookAuth.middleware.js            # HMAC + timestamp + eventId 中间件
│
└── drivers/
    ├── base.js                  # 抽象基类（normalizeEvent 等）
    ├── hanwang.js               # 汉王/熵基 通用协议 (PoC 第一版, 143 行)
    ├── hikvision.js             # stub
    ├── dahua.js                 # stub
    └── index.js                 # 工厂
```

## 5 分钟上手

```bash
# 1. 安装依赖（应该已经装过，但确认一下）
cd packages/server && npm install

# 2. 跑迁移（幂等，可重跑）
node packages/server/scripts/migrate-add-access-control-perms.js

# 3. 启动 dev server
cd packages/server && npm run dev

# 4. 跑模块加载验证
node packages/server/scripts/verify-access-control-load.js
# 期望: ✓ 4 model / ✓ 33 routes / ✓ 12 enum / ✓ 3 perm
```

## 当前进度

- ✅ **Day 1-6 后端**（本次会话完成）：4 model + 12 enum + 3 perm + 5 driver + 33 端点 + 迁移脚本 + API 文档
- ⏳ **Day 7-9 前端**：Admin 3 列表页 + 4 dialog + Client 3 页面 + manifest 权限
- ⏳ **Day 10 文档**：CLAUDE.md §17 + LegalDoc seed 脚本
- ⏳ **Day 11-12 PoC 联调**：采购熵基 F7S + 现场硬件接入
- ⏳ **Day 13-14 稳定性**：幂等 / 重放 / 断网测试

> 详细待办见 [TODO.md](TODO.md)。

## 重要安全约束

1. **Webhook 必须先于 express.json 挂载**（`app.js:25-26`）—— 否则 HMAC 验签拿不到 rawBody
2. **org 在 webhookAuth 中间件锁定**，**不读 body 里的 org** —— 防越权
3. **snapshot 强制走 local driver** —— 禁 S3/OSS（详见 [COMPLIANCE.md](COMPLIANCE.md)）
4. **物理删除走 `requirePlatformPassword` + removable-check** —— 与 Org/Position 同款三重防护
5. **撤回走 `withdrawAt` 写入**（不物理删 UserConsent）—— PIPL 留痕
6. **livenessResult !== 'passed' → result='denied'** —— service 层硬卡，禁照片攻击

## 联系

任何设计变更请先更新 `DESIGN.md`，再动代码。改完代码后**必须**重跑 `VERIFICATION.md` 的验证脚本。
