# TODO — 人脸识别门禁模块待办清单

> 详细计划见 `../plans/zesty-discovering-forest.md`。
> 进度同步：每完成一项打 ✅ + commit hash；新任务直接加在对应 day 下。

---

## Day 1-6：后端核心（✅ 已完成）

- ✅ 4 个新 model（AccessDevice / FaceProfile / AccessEvent / AuthorizedPickup）
- ✅ 12 个新 enum（shared/enums.js）
- ✅ 3 个权限码（accessControl.read/write/pickup）
- ✅ 4 处权限码同步（permissions.json + DEFAULT_POSITIONS + migrate + startupMigrations）
- ✅ 5 个 driver 文件（base / hanwang 完整 / hikvision / dahua / index 工厂）
- ✅ webhookAuth 中间件（HMAC + timestamp + eventId + IP 软防御）
- ✅ 34 函数 service + 20 校验器 + 34 handler
- ✅ 33 端点路由（webhook 2 + admin 22 + client 9）
- ✅ app.js 先于 express.json 挂载 webhook
- ✅ 迁移脚本 `scripts/migrate-add-access-control-perms.js`（幂等）
- ✅ API 文档 `api.desc.md`
- ✅ 模块加载验证（语法 + 全部 33 端点注册）

**session 期间产出**（本会话）：
- ✅ README.md（总纲）
- ✅ DESIGN.md（设计决策 + 架构）
- ✅ TODO.md（本文件）
- ✅ MIGRATION.md / VERIFICATION.md / HW-INTEGRATION.md / COMPLIANCE.md / V2-BACKLOG.md

---

## Day 7-9：前端（⏳ 待开始）

### Admin（`packages/admin/src/views/accessControl/`）

| # | 文件 | 优先级 | 状态 |
|---|------|--------|------|
| A1 | `Devices.vue`（设备列表 + 注册/编辑/regenerate-secret/门状态/心跳） | P0 | ⏳ |
| A2 | `AccessLogs.vue`（流水列表 + 抓拍预览 + 统计卡片） | P0 | ⏳ |
| A3 | `PickupAuths.vue`（接送授权管理） | P0 | ⏳ |
| A4 | `DeviceEditDialog.vue`（设备表单） | P0 | ⏳ |
| A5 | `PickupEditDialog.vue`（接送授权表单，联动 User 搜索） | P0 | ⏳ |
| A6 | `AccessEventDetailDialog.vue`（事件详情 + snapshot 缩略） | P1 | ⏳ |
| A7 | `FaceEnrollTab.vue`（学员详情 Dialog 内嵌人脸 tab） | P1 | ⏳ |
| A8 | `packages/admin/src/api/accessControl.js`（API wrapper） | P0 | ⏳ |
| A9 | `packages/admin/src/router/index.js`（3 个 path） | P0 | ⏳ |
| A10 | `packages/admin/src/layouts/DefaultLayout.vue`（menuGroups 加 `hardware` 组） | P0 | ⏳ |

### Client（`packages/client/src/pages/faceAccess/`）

| # | 文件 | 优先级 | 状态 |
|---|------|--------|------|
| C1 | `enroll.vue`（拍人脸 → 上传） | P0 | ⏳ |
| C2 | `pickup-auth.vue`（接送人列表 + 新增/撤销） | P0 | ⏳ |
| C3 | `access-log.vue`（孩子进出流水） | P1 | ⏳ |
| C4 | `packages/client/src/api/faceAccess.js` | P0 | ⏳ |
| C5 | `packages/client/src/manifest.json` 补 camera 权限（Android + mp-weixin） | P0 | ⏳ |
| C6 | `packages/client/src/components/agreement-modal.vue` 扩展（face-consent-* 走 pending） | P0 | ⏳ |

### 联调

