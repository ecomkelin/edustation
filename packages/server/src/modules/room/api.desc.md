# Room 模块 API 文档

> 基础路径：`/api/v1/rooms`
>
> 教室管理。`Room` 是机构内的物理/逻辑教室，被 `CourseInstance` 与 `LessonSchedule` 引用。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `room.read`
  - `room.write`

---

## 1. 教室列表

- **Method / Path**：`GET /api/v1/rooms`
- **权限**：`room.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按 `name` 模糊匹配 |
| isActive | Boolean | 启用状态 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 50 |

- **成功响应** (`200 OK`)：`{ data: { items: Room[], total, page, pageSize } }`。

`Room` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Room._id |
| name | String | 教室名/编号 |
| location | String | 位置描述（如"3 楼东侧"） |
| capacity | Number | 容纳人数 |
| isActive | Boolean | 是否启用 |
| meta | Object | 扩展属性 |

---

## 2. 教室详情

- **Method / Path**：`GET /api/v1/rooms/:id`
- **权限**：`room.read`
- **成功响应** (`200 OK`)：单个 Room 对象。

---

## 3. 创建教室

- **Method / Path**：`POST /api/v1/rooms`
- **权限**：`room.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 是 | 教室名，机构内唯一 |
| location | String | 否 | 位置描述 |
| capacity | Number | 否 | 容纳人数，默认 10 |
| isActive | Boolean | 否 | 默认 true |
| meta | Object | 否 | 扩展属性 |

- **成功响应** (`201 Created`)：返回创建的 Room。

---

## 4. 更新教室

- **Method / Path**：`PUT /api/v1/rooms/:id`
- **权限**：`room.write`
- **请求体**：`name`, `location`, `capacity`, `isActive`, `meta`（均可选）。
- **成功响应** (`200 OK`)：返回更新后的 Room。

---

## 5. 删除教室

- **Method / Path**：`DELETE /api/v1/rooms/:id`
- **权限**：`room.write`
- **约束**：被 `CourseInstance` 或 `LessonSchedule` 引用时拒绝删除，返回 `400`。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 被排课/开班引用 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 教室不存在 |
| 409 | 名称重复 |
