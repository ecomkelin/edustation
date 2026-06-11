# LessonWork 模块 API 文档

> 基础路径：`/api/v1/lesson-works`
>
> 课堂作品管理。`LessonWork` 是某节排课（`LessonSchedule`）下某学生（`Student`）的作品记录，
> 包含标题、描述与 `fileUrls`（图片/视频/音频等）。用于家长端"作品墙"展示。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 上传使用 `multipart/form-data`，文件字段名 `files`，单次最多 20 个文件。
- 权限码：
  - `lessonWork.read`
  - `lessonWork.write`
- 实际文件存储由 `lessonWork.service` 内的 `s.upload`（multer）中间件处理，常见落盘到 OSS / 本地，看 `config`。
- **响应中的 `fileUrls`** 为绝对可访问 URL。

---

## 1. 作品列表

- **Method / Path**：`GET /api/v1/lesson-works`
- **权限**：`lessonWork.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| lessonSchedule | String (ObjectId) | 按排课过滤 |
| student | String (ObjectId) | 按学生过滤 |
| start | Date | 配合排课的开始时间下界 |
| end | Date | 配合排课的结束时间上界 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 30 |

- **成功响应** (`200 OK`)：`{ data: { items: LessonWork[], total, page, pageSize } }`。

`LessonWork` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | LessonWork._id |
| org | String | 机构 ID |
| lessonSchedule | Object | 关联排课（populate） |
| student | Object | 学生（populate） |
| title | String | 作品标题 |
| description | String | 作品描述 |
| fileUrls | String[] | 文件 URL 数组 |
| createdBy | Object | 上传人（populate） |
| createdAt | Date | 创建时间 |

---

## 2. 上传作品

- **Method / Path**：`POST /api/v1/lesson-works`
- **Content-Type**：`multipart/form-data`
- **权限**：`lessonWork.write`
- **表单字段**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| files | File[] | 是 | 文件数组，字段名固定为 `files`，最多 20 个 |
| lessonSchedule | String (ObjectId) | 是 | 排课 ID |
| student | String (ObjectId) | 是 | 学生 ID |
| title | String | 是 | 作品标题，长度 1-100 |
| description | String | 否 | 作品描述，长度 <= 1000 |

- **成功响应** (`201 Created`)：返回创建的 LessonWork 列表（一条记录包含所有上传文件对应的 `fileUrls`）。
- **约束**：
  - 单文件大小限制见 `config.upload`（默认 50MB）。
  - 支持的 mime 类型：`image/*`, `video/*`, `audio/*`。
- **失败**：`413` —— 单文件超过大小限制；`415` —— 不支持的 mime。

---

## 3. 删除作品

- **Method / Path**：`DELETE /api/v1/lesson-works/:id`
- **权限**：`lessonWork.write`
- **说明**：物理删除作品记录，并**尝试删除对应文件**（OSS 端删除失败仅记录日志，不影响接口成功）。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 缺少必填字段 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 作品不存在 |
| 413 | 单文件超过大小限制 |
| 415 | 不支持的文件类型 |
