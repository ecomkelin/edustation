# StudentWork 模块 API 文档

> 学生作品管理。`StudentWork` 是某节考勤（`LessonAttendance`）下某学生（`Student`）的作品记录。
> 2026-06 完善：直接锚定 lessonAttendance（创建后 immutable），并冗余 lessonSchedule → courseInstance → subject。
> 2026-07-01 大改：admin 列表加 KPI/排序/视图切换/CSV 导出；C 端三页（作品墙 / 详情 / 上传）实装。

## 权限码

- `studentWork.read`
- `studentWork.write`

## 路由编号速查

| R 编号 | Method | Path | 用途 |
|---|---|---|---|
| R-1600 | GET | `/student-works` | 列表 (admin) |
| R-1601 | GET | `/student-works/:id` | 详情 (admin / C 端) |
| R-1602 | POST | `/student-works` | 创建 (员工) |
| R-1603 | PATCH | `/student-works/:id` | 编辑 4 字段 (员工) |
| R-1604 | DELETE | `/student-works/:id` | 物理删除 (超管+密码) |
| R-1605 | GET | `/student-works/:id/removable-check` | 删除预检 |
| **R-1606** | GET | `/student-works/stats` | KPI 聚合 (admin) |
| **R-1640** | GET | `/student-works/export.csv` | CSV 导出 (admin) |
| **R-1670** | GET | `/student-works/me` | 我的作品 (C 端家长) |

## 1. 列出作品 (R-1600)

- **Method / Path**：`GET /api/v1/student-works`
- **Query 参数**（全部可选）：
  - 维度过滤：`lessonAttendance` / `lessonSchedule` / `courseInstance` / `subject` / `student` / `uploadedBy`
  - 日期范围：`createdAtFrom` / `createdAtTo`（ISO 字符串，传其一即生效；都不传 = 不限）
  - 等级范围：`minLevel` / `maxLevel`（闭区间 1~5 整数，可单传）
  - 排序：`sort`（默认 `-createdAt`；可选 `-createdAt / createdAt / -updatedAt / updatedAt / -level / level / title / -title`）
  - 分页：`page` / `pageSize`（默认 1 / 20）
- **权限**：`studentWork.read`
- **成功响应** (`200 OK`)：`{ data: { items: StudentWork[], total, page, pageSize } }`。

`StudentWork` 元素结构同 §2 详情。

## 2. 作品详情 (R-1601)

- **Method / Path**：`GET /api/v1/student-works/:id`
- **权限**：`studentWork.read`
- **成功响应** (`200 OK`)：返回 StudentWork 文档（populate 完整）。

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| id | String | 是 | StudentWork._id |
| org | String | 是 | 机构 |
| lessonAttendance | String \| Object | 是 | 关联考勤（populate 后含 status） |
| lessonSchedule | String \| Object | 是 | 关联排课（plannedStartTime / title / lessonNo） |
| courseInstance | String \| Object | 是 | 关联开班（name / courseProduct） |
| subject | String \| Object \| null | 是 | 关联学科（name）；历史可能为 null |
| student | String \| Object | 是 | 学生（name） |
| title | String | 是 | 作品标题 |
| fileUrls | String[] | 是 | 文件 URL 列表 |
| description | String | 否 | 描述 |
| level | Number \| null | 否 | 1~5；null=未评 |
| uploadedBy | String \| Object | 是 | 上传者（realName / mobile） |
| createdAt / updatedAt | String | 是 | 时间戳 |

## 3. 上传作品 (R-1602)

- **Method / Path**：`POST /api/v1/student-works`
- **Content-Type**：`application/json`
- **字段**：
  - `lessonAttendance` (string, 必填)：考勤 ID
  - `title` (string, 必填)
  - `description` (string, 可选)
  - `level` (integer 1~5, 可选)
  - `fileIds` (string[], 必填, ≥1)：File._id 数组（先调 `POST /api/v1/storage/upload?scope=work` 单个 / `upload-many?scope=work` 多个 拿到 ids）
