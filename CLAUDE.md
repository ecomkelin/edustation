# EduStation 项目 CLAUDE.md

> 本文件为校外培训机构管理系统的核心开发指引，供 Claude Code (CC) 协作开发时读取。  
> 每次会话都用得到的核心约定在此；具体数据模型 / 模块设计见 [docs/claude/](docs/claude/) 子目录。

---

## ⚠️ 0. 开发阶段声明（最高优先级）

**本项目目前处于开发阶段，不存在需要兼容的线上数据。所有重构、模型变更、API 调整都按"全新优化"执行，不需要考虑向后兼容。**

- ✅ **schema 可以直接改**：删字段、改类型、改 enum 值、改 collection 名 — 全部允许。改完直接 `pnpm db:seeds` 全量重灌。
- ✅ **老数据可以格式化**：任何 collection 都可以 `db.collection.drop()` 重灌，不需要写迁移脚本（`scripts/migrate-*.js`）。
- ✅ **老代码可以直接重构**：API 路由、字段名、枚举值想改就改；不需要保留兼容 shim、不需要 `isLegacy` 分支、不需要双写过渡期。
- ✅ **API 路径可以改**：`/api/v1/old/path` → `/api/v1/new/path` 直接换；前端跟着改即可。
- ✅ **schema 注释里"兼容历史数据"这类话术可以直接删**：那是过去式，开发阶段没必要背着。

**唯一例外**：已经在 docs/claude/ 里的"历史整改记录"（如 Org.type 整改 2026-06-15）保留作为决策溯源，但**今后不要再写新的兼容代码**。

**反面例子（禁止）**：
- ❌ "为兼容老数据，新字段可选 + 老字段保留"
- ❌ "新增 status enum 值时保留老的 status 字符串"
- ❌ "schema 改动时写 `migrate-xxx.js` 双轨运行"
- ❌ "API 返回同时给新旧两个字段名"

---

## 1. 项目愿景与商业模式
- **SaaS 多租户**：所有业务数据通过 `org` 字段隔离，第一家机构即第一个租户。
- 支持未来**私有化部署**（Docker + License）。
- 业务覆盖：科技与艺术类培训，核心流程为学生管理 → 课包购买 → 排课消课 → 考勤作品。

## 2. 用户角色与权限
- **平台超管**：跨机构管理。
- **机构角色**：管理员、教务、老师、家长。通过 Position 的 `permissions: [String]` 控制。
- **学生**：不登录系统，由家长（User）切换上下文代理操作。
- **权限文件**：`shared/permissions.json`，前后端共享。

## 3. 技术栈
| 层       | 技术                                      |
| -------- | ----------------------------------------- |
| 后端     | Node.js + Express + Mongoose (MongoDB)    |
| 管理后台 | Vue 3 + Vite + Element Plus               |
| 客户端   | uni-app（微信小程序、H5、App）            |
| 桌面应用 | Tauri 打包管理后台（备用 Electron）       |
| 项目管理 | pnpm monorepo                             |

## 4. 项目结构（Monorepo）
```
edustation/
├── pnpm-workspace.yaml
├── packages/
│   ├── server/    # 后端
│   ├── admin/     # 管理后台 Vue3
│   └── client/    # 客户端 uni-app
├── shared/        # 权限码、类型定义、枚举
├── docs/
│   └── claude/    # Claude 协作知识库（数据模型 / 模块设计）
├── CLAUDE.md      # 本文件
└── README.md
```

## 5. 认证与会话管理（重要）
- **Access Token**：短有效期，放 `Authorization` Header。
- **Refresh Token**：必须使用 **httpOnly, Secure, SameSite=Strict** Cookie，路径 `/api/auth/refresh`。
- 登录返回 access token，同时设置 refresh cookie。刷新时轮换 refresh token。

## 6. 家长与子女交互设计（重要）
- 家长登录后始终在顶部显示当前活跃子女（单子女**不跳过选择步骤**，保持 UI 统一）。
- 单子女时显示"当前孩子：xx"，但无切换列表；多子女时可切换。
- 所有学生接口在请求头中传递 `x-active-student-id`。

