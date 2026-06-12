# LessonAttendance 模块 API 文档

> 基础路径：`/api/v1/lesson-attendances`
>
> 考勤管理。`LessonAttendance` 记录某个学生在某节排课（`LessonSchedule`）的出勤情况，
> 关联到该学生持有的 `StudentProduct`，在"消课"（`complete`）时**扣减剩余课时**。
>
> 状态机：`scheduled`（已排）→ `checked_in`（已签到）→ `completed`（已消课）/ `no_show`（未到）。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `lessonAttendance.read`
  - `lessonAttendance.write`
- 状态枚举（`ATTENDANCE_STATUSES`）：`scheduled` / `checked_in` / `completed` / `no_show`。
- **业务关键约束**：
  - `(lessonSchedule, student)` 唯一 —— 一节课一个学生一条考勤。
  - `complete`（消课）会**事务性地扣减** `StudentProduct.remainingLessons`，扣到 0 时自动 `isActive=false`。
  - 排课时**仅**为"持有 `CourseInstance.acceptedCourseProducts` 中任一课程产品下的有效 StudentProduct"的学生生成考勤；没有可用课包的学生不会出现在考勤名单中。
  - `studentProduct` 为 null（历史/手工补录场景）时不允许 `complete`，需先 `checkIn` 时指定。
  - 选包按 FIFO（`expireDate` 升序），且 `StudentProduct` 可以是 `source='gift'`（赠课）的。

---

## 1. 考勤列表

- **Method / Path**：`GET /api/v1/lesson-attendances`
- **权限**：`lessonAttendance.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| lessonSchedule | String (ObjectId) | 按排课过滤 |
| student | String (ObjectId) | 按学生过滤 |
| studentProduct | String (ObjectId) | 按持有的课包过滤 |
| status | String | 状态过滤（可逗号分隔多值） |
| start | Date (ISO8601) | 配合排课的开始时间下界 |
| end | Date (ISO8601) | 配合排课的结束时间上界 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 50 |

- **成功响应** (`200 OK`)：`{ data: { items: LessonAttendance[], total, page, pageSize } }`。

`LessonAttendance` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | LessonAttendance._id |
| lessonSchedule | Object | 关联排课（populate） |
| student | Object | 学生（populate） |
| studentProduct | Object\|null | 扣减课时的课包（populate）；可空（仅历史/手工补录场景），null 时不允许 `complete` |
| status | String | 状态枚举 |
| actualStartTime | Date\|null | 实际签到时间 |
| actualEndTime | Date\|null | 实际结束时间 |
| remark | String | 备注 |
| meta | Object | 扩展属性 |

---

## 2. 签到

- **Method / Path**：`POST /api/v1/lesson-attendances/check-in`
- **权限**：`lessonAttendance.write`
- **说明**：为某节排课的某个学生创建或更新考勤记录，状态置为 `checked_in`，写入 `actualStartTime = now`。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| lessonSchedule | String (ObjectId) | 是 | 排课 ID |
| student | String (ObjectId) | 是 | 学生 ID |
| studentProduct | String (ObjectId) | 是 | 学生持有的课包 ID |
| remark | String | 否 | 备注 |

- **约束**：
  - 该 `(lessonSchedule, student)` 已存在考勤时，更新 `actualStartTime` 并保持状态。
  - `studentProduct` 必须属于该学生且 `isActive=true`，否则 `400`。
- **成功响应** (`201 Created` 或 `200 OK`)：返回考勤对象。

---

## 3. 消课（扣课时）

- **Method / Path**：`PUT /api/v1/lesson-attendances/:id/complete`
- **权限**：`lessonAttendance.write`
- **说明**：将考勤状态置为 `completed`，**事务性扣减** `StudentProduct.remainingLessons` 一节。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| actualEndTime | Date (ISO8601) | 否 | 实际结束时间；不传则用 `now` |
| remark | String | 否 | 备注 |

- **约束**：
  - 仅 `status ∈ {scheduled, checked_in}` 可消课，否则 `400`。
  - 关联 `StudentProduct.remainingLessons <= 0` 时拒绝（课包已耗尽），返回 `400`，提示需先续费。
- **副作用**：
  - `StudentProduct.remainingLessons -= 1`。
  - 当 `remainingLessons == 0` 时，该 `StudentProduct.isActive = false`。
- **成功响应** (`200 OK`)：返回考勤对象与扣减后的课包快照。

```json
{
  "success": true,
  "data": {
    "attendance": { "id": "...", "status": "completed", "actualEndTime": "..." },
    "studentProduct": { "id": "...", "remainingLessons": 7, "isActive": true }
  }
}
```

---

## 4. 标记未到

- **Method / Path**：`PUT /api/v1/lesson-attendances/:id/no-show`
- **权限**：`lessonAttendance.write`
- **说明**：将考勤状态置为 `no_show`，**不扣减课时**。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| remark | String | 否 | 备注 |

- **约束**：仅 `status ∈ {scheduled, checked_in}` 可标记，否则 `400`。
- **成功响应** (`200 OK`)：返回考勤对象。

---

## 5. 关联作品列表

- **Method / Path**：`GET /api/v1/lesson-attendances/:id/works`
- **权限**：`studentWork.read`
- **说明**：列出该考勤学生在本节课关联的 `StudentWork` 作品。
- **成功响应** (`200 OK`)：`{ data: StudentWork[] }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 课包已耗尽 / 状态不允许 / studentProduct 不属于该学生 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 考勤不存在 |
| 409 | `(lessonSchedule, student)` 唯一冲突（并发签到） |
