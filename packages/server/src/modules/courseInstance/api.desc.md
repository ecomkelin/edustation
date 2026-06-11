# CourseInstance 模块 API 文档

> 基础路径：`/api/v1/course-instances`
>
> 开班实例管理。`CourseInstance` 是 `CourseProduct` 的"开班"，包含老师、教室、**排课计划**（`schedulePlan`）、**接受消课的课程产品**（`acceptedCourseProducts`）、开课日期、人数上限、状态等。
> 在此基础上进行排课（`LessonSchedule`）与考勤（`LessonAttendance`）。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `courseInstance.read`
  - `courseInstance.write`
- `status` 枚举：`planning`（规划中） / `enrolling`（招生中） / `active`（进行中） / `closed`（已结班） / `cancelled`（已取消，仅超管可设置的死胡同状态）。

---

## 1. 开班实例列表

- **Method / Path**：`GET /api/v1/course-instances`
- **权限**：`courseInstance.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| courseProduct | String (ObjectId) | 按课程产品过滤 |
| teacher | String (ObjectId) | 按老师过滤 |
| status | String | 开班状态 |
| keyword | String | 按产品名模糊匹配 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：`{ data: { items: CourseInstance[], total, page, pageSize } }`。

`CourseInstance` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | CourseInstance._id |
| courseProduct | Object | 关联的课程产品（populate；含三档价格） |
| teacher | Object | 老师 User（populate） |
| room | Object | 教室 Room（populate） |
| schedulePlan | SchedulePlan | 排课计划子文档 |
| acceptedCourseProducts | Object[] | 接受消课的课程产品列表（populate） |
| startDate | Date | 开课日期 |
| maxStudents | Number | 招生上限（仅作 UI 参考，超额走"分班"） |
| status | String | 状态枚举 |
| statusLog | StatusLog[] | 状态流转历史（**仅 `detail` 接口返回**，list 不带） |

`StatusLog` 子文档：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| from | String\|null | 旧状态（null 表示"创建时指定"） |
| to | String | 新状态 |
| by | Object | 操作人 User（populate；仅 detail 接口有） |
| at | Date | 变更时间 |
| reason | String | 变更原因（必填；如"开课日期确定"/"改回招生中"） |

> 列表响应**不**返回 `statusLog`，避免每行带全量审计日志导致响应过大。前端通过点击状态 tag 调 `detail` 拿到历史，按需展示。

`SchedulePlan` 子文档：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| lessonsPerWeek | Number | 每周上课次数，1-7 |
| restDays | Number[] | 每周固定休息日（0=周日 ... 6=周六） |
| totalPlannedLessons | Number | 本次开班计划总课时 |
| minutesPerLesson | Number\|null | 本次开班每节时长（null 时回落 `CourseProduct.minutesPerLesson`） |

---

## 2. 开班实例详情

- **Method / Path**：`GET /api/v1/course-instances/:id`
- **权限**：`courseInstance.read`
- **成功响应** (`200 OK`)：单个 CourseInstance 对象。

---

## 3. 创建开班实例

- **Method / Path**：`POST /api/v1/course-instances`
- **权限**：`courseInstance.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| courseProduct | String (ObjectId) | 是 | 课程产品 |
| teacher | String (ObjectId) | 是 | 老师 User._id |
| room | String (ObjectId) | 否 | 教室 Room._id |
| schedulePlan | SchedulePlan | 是 | 排课计划子文档 |
| acceptedCourseProducts | String[] (ObjectId) | 否 | 接受消课的课程产品；不传时默认 `[courseProduct]` |
| startDate | Date | 是 | 开课日期 |
| maxStudents | Number | 否 | 招生上限，默认 10 |
| status | String | 否 | 默认 `planning` |

`schedulePlan`：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| lessonsPerWeek | Number | 是 | 1-7 |
| restDays | Number[] | 否 | 0-6 整数；空数组表示"无固定休息日" |
| totalPlannedLessons | Number | 是 | >= `lessonsPerWeek` |
| minutesPerLesson | Number | 否 | 不传时回落 `CourseProduct.minutesPerLesson` |

- **约束**：
  - `acceptedCourseProducts` 若传值，必须**包含 courseProduct 自身**，且所有 id 属于本机构
  - `totalPlannedLessons >= lessonsPerWeek`
- **成功响应** (`201 Created`)：返回创建的 CourseInstance。

---

## 4. 更新开班实例

- **Method / Path**：`PUT /api/v1/course-instances/:id`
- **权限**：`courseInstance.write`
- **请求体**（均可选）：`courseProduct`, `teacher`, `room`, `schedulePlan`, `acceptedCourseProducts`, `startDate`, `maxStudents`, `status`。
- **约束**：
  - 已结班/已关闭的实例不可修改（返回 `400`）。
  - `maxStudents` 仅作为 UI 上的招生参考，**不**做"超出已报人数"的硬性校验；超额后的处理是"分班"（把部分学生的 `courseInstance` 调整到另一个开班）。
- **成功响应** (`200 OK`)：返回更新后的 CourseInstance。

---

## 5. 删除开班实例

- **Method / Path**：`DELETE /api/v1/course-instances/:id`
- **权限**：`courseInstance.write`
- **约束**：当存在 `LessonSchedule` 时拒绝删除（先清空排课），返回 `400`。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 6. 修改开班状态（状态机）

- **Method / Path**：`PUT /api/v1/course-instances/:id/status`
- **权限**：`courseInstance.write`（`cancelled` 仅平台超管）
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| toStatus | String | 是 | 目标状态（见枚举） |
| reason | String | 是 | 变更原因，写入 `statusLog` |

- **状态机**：

```
planning ── enrolling ── active ── closed
              │    ▲        │
              ▼    └────────┘  (可逆)
            planning         closed（不可逆）
```

- **变更约束**：
  - `* → cancelled`：仅平台超管可设置；进入死胡同后不可再变更。
  - `closed → *`：不可变更（不可逆终态）。
  - `enrolling → planning` / `active → enrolling`：**可逆**，但要求当前不存在有效 `CourseEnrollment`（`enrolled`）且不存在 `LessonSchedule`；违反时返回 `400`。
  - **`enrolling → active` 硬规则**：要求**已排满** —— `scheduledCount >= schedulePlan.totalPlannedLessons`；未排满返回 `400` + 提示文案（"尚未排满：已排 X / Y 节，请先排满所有排课"）。`schedulePlan.totalPlannedLessons <= 0` 时同样拒绝。
  - `schedulePlan.totalPlannedLessons` 为 0 或缺失时，不能进入"进行中"。
- **成功响应** (`200 OK`)：返回 `CourseInstance` 详情（含最新的 `statusLog`）。
- **失败**：
  - `400`：状态不允许 / `reason` 为空 / 未排满 / 存在排课或报名却要回退。
  - `403`：非超管尝试切到 `cancelled`。
  - `404`：开班不存在。

### 已排满检查的边界

- `scheduledCount` 通过 `LessonSchedule.countDocuments({ courseInstance: id, org })` 计算，**包含所有状态的排课**（含已取消）。如需更精确，可改为"排除 cancelled"—— 当前实现统一计数，简单可靠。
- `totalPlannedLessons` 取自 `schedulePlan`；如果开班的 `schedulePlan.totalPlannedLessons` 在中途被下调（仅筹备状态外允许下调），未排满检查会自动反映新值。

---

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 存在排课 / 状态不允许 / schedulePlan 不合法 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 实例不存在 |