---

## 7. 数据模型约定（详见子文件）

> 所有外键使用小写实体名（如 `student`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

**按业务域的详细 schema 见：**

- 机构与字典 → [docs/claude/data-models-org.md](docs/claude/data-models-org.md)
- 用户/职位/权限 → [docs/claude/data-models-user.md](docs/claude/data-models-user.md)
- 学生 → [docs/claude/data-models-student.md](docs/claude/data-models-student.md)
- 课程与开班 → [docs/claude/data-models-course.md](docs/claude/data-models-course.md)
- 报名/排课/消课 → [docs/claude/data-models-enrollment.md](docs/claude/data-models-enrollment.md)
- 订单/课包 → [docs/claude/data-models-order.md](docs/claude/data-models-order.md)
- 积分/宠物 → [docs/claude/data-models-points-pet.md](docs/claude/data-models-points-pet.md)
- 招生/潜客/试听 → [docs/claude/data-models-recruit.md](docs/claude/data-models-recruit.md)
- 文件存储 → [docs/claude/data-models-storage.md](docs/claude/data-models-storage.md)
- 人脸门禁 → [docs/claude/data-models-access.md](docs/claude/data-models-access.md)

---

## 8. 后端分层与模块组织
采用"领域分组 + 垂直切片"模式。当模块过多时，在 `modules/` 下用分组文件夹聚合。
```
server/src/
├── app.js
├── config/         # index.js / db.js / permissions.js
├── middlewares/    # auth / authorize / orgContext / errorHandler
├── models/         # 所有 Mongoose 模型集中
├── modules/
│   └── auth/       # 登录、刷新、登出
│       ├── auth.router.js
│       ├── auth.controller.js
│       ├── auth.service.js
│       └── auth.validator.js
│   └── org/
│   └── ***
└── utils/
```

### 8.1 破坏性操作门控（删除保护）

所有 `DELETE` 路由必须满足**三重防护**：

1. **身份门槛**：`requirePlatformPassword` 中间件
   - 必须 `req.user.isPlatformAdmin`（平台超管）。
   - 必须从 `body.password` 二次确认自身登录密码（`argon2.verify` 与 `User.passwordHash` 对照）。
   - 由 [packages/server/src/middlewares/requirePlatformPassword.js](packages/server/src/middlewares/requirePlatformPassword.js) 统一实现；**所有新接入模块直接套用**。

2. **业务互锁**：service.remove 内用 [`@utils/removable.assertUnused`](packages/server/src/utils/removable.js) 校验下游引用
   - 互锁检查声明（`Array<{ model, filter, label, hint }>`）抽成**命名函数**（`xxxUsageChecks(orgId, id)`），与 `removableCheck` 共用同一组声明，单点维护。
   - 任意一项 `countDocuments > 0` → 抛 `ApiError.unprocessable`（422），错误 `data.blockers` 携带全部阻挡详情。

3. **预检端点**：`GET /:id/removable-check`
   - 普通业务岗（`<module>.read` 权限）即可调用，**不**需超管+密码。
   - 返回 `{ canRemove: boolean, blockers: [{entity,label,count,hint}] }`，供前端在删除按钮触发前先弹挡板说明。
   - 必须用同一组 `xxxUsageChecks`，与 `service.remove` 互锁语义保持完全一致。

**禁止物理删除的实体**（业务上只走"停用"/"下架"/"归档"）：

- **Org（机构）**：SaaS 根，整条业务链挂上面。**禁用 DELETE 路由**；用 `PUT /orgs/:id/active`（toggleActive）切换启用。

**允许物理删除但需互锁的实体**：

- **CourseProduct（课程产品）**：被 `Order.items[].courseProduct` / `StudentProduct.courseProduct` 强引用。
  - DELETE 路由**存在**，但 `service.remove` 内 `assertUnused` 校验两项 count=0 才放行；
  - 有引用时返回 422 + `data.blockers`（含具体订单数/课包数 + 中文操作建议）；
  - 前端用 `<DestructiveConfirm>` + `:precheck` 让用户在弹密码前先看到挡板；
  - 业务上仍推荐用 `PUT /:id {isActive:false}` "下架"——只有"彻底不要这门课"才走物理删除。
