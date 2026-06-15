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
