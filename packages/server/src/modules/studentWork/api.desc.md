# StudentWork 模块 API 文档

> 学生作品管理。`StudentWork` 是某节考勤（`LessonAttendance`）下某学生（`Student`）的作品记录。
> 2026-06 完善：直接锚定 lessonAttendance（创建后 immutable），并冗余 lessonSchedule → courseInstance → subject。

## 权限码

- `studentWork.read`
- `studentWork.write`

## 1. 列出作品

- **Method / Path**：`GET /api/v1/student-works`
- **Query 参数**（全部可选）：
  - `lessonAttendance`：按考勤过滤（最常用，对应考勤详情页的"本节作品"）
  - `lessonSchedule`：按排课过滤（按排课维度）
  - `courseInstance`：按开班过滤（"这个班的作品墙"）
  - `subject`：按学科过滤（学科分析）
  - `student`：按学生过滤（家长端"我的作品"）
  - `page`, `pageSize`：分页（默认 1 / 20）
- **权限**：`studentWork.read`
- **成功响应** (`200 OK`)：`{ data: { items: StudentWork[], total, page, pageSize } }`。
- `StudentWork` 元素结构：

  | 字段 | 类型 | 必填 | 说明 |
  | ---- | ---- | ---- | ---- |
  | id | String | 是 | StudentWork._id |
  | org | String | 是 | 机构 |
  | lessonAttendance | String \| Object | 是 | 关联考勤（populate 后含 status） |
  | lessonSchedule | String \| Object | 是 | 关联排课（populate 后含 plannedStartTime / title / lessonNo） |
  | courseInstance | String \| Object | 是 | 关联开班（populate 后含 name / courseProduct） |
  | subject | String \| Object \| null | 是 | 关联学科（populate 后含 name）；历史数据可能为 null |
  | student | String \| Object | 是 | 学生（populate 后含 name） |
  | title | String | 是 | 作品标题 |
  | fileUrls | String[] | 是 | 文件 URL 列表 |
  | description | String | 否 | 描述 |
  | level | Number \| null | 否 | 作品等级（1~5，员工评定）；null 表示未评 |
  | uploadedBy | String \| Object | 是 | 上传者（populate 后含 realName / mobile） |
  | createdAt / updatedAt | String | 是 | 时间戳 |

## 2. 作品详情

- **Method / Path**：`GET /api/v1/student-works/:id`
- **权限**：`studentWork.read`
- **成功响应** (`200 OK`)：返回 StudentWork 文档（populate 完整）。

## 3. 上传作品

- **Method / Path**：`POST /api/v1/student-works`
- **Content-Type**：`multipart/form-data`
- **字段**：
  - `lessonAttendance` (form 字段, 必填)：考勤 ID
  - `title` (form 字段, 必填)：作品标题
  - `description` (form 字段, 可选)
  - `level` (form 字段, 可选, 1~5 的整数)：作品等级；不传 = null（未评）
  - `files` (file 数组, 必填, ≥1)
- **权限**：`studentWork.write`
- **业务规则**：
  - 服务端从 `lessonAttendance` 推导 `lessonSchedule` / `student` / `courseInstance` / `subject` 四个 snapshot 字段；
  - 这 4 个字段在 Schema 层 immutable，**创建后无法修改**（含 `$set` / `findOneAndUpdate` / `updateOne`）；
  - 同一考勤下 `title` 不能重复（唯一索引），重复提交返回 409。
- **成功响应** (`201 Created`)：返回创建后的 StudentWork 文档（populate 完整）。

## 4. 编辑作品（员工操作）

- **Method / Path**：`PATCH /api/v1/student-works/:id`
- **Content-Type**：`application/json`
- **字段**（全部可选，至少传一个）：
  - `title`：作品标题（不能为空字符串）
  - `description`：作品描述
  - `fileUrls`：覆盖为新的 URL 数组
  - `level`：`1~5` 整数，或 `null` 显式清空
- **权限**：`studentWork.write`（老师 / 教务 / 管理员均可）
- **业务规则**：
  - 4 个 snapshot 字段（`lessonAttendance` / `lessonSchedule` / `courseInstance` / `subject`）以及 `org` / `student` / `uploadedBy` 一律不允许修改，service 层强制 strip；
  - 改 `title` 时仍受 `(lessonAttendance, title)` 唯一索引约束，重复返回 409；
  - 改 `level` 时必须是 1~5 的整数或 `null`。
- **成功响应** (`200 OK`)：返回更新后的 StudentWork 文档（populate 完整）。

## 5. 物理删除

- **Method / Path**：`DELETE /api/v1/student-works/:id`
- **Body**：`{ password: string }`（超管密码）
- **权限**：`requirePlatformPassword`（超管+密码二次确认）
- **成功响应** (`200 OK`)：`{ data: { success: true } }`。

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 必填字段缺失（lessonAttendance / title / files）；level 越界（1~5）；无可更新字段 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 考勤/排课/开班/作品不存在 |
| 409 | 同一考勤下已存在同名作品 |
| 422 | 排课挂的开班已不存在 |