- **Room（教室）**：被 `CourseInstance.room` / `LessonSchedule.room` 强引用。
  - DELETE 路由**存在**，但 `service.remove` 内 `assertUnused` 校验：
    - `CourseInstance` 未软删 (`deletedAt: null`)
    - `LessonSchedule` 未归档 (`status ≠ 'archived'`)
  - 已归档的开班/排课**不**挡（历史不再展示在排课视图）；
  - 前端用 `<DestructiveConfirm>` + `:precheck`，`handleRemoveError` 兜底；
  - 业务上仍推荐用 `PUT /:id {isActive:false}` "停用"——只有"该教室彻底不再使用"才走物理删除。

**前端配套**：

- 所有破坏性确认走 [`<DestructiveConfirm>`](packages/admin/src/components/DestructiveConfirm.vue)（统一"高风险说明 + 输密码"两段式）。
- 通过 `:precheck` prop 接入 `removable-check` 预检；`canRemove=false` 时自动弹挡板，不进入密码输入。
- **兜底**：每个 `onRemoveConfirm` 的 catch 必须调 `handleRemoveError(err, '无法删除 · 高/中风险')`——
  - 若后端在预检通过后又被新数据挡住（竞态），仍能从 `err.response.data.data.blockers` 还原出完整挡板说明；
  - 无结构化 blockers 时（如密码错/403）原样 rethrow，由 axios 拦截器 ElMessage。
- API 范式：`remove: (id, { password } = {}) => http.delete(url, { data: { password } })`。
- 工具函数：[`packages/admin/src/utils/removable.js`](packages/admin/src/utils/removable.js) 提供 `formatBlockers` / `showBlockedAlert` / `handleRemoveError` / `removableCheckThen`。

---

## 9. API 规范
- 基础路径：`/api/v1`
- 请求头：`Authorization: Bearer <access>`、`x-org-id`、可选 `x-active-student-id`
- 响应格式：`{ success: true, data }` / `{ success: false, message }`
- 关键端点见各模块的 `api.desc.md`。

## 10. 管理后台 (Vue3)
- 根据当前机构 Position 权限动态渲染菜单。
- 顶部切换机构，排课界面预留冲突检测。
- 构建后由 Tauri 打包为桌面应用。在打包文档中写清楚如何打包。

## 11. 客户端 (uni-app)
- 家长登录后始终显示当前孩子，单子女时简化但保留切换元素。
- 页面：首页（课表）、宠物乐园、分享、我的。
- 分享功能通过追踪参数回传加分。
- 在打包文档中写清楚如何打包成微信小程序、苹果手机 App、安卓手机 App。

## 12. 开发阶段与任务
### 阶段 1：MVP (6周)
- [x] monorepo 初始化、Express 搭建、Mongoose 连接
- [x] 认证模块（cookie refresh token）
- [x] 机构、用户、职位权限
- [x] 学生管理、家长关联
- [x] 课程产品与开班 CRUD（学科、CourseProduct、CourseInstance、教室）
- [x] 课程报名（CourseEnrollment：仅校验开班状态；不强制 StudentProduct / maxStudents，超额通过"分班"解决）
- [x] 手动排课（LessonSchedule + 自动按 CourseEnrollment 生成 LessonAttendance）
- [x] 下单购课（Order → StudentProduct）
- [x] 考勤自动消课（FIFO 选包 + 作品上传）
- [x] 管理后台基础界面

### 阶段 2：多机构 & C端 (4周)
- [x] 机构隔离与切换
- [x] 家长端小程序：登录、查看孩子、课表
- [x] 积分账户、宠物基础喂养
- [x] 分享得积分（简单实现）

