# CourseEnrollment 模块 API 文档

> 基础路径：`/api/v1/course-enrollments`
>
> 课程报名管理。`CourseEnrollment` 是 `Student` ↔ `CourseInstance` 的关系记录。
> 创建时**宽松校验**（仅校验开班状态）：
>  1. `CourseInstance.status ∈ {enrolling, active}`
>
> 业务上**不**做以下前置校验：
>  - **不校验 `StudentProduct`**：学生可以先报名，之后再购课。能否消课、能否生成 LessonAttendance 由排课环节按"学生当前是否持有有效 StudentProduct"判断。
>  - **不校验 `maxStudents` 名额**：超额报名是允许的；业务上的"分班"动作是把部分学生的 `courseInstance` 调整到另一个开班，不是拒绝报名。`maxStudents` 仅作为 UI 上的参考。
>
> 状态机：`enrolled` → `archived` / `dropped` / `withdrew`，`dropped/withdrew` 可恢复为 `enrolled`。`archived` 由开班 `active → closed` 时后端级联自动写入；管理员仍可经 `setStatus` 接口手工覆盖单个记录为 `archived`。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `courseEnrollment.read`
  - `courseEnrollment.write`
- 状态枚举（`COURSE_ENROLLMENT_STATUSES`）：`enrolled` / `archived` / `dropped` / `withdrew`。

---

## 1. 报名列表

- **Method / Path**：`GET /api/v1/course-enrollments`
- **权限**：`courseEnrollment.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| courseInstance | String (ObjectId) | 按开班过滤 |
| student | String (ObjectId) | 按学生过滤 |
| status | String | 状态过滤（可逗号分隔多值） |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：`{ data: { items: CourseEnrollment[], total, page, pageSize } }`。

`CourseEnrollment` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | CourseEnrollment._id |
| student | Object | 学生（populate） |
| courseInstance | Object | 开班（populate，含 courseProduct / teacher / room） |
| status | String | 状态枚举 |
| enrolledAt | Date | 报名时间 |
| archivedAt | Date\|null | 归档时间（status -> archived 时由 service 写入；亦可由开班关闭时级联写入） |
| droppedAt | Date\|null | 退班时间 |
| dropReason | String | 退班原因 |
| meta | Object | 扩展属性 |
| progress | Object | 课程进度（list/detail 附加字段） |
| studentProduct | Object\|null | 为该开班选中的课包（list/detail 附加字段） |

`progress` 字段结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| totalLessons | Number | 开班计划的总课时（优先 `schedulePlan.totalPlannedLessons`，回落 `courseProduct.totalLessons`） |
| scheduledLessons | Number | 该开班下已生成的排课数（LessonSchedule） |
| attendedLessons | Number | 该学生在本开班下的"已消课"数（`LessonAttendance.status='completed'`） |

> ⚠️ `attendedLessons` 当前按"生成过考勤且 status=completed"粗略计数。**LessonAttendance 模块功能尚未完善**，待该模块接入完整消课流程后，这里会自动细化（排除 cancelled 排课、限定为真实扣减过的考勤、与报名状态联动）。

`studentProduct` 字段结构（FIFO 选包，与 LessonSchedule 排课时同口径）：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| _id | String | StudentProduct._id |
| remainingLessons | Number | 剩余课时 |
| totalLessons | Number | 总课时 |
| expireDate | Date | 过期日期 |
| source | String | `'order'`（订单购买）/ `'gift'`（员工赠课） |
| giftReason | String\|null | 赠课原因（仅 source='gift' 有值） |

> 当学生在该开班 `acceptedCourseProducts` 范围内**没有**未过期未用完的 StudentProduct 时，`studentProduct` 为 `null`（提示该学生当前没课包，后续排课时不会生成考勤）。

---

## 2. 报名详情

- **Method / Path**：`GET /api/v1/course-enrollments/:id`
- **权限**：`courseEnrollment.read`
- **成功响应** (`200 OK`)：单个 CourseEnrollment 对象。

---

## 3. 报名（创建）

- **Method / Path**：`POST /api/v1/course-enrollments`
- **权限**：`courseEnrollment.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| courseInstance | String (ObjectId) | 是 | 开班 ID |
| student | String (ObjectId) | 是 | 学生 ID |

- **校验失败响应**：
  - 开班状态不符 → `422` `开班当前状态 xxx，不允许报名`
  - 重复报名 → `409` `该学生已在该开班报名`
- **成功响应** (`201 Created`)：返回创建的 CourseEnrollment。

> 注：本接口不再校验 `maxStudents` 与 `StudentProduct`。超额报名请通过"分班"动作（修改相关 CourseEnrollment 的 `courseInstance`）解决；学生没有有效课包时，本节课不会生成 LessonAttendance（见 lessonSchedule 模块文档）。

---

## 4. 变更状态

- **Method / Path**：`PUT /api/v1/course-enrollments/:id/status`
- **权限**：`courseEnrollment.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| toStatus | String | 是 | 目标状态（`archived` / `dropped` / `withdrew` / `enrolled`） |
| reason | String | 否 | 退班原因（<= 500 字符） |

- **约束**：状态机非法迁移返回 `400`。
- **成功响应** (`200 OK`)：返回更新后的 CourseEnrollment。

---

## 5. 删除报名

- **Method / Path**：`DELETE /api/v1/course-enrollments/:id`
- **权限**：`courseEnrollment.write`
- **约束**：仅 `status='enrolled'` 可删除；其他状态返回 `400`，提示走状态变更接口。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 状态机非法迁移 / 校验参数失败 / 仅 enrolled 可删 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 报名记录不存在 |
| 409 | 同一学生在同一开班重复报名 |
| 422 | 开班状态不允许报名 |
