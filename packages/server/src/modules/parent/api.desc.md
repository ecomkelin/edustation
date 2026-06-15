# 家长账户 (Parent) API

招生试听重构 (2026-06) - 替代原 `Lead` 模块, 引入 Parent + ChildLead 二分模型。

## 核心端点

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/parents` | `recruit.read` | 列表 (支持 lifecycle/source/keyword/phone/promoteBy/consultant/tag 过滤) |
| GET | `/parents/:id` | `recruit.read` | 详情 (含 childLeads/activities/bookings 列表) |
| GET | `/parents/:id/removable-check` | `recruit.read` | 物理删除预检 |
| GET | `/parents/:id/activities` | `recruit.read` | 触点时间线 (聚合该家长下所有孩子的触点) |
| **POST** | **`/parents/with-child`** | `recruit.write` | **核心**: 1 API 创建 Parent + 1 ChildLead + N TrialBooking |
| POST | `/parents/:id/children` | `recruit.write` | 同家长加孩 |
| PUT | `/parents/:id` | `recruit.write` | 改 source/promoteBy/consultant/remark 等 |
| POST | `/parents/:id/recompute-lifecycle` | `recruit.write` | 手动重算 lifecycle |
| POST | `/parents/:id/tags` | `recruit.write` | 加标签 |
| DELETE | `/parents/:id/tags/:tagId` | `recruit.write` | 删标签 |
| DELETE | `/parents/:id` | `requirePlatformPassword` | 物理删除 (高风险) |

## 业务规则

### 1. 软唯一 phone
- `POST /parents/with-child` 软唯一: 同 org 下 phone 命中 → 返回 `{duplicate: true, parent}` (200), 不报错
- `body.force=true` 跳过软唯一, 创建新 Parent (业务上极少见, 同 phone 多家长允许但语义不推荐)

### 2. lifecycle 状态机
- `new`     刚登记, 所有孩子未报名
- `partial` 部分孩子报名
- `full`    所有孩子都报名
- `lost`    打了 '已流失' LeadTag, 或全部 ChildLead 都 lost
- `dormant` 长期未联系 (阶段 2 定时任务翻)

**自动重算触发点**:
- `childLead.service.createActivity` 不触发
- `childLead.service.unconvert` 触发
- `trialBooking.service.convert` 触发 (还会自动 mark 同 parent 下其他 ChildLead)
- `parent.service.addChild` 触发
- `parent.service.addTag/removeTag` 中, '已流失' 标签时强制 lost

**手动重算**: `POST /parents/:id/recompute-lifecycle`

### 3. 标签 → lifecycle 互锁
- 加 '已流失' 标签 → 强制 `lifecycle='lost'`
- 删 '已流失' 标签 → 触发 recompute (可能恢复到 new/partial/full)

### 4. 触点同步
- LeadActivity 引用 ChildLead, 不直接引用 Parent
- `childLead.service.createActivity` 时:
  - 同步更新 childLead.lastContactedAt/By
  - 同步更新 parent.lastContactedAt/By (取 max of 所有 childLead 触点)

### 5. 删除保护
互锁 3 项:
- ChildLead (filter parent=id)
- TrialBooking (filter parent=id)
- LeadActivity (filter lead ∈ childLeadIds)

任一 count>0 → 422 + 完整 blockers 列表, 业务上推荐"加 lost 标签"而非物理删除。

## 关键端点示例

### POST /parents/with-child
```jsonc
// Request
{
  "phone": "13800001234",
  "name": "张三",         // 第一个孩子的姓名
  "gender": "male",
  "age": 8,
  "school": "...id...",
  "grade": "三年级",
  "className": "2班",
  "trialSubjects": ["...pythonId...", "...goId..."],  // 1 孩多课
  "source": "walkin",
  "promoteBy": "...salesId...",
  "remark": "周六地推"
}

// Response 201
{
  "success": true,
  "data": {
    "duplicate": false,
    "parent": { ... },
    "childLead": { ... }
  }
}

// 若命中软唯一: 200 + { duplicate: true, parent: 既有 }
```

### POST /parents/:id/children
```jsonc
// Request
{
  "name": "张三妹",
  "age": 5,
  "trialSubjects": ["...goId..."],
  "sameAs": ["...张三._id..."]  // 跨年重试: 链式追溯
}
```
