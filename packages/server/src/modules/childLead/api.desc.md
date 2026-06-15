# 孩子潜客 (ChildLead) API

招生试听重构 (2026-06) - 替代原 `Lead` 实体 (孩子维度)。

## 端点

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/child-leads` | `recruit.read` | 列表 (支持 status/keyword/parent 过滤) |
| GET | `/child-leads/:id` | `recruit.read` | 详情 (含 activities/bookings/siblings 列表) |
| GET | `/child-leads/:id/removable-check` | `recruit.read` | 物理删除预检 |
| GET | `/child-leads/:id/activities` | `recruit.read` | 触点时间线 |
| POST | `/child-leads` | `recruit.write` | 单创建 (parentId 必填) |
| PUT | `/child-leads/:id` | `recruit.write` | 改基础信息; status 白名单 contacted/lost |
| POST | `/child-leads/:id/activities` | `recruit.write` | 记触点 + 同步刷 Parent |
| PUT | `/child-leads/:id/activities/:actId` | `recruit.write` | 编辑触点 (自己 24h 内 / 超管; 不动 byUser) |
| DELETE | `/child-leads/:id/activities/:actId` | `requirePlatformPassword` | **物理删触点** (高风险, 平台超管 + 密码; 无软删) |
| POST | `/child-leads/:id/unconvert` | `recruit.convert` | 5 分钟内撤销 |
| DELETE | `/child-leads/:id` | `requirePlatformPassword` | 物理删除 (高风险) |

## 业务规则

### 1. 状态机
- pending → contacted (createActivity 自动翻, 仅当还是 pending)
- pending/contacted → scheduled (TrialBooking.batchSchedule 自动翻)
- pending/contacted/scheduled → tried (TrialBooking.complete 自动翻)
- 任何 → converted (TrialBooking.convert 翻 + 同步翻同 parent 下其他)
- 任何 → lost (销售手动 PUT, 不带级联)

### 2. 触点同步 (跨孩)
- `createActivity` 同步:
  - `childLead.lastContactedAt/By` 写本孩
  - `parent.lastContactedAt/By/firstContactedAt` 重新聚合 (取同 parent 下所有 childLead 触点的 max/min)
- `updateActivity` / `removeActivity` / `removeActivityPermanent` 同步:
  - 改 `at` 或删触点后, 重算 `parent.lastContactedAt/firstContactedAt`
  - 改 `type` / `remark` 不影响 Parent 派生时间

### 2.1 触点编辑/删除权限 (2026-06-15 调整)
- **编辑触点** (PUT `/activities/:actId`):
  - **24 小时窗口** (`ACTIVITY_EDIT_WINDOW_MS`): 创建人可改
  - **超管** (`isPlatformAdmin`): 任何时间可改
  - **审计基线**: `byUser` 字段**不允许**通过编辑接口修改
  - **`at` 校验**: 不允许晚于当前时间 (容差 1 分钟, 防时区错乱)
- **删除触点** (DELETE `/activities/:actId`):
  - **无软删** (2026-06-15 决定): 一律物理删
  - 端点挂 `requirePlatformPassword` 中间件: 平台超管 + 二次密码
  - 普通 `recruit.write` 看不到删除入口
  - 删除后同步重算 `parent.lastContactedAt/firstContactedAt`

### 3. 撤销转化 (5 分钟窗口)
- 校验 `convertedAt` 在 5 分钟内
- 校验新 Student 无下游引用 (StudentProduct/LessonAttendance)
- 物理删 Student
- **不级联**:
  - 同 parent 下其他已 converted 的 ChildLead **不回退** (业务决策: 自动 mark 是"被带过去"语义, 撤销当前不连带)
  - User 仅在"无其他 converted 兄弟"时删; 否则保留
  - Parent.user 仅在"无其他 converted 兄弟"时解绑
- 触发 `Parent.lifecycle` 重算

### 4. 删除保护
互锁 2 项:
- TrialBooking (filter preStudent=id)
- LeadActivity (filter lead=id)

物理删除走 `requirePlatformPassword`。
