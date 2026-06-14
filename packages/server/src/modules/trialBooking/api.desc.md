# TrialBooking (试听预约) API

招生试听的核心实体: 试听排课、到店打卡、试听结果、转化学员。

## 端点

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/v1/trial-bookings` | `recruit.read` | 看板; `?status=&from=&to=&teacher=&subject=&preStudent=&attemptNo=&page=&pageSize=` |
| GET | `/api/v1/trial-bookings/:id` | `recruit.read` | 详情 |
| GET | `/api/v1/trial-bookings/:id/removable-check` | `recruit.read` | 物理删除预检 |
| POST | `/api/v1/trial-bookings` | `recruit.write` | 单笔跟班 (`joinMode='attached'`) |
| **POST** | **`/api/v1/trial-bookings/batch-schedule`** | `recruit.write` | **批量排课 (核心)**: 1 个 LessonSchedule 挂 N 个 TrialBooking |
| PUT | `/api/v1/trial-bookings/:id` | `recruit.write` | 编辑 (仅 status='cancelled' / remark) |
| POST | `/api/v1/trial-bookings/:id/check-in` | `recruit.write` | 到店打卡 (status='arrived') |
| POST | `/api/v1/trial-bookings/:id/complete` | `recruit.write` | 完成 (status='completed', 填 result) |
| POST | `/api/v1/trial-bookings/:id/reschedule` | `recruit.write` | no_show 后再约一次 (内部走 batch-schedule) |
| POST | `/api/v1/trial-bookings/:id/convert-preview` | `recruit.convert` | 转化预览 (返回 initialPassword 等) |
| POST | `/api/v1/trial-bookings/:id/convert` | `recruit.convert` | 转化执行 (claim token + upsert 链) |
| DELETE | `/api/v1/trial-bookings/:id` | `requirePlatformPassword` | 物理删除 (completed 阻) |

## 关键业务规则

### 1:N 共享模型
- 1 个 LessonSchedule (isTrialLesson=true) 可对应 N 个 TrialBooking
- 批量排课 (batch-schedule) 一次创建 1 个 schedule + 更新 N 个 booking
- TrialBooking.lessonSchedule 在 `awaiting_schedule` 状态为空, 排课后才填

### 状态机
```
awaiting_schedule → scheduled → arrived → completed
                              ↓        ↓
                          no_show   cancelled
```

### 转化两步式 (claim token 模式)
1. `POST /convert-preview` — 软预览, 返回 `initialPassword` 等
2. `POST /convert` — 真提交:
   - **Claim token**: `TrialBooking.result.isEnrolled: null → true` (原子翻转)
   - **User upsert**: `findOneAndUpdate({mobile}, {$setOnInsert: ...}, {upsert: true})`
   - **UserOrgRel upsert**: 同上, 关联「家长」Position
   - **Student create**: 拷贝 lead.name/gender/school/grade/className
   - **Lead update**: 写回 convertedStudent/User/At
3. 5 分钟内可撤销: `POST /leads/:id/unconvert`

### 排课冲突
- batch-schedule 走 `lessonSchedule.service.detectConflict` 完整检测 (teacher/room/time)
- 试听课与正常课共用同一冲突检测 (避免老师/教室同时被约)

## 请求示例

### 批量排课
```http
POST /api/v1/trial-bookings/batch-schedule
Content-Type: application/json

{
  "bookingIds": ["65f0...", "65f1..."],
  "plannedStartTime": "2026-06-20T10:00:00.000Z",
  "plannedEndTime": "2026-06-20T11:00:00.000Z",
  "teacher": "65f0...",
  "room": "65f0..."
}

→ 201 Created
{
  "success": true,
  "data": {
    "scheduleId": "65f0...",
    "bookingCount": 2,
    "scheduledAt": "2026-06-20T10:00:00.000Z",
    "teacher": "65f0...",
    "room": "65f0..."
  }
}
```

### 转化预览
```http
POST /api/v1/trial-bookings/{id}/convert-preview

→ 200 OK
{
  "success": true,
  "data": {
    "willCreateUser": true,
    "willCreateStudent": true,
    "initialPassword": "001234",
    "previewUser": {
      "mobile": "13800001234",
      "realName": "家长-张三",
      "requirePasswordChange": true
    },
    "previewStudent": {
      "name": "张三",
      "gender": "male",
      "school": "65f0...",
      "grade": "三年级",
      "className": "2班"
    }
  }
}
```

### 转化执行
```http
POST /api/v1/trial-bookings/{id}/convert

→ 200 OK
{
  "success": true,
  "data": {
    "idempotent": false,
    "initialPassword": "001234",
    "user": { "id": "...", "mobile": "13800001234", "realName": "家长-张三", "requirePasswordChange": true },
    "student": { "id": "...", "name": "张三", "school": "...", "grade": "三年级", "className": "2班" },
    "undoWindowMs": 300000
  }
}
```
