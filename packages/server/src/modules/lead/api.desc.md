# Lead (招生潜客) API

招生试听链路的第一站: 录入潜客 + 触点日志 + 转化撤销。

## 端点

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/v1/leads` | `recruit.read` | 列表; `?scope=mine\|all&status=&keyword=&phone=&from=&to=&page=&pageSize=`; 服务端对非平台超管强制 scope=mine |
| GET | `/api/v1/leads/:id` | `recruit.read` | 详情; 包含 activities 时间线 + bookings 试听历史 |
| GET | `/api/v1/leads/:id/removable-check` | `recruit.read` | 物理删除预检; 返回 `{canRemove, blockers}` |
| GET | `/api/v1/leads/:id/activities` | `recruit.read` | 触点时间线 (倒序) |
| POST | `/api/v1/leads` | `recruit.write` | 创建; 软唯一命中时返回 `{duplicate:true, lead: <existing>}` (200, 非 201) |
| PUT | `/api/v1/leads/:id` | `recruit.write` | 编辑; 屏蔽 createdBy / converted* / lastContacted*; status 仅允许 'contacted' / 'lost' |
| POST | `/api/v1/leads/:id/activities` | `recruit.write` | 记触点; 同步更新 lastContactedAt/By, 触发 pending→contacted 状态翻转 |
| POST | `/api/v1/leads/:id/unconvert` | `recruit.convert` | 5 分钟内撤销转化; 物理删除 Student / User(UserOrgRel) |
| DELETE | `/api/v1/leads/:id` | `requirePlatformPassword` | 物理删除; 互锁 TrialBooking + LeadActivity |

## 关键业务规则

- **自动建首笔 TrialBooking**: 创建 lead 时同步建一笔 `status='awaiting_schedule'`, 等批量排课流程
- **软唯一 phone**: 同 org 下 phone 命中, 不报 409, 返回 `duplicate:true` 让前端"打开既有"
- **状态机**: `pending → contacted → scheduled → tried → converted | lost`; 后三者由服务流驱动, 仅 contacted/lost 可主动改
- **撤销窗口**: 转化后 5 分钟内可撤销; 超时后端返回 422

## 请求示例

### 创建
```http
POST /api/v1/leads
Content-Type: application/json

{
  "name": "张三",
  "age": 8,
  "gender": "male",
  "phone": "13800001234",
  "school": "65f0...",
  "grade": "三年级",
  "className": "2班",
  "trialSubject": "65f0...",
  "trialFee": 99,
  "source": "walkin",
  "expectedTime": "周末下午",
  "specificDate": "2026-06-20T10:00:00.000Z",
  "remark": "家长咨询了价格"
}
```

### 软唯一命中
```http
POST /api/v1/leads
{ "name": "李四", "phone": "13800001234", ... }

→ 200 OK
{ "success": true, "data": { "duplicate": true, "lead": { "_id": "65f0...", ... } } }
```

### 记录触点
```http
POST /api/v1/leads/{id}/activities
{ "type": "call", "remark": "家长咨询了价格" }

→ 201 Created
{ "success": true, "data": { "_id": "...", "type": "call", ... } }
```