- **权限**：`studentWork.write`
- **行为**：
  - 4 个 snapshot 字段（`lessonSchedule` / `courseInstance` / `subject` / `student`）从 `lessonAttendance` 推导写入；
  - `(lessonAttendance, title)` 唯一索引，重复返回 409；
  - `fileUrls` 维护 schema 兼容，File 文档 refs 由 fileBind 自动维护。

## 4. 编辑作品 (R-1603)

- **Method / Path**：`PATCH /api/v1/student-works/:id`
- **Content-Type**：`application/json`
- **字段**（全部可选，至少传一个）：`title` / `description` / `fileUrls` / `level`
- **权限**：`studentWork.write`
- **不可改**：4 个 snapshot 字段 + `org` / `student` / `uploadedBy`（service 白名单 strip）

## 5. 物理删除 (R-1604)

- **Method / Path**：`DELETE /api/v1/student-works/:id`
- **Body**：`{ password: string }`（超管密码）
- **权限**：`requirePlatformPassword`

## 6. 删除预检 (R-1605)

- 永远 `canRemove=true`（孤儿数据）；保留 UX 一致性。

## 7. KPI 聚合 (R-1606, 2026-07-01 新增)

- **Method / Path**：`GET /api/v1/student-works/stats`
- **Query 参数**：`student` / `courseInstance` / `subject` / `uploadedBy` / `createdAtFrom` / `createdAtTo`（与 R-1600 共用过滤维度）
- **权限**：`studentWork.read`
- **默认时间范围**：当不传 `createdAtFrom` / `createdAtTo` 时，本期=**本月 1 号 00:00 ~ 当前**，上一期=上月同时长。
- **成功响应** (`200 OK`): `{ data: { total, ratedCount, unratedCount, avgLevel, prevTotal, prevRatedCount, periodFrom, periodTo } }`
  - `total`：本期作品数（含未评）
  - `ratedCount`：本期已评 (level != null) 数
  - `unratedCount`：`max(0, total - ratedCount)`
  - `avgLevel`：`ratedCount > 0` 时四舍五入到 2 位小数，否则 `null`
  - `prevTotal` / `prevRatedCount`：上一期对照值
  - `periodFrom` / `periodTo`：ISO 字符串

## 8. CSV 导出 (R-1640, 2026-07-01 新增)

- **Method / Path**：`GET /api/v1/student-works/export.csv`
- **Query 参数**：同 R-1600 全集（不含分页）
- **权限**：`studentWork.read`
- **响应**：`Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="student-works-{ts}.csv"`
- **格式**：UTF-8 BOM + 分号 `;` 分隔 + 换行 `\n` 分行（Excel 友好）
- **字段顺序**：`创建时间 | 标题 | 等级 | 学生 | 学科 | 开班 | 排课时间 | 上传者 | 描述`
- **上限**：最多导 10000 行（保护后端；超大请用筛选项细分）

## 9. 我的作品 (R-1670, 2026-07-01 新增 — C 端)

- **Method / Path**：`GET /api/v1/student-works/me`
- **Header**：`x-active-student-id`（家长选中的孩子，C 端 `request.js` 自动注入）
- **Query 参数**：同 R-1600 全集
- **权限**：**不走 `requirePermission`**（家长无员工权限码）。在路由层只挂 `authenticate` + `requireOrg` + `activeStudent`，后者校验 `req.user` 是该学生的监护人之一，平台超管豁免。
- **行为**：复用 `service.list`，强制 `student = req.activeStudentId`，避免越权读到别的孩子的作品。
- **成功响应** (`200 OK`)：与 R-1600 同结构。

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 必填字段缺失（lessonAttendance / title / fileIds）；level 越界（1~5）；sort 非法；日期格式错；rank 范围越界 |
| 401 | 未登录（无 / 过期 access token，且 refresh 失败） |
| 403 | 权限不足；C 端 `x-active-student-id` 不是本用户监护人 |
| 404 | 考勤 / 排课 / 开班 / 作品不存在 |
| 409 | 同一考勤下已存在同名作品 |
| 422 | 排课挂的开班已不存在 |