| # | 内容 | 状态 |
|---|------|------|
| T1 | Admin 注册设备 → 一体机收到 signing key | ⏳ |
| T2 | Client 录入学员人脸 → 后端 FaceProfile 落库 | ⏳ |
| T3 | Client 撤回同意书 → FaceProfile 软撤销 | ⏳ |
| T4 | Admin 接送授权 → Client 列表可见 | ⏳ |

---

## Day 10：合规 + 文档（⏳ 部分完成）

| # | 内容 | 优先级 | 状态 |
|---|------|--------|------|
| D1 | CLAUDE.md §17 增补（17.1-17.8 八节） | P0 | ⏳ |
| D2 | `scripts/seed-face-consent-docs.js`（新机构 seed 三条 docKey） | P0 | ⏳ |
| D3 | `startupMigrations.js` 注册 `seedFaceConsentDocs` 兜底 | P0 | ⏳ |
| D4 | `packages/server/README.md` 增补"硬件接入"小节 | P1 | ⏳ |
| D5 | 同意书正文（3 份 LegalDoc 模板） | P0 | ⏳ |

---

## Day 11-12：PoC 硬件联调（⏳ 需线下）

| # | 任务 | 负责 | 状态 |
|---|------|------|------|
| H1 | 采购熵基 F7S（~700-900 元，淘宝） | kelin | ⏳ |
| H2 | 在一体机后台配 webhook URL + signing key | kelin | ⏳ |
| H3 | 录入测试学生 3-5 张人脸到一体机 | kelin | ⏳ |
| H4 | 实际刷脸 → server AccessEvent 写入 | kelin | ⏳ |
| H5 | 家长小程序 unipush 收到推送（需提前配 unipush 厂商） | kelin | ⏳ |
| H6 | 接送场景端到端：家长小程序签同意 → 录入人脸 → 一体机刷脸 → 开门 | kelin | ⏳ |
| H7 | 撤回测试：撤销某人脸 → 重试刷脸 → 流水 result='denied' | kelin | ⏳ |

---

## Day 13-14：稳定性 + v2 计划（⏳ 需线下）

| # | 任务 | 状态 |
|---|------|------|
| S1 | 模拟网络抖动：连续 POST 同一 eventId → 验证 `{deduplicated: true}` | ⏳ |
| S2 | 模拟时间窗越界：X-Timestamp = now-600s → 期望 401 | ⏳ |
| S3 | 模拟断电：服务器宕机 5 分钟 → 启动后设备重发 → 验证幂等 | ⏳ |
| S4 | HMAC 验签错：X-Signature 改 1 字符 → 期望 401 + timingSafeEqual | ⏳ |
| S5 | 设备报 `recognized` 但服务端查不到 FaceProfile → 降级为 `stranger` + `denied` | ⏳ |
| S6 | livenessResult = 'failed' → 强制 result='denied' | ⏳ |
| S7 | doorState.mode = 'maintenance' → 强制 result='denied' | ⏳ |
| S8 | 30 天后 snapshot retentionUntil 过期 → 手动 SQL 清理（v2 cron） | ⏳ |
| S9 | 写 v2 backlog 文档（拆分 polymorphic / unipush / 自动清理 / 多机构对比） | ✅ V2-BACKLOG.md 已完成 |

---

## 知识收尾（v2 之前可陆续做）

| # | 内容 | 状态 |
|---|------|------|
| K1 | 写一篇 walkthrough 博客（PoC 选型 + 一周开发总结） | ⏳ |
| K2 | 硬件接入 checklist 模板（让第二个机构复制粘贴） | ⏳ |
| K3 | 常见问题 FAQ（家长端"为什么我录不进去"等） | ⏳ |
| K4 | 撤回流程图（用户视角 + 后台视角） | ⏳ |

---

## 注意事项

1. **每完成一项**打 ✅ + commit hash，并更新本文件
2. **新增需求** 直接加在对应 day 下，**不**开新文件
3. **v2 候选**（如反人类的需求"加考勤联动"）直接加到 [V2-BACKLOG.md](V2-BACKLOG.md)，不混进 TODO
4. **Day 7-14 是预估**，实际进度以 commit 为准