### 阶段 3：商用强化 (6周)
- [ ] 排课冲突检测
- [ ] 财务报表
- [ ] 分享裂变、积分商城
- [ ] 多租户计费
- [ ] Tauri 打包发布、小程序上线

### 阶段 4：AI与实时（远期）
- [ ] 大模型集成、WebSocket 通知、数据分析

## 13. 命名约定与关键决策
- 订单命名：`Order`
- 课程产品：`CourseProduct`（合并了原 `CourseTemplate` + `CoursePackage`）
- 开班实体：`CourseInstance`（开班）→ `CourseEnrollment`（报名）→ `LessonSchedule`（排课）→ `LessonAttendance`（考勤）→ `StudentWork`（作品）
- 刷新令牌：仅通过 httpOnly cookie 传输
- 家长单子女：UI 上保留切换元素，但不弹出选择器
- 字段扩展：核心字段显式定义，附加信息存入 `meta: {}` 字段
- 模块组织：领域分组 + 垂直切片
- 内存型知识（一次性教训/坑点）→ 写到 `~/.claude/projects/.../memory/`，不塞回 CLAUDE.md

---

## 14. 何时读 docs/claude/ 下的文件

> 本文件只保留每次都用得到的核心约定。具体的数据模型 / 模块设计在子文件里。
> 工作时如果触发以下任一场景，**Read 整个对应文件**再动手；不要凭印象猜。

| 场景 | 读哪个文件 |
|---|---|
| 改机构 / Org / 推广 / 业态分类 / Category 字典 | [docs/claude/data-models-org.md](docs/claude/data-models-org.md) |
| 改用户 / 登录 / 权限码 / 职位 / 多租户身份 | [docs/claude/data-models-user.md](docs/claude/data-models-user.md) |
| 改学生 / 家长切换 / 监护人 | [docs/claude/data-models-student.md](docs/claude/data-models-student.md) |
| 改学科 / 课程产品 / 开班 / 排课计划 | [docs/claude/data-models-course.md](docs/claude/data-models-course.md) |
| 改报名 / 排课 / 考勤 / 作品 / 消课选包 | [docs/claude/data-models-enrollment.md](docs/claude/data-models-enrollment.md) |
| 改订单 / 课包 / 支付 / 赠课 | [docs/claude/data-models-order.md](docs/claude/data-models-order.md) |
| 改积分 / 宠物 / 喂养 / 商店 | [docs/claude/data-models-points-pet.md](docs/claude/data-models-points-pet.md) |
| 改招生 / 潜客 / 家长业务档案 / 试听 / 转化 | [docs/claude/data-models-recruit.md](docs/claude/data-models-recruit.md) |
| 改文件上传 / File / Storage 驱动 / 引用追踪 | [docs/claude/data-models-storage.md](docs/claude/data-models-storage.md) |
| 改人脸识别 / 门禁 / 接送授权 | [docs/claude/data-models-access.md](docs/claude/data-models-access.md) |
| 改 AI 助手 / RAG / 会话持久化 | [docs/claude/ai-assistant.md](docs/claude/ai-assistant.md) |
| 改经营看板 / 报表 / 聚合管道 | [docs/claude/dashboards.md](docs/claude/dashboards.md) |

## 15. 新增知识到本仓库的约定

- **新数据模型 / 业务域**：在 `docs/claude/data-models-<domain>.md` 新建或追加；不要塞回 CLAUDE.md。
- **新非模型知识**（如支付对接 / 税务规则 / 外部集成）：建 `docs/claude/<topic>.md`。
- **新通用约定 / 命名 / 横切规则**（每次都用）：加进 CLAUDE.md 对应章节。
- 新子文件顶部必须有 `> 何时读这个文件：...` + 1 行摘要，方便模型快速判断是否对路。
- 新子文件加入 §14 "何时读" 表。
- **一次性坑点 / 调试教训**（如某字段类型 bug、某 API 误用）：写到 `~/.claude/projects/.../memory/` 对应文件，不写进 docs/claude/。

## 16. 维护规则

每次重大架构变更或决策后，更新本文件或对应 `docs/claude/` 子文件，并通知协作者。
