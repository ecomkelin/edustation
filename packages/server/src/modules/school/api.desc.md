# School 模块 API 文档

> 基础路径：`/api/v1/schools`
>
> 学校档案管理。`School` 是机构维护的"周边学校"基础档案，被 `Student.school` 引用。
> 主要服务于市场地推（出口数/放学时间）与学生归类（按学校聚合）。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `school.read`
  - `school.write`

---

## 1. 学校列表

- **Method / Path**：`GET /api/v1/schools`
- **权限**：`school.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按 `name` 模糊匹配 |
| type | String | 学段（`kindergarten` / `elementary` / `middle` / `high`） |
| isActive | Boolean | 启用状态 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 50 |

- **成功响应** (`200 OK`)：`{ data: { items: School[], total, page, pageSize } }`。

`School` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | School._id |
| name | String | 学校名（机构内唯一） |
| type | String | 学段（默认 `elementary`） |
| address | String | 学校地址 |
| exitCount | Number | 出口数量（用于发传单站位） |
| weekdayDismissal | String | 周一~周四放学时间 HH:MM（默认 `17:30`） |
| fridayDismissal | String | 周五放学时间 HH:MM（默认 `16:00`） |
| notes | String | 备注 |
| isActive | Boolean | 是否启用 |
| meta | Object | 扩展属性 |

---

## 2. 学校详情

- **Method / Path**：`GET /api/v1/schools/:id`
- **权限**：`school.read`
- **成功响应** (`200 OK`)：单个 School 对象。

---

## 3. 创建学校

- **Method / Path**：`POST /api/v1/schools`
- **权限**：`school.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 是 | 学校名，机构内唯一 |
| type | String | 否 | 学段，默认 `elementary` |
| address | String | 否 | 学校地址 |
| exitCount | Number | 否 | 出口数量，默认 0 |
| weekdayDismissal | String | 否 | HH:MM 格式，默认 `17:30` |
| fridayDismissal | String | 否 | HH:MM 格式，默认 `16:00` |
| notes | String | 否 | 备注 |
| isActive | Boolean | 否 | 默认 true |
| meta | Object | 否 | 扩展属性 |

- **成功响应** (`201 Created`)：返回创建的 School。

---

## 4. 更新学校

- **Method / Path**：`PUT /api/v1/schools/:id`
- **权限**：`school.write`
- **请求体**：`name`, `type`, `address`, `exitCount`, `weekdayDismissal`, `fridayDismissal`, `notes`, `isActive`, `meta`（均可选）。
- **成功响应** (`200 OK`)：返回更新后的 School。

---

## 5. 删除学校

- **Method / Path**：`DELETE /api/v1/schools/:id`
- **权限**：超管 + 平台密码二次确认（`requirePlatformPassword`）
- **约束**：被 `Student.school`（org + isActive=true 的在册学生）引用时拒绝删除，返回 `422`，`data.blockers` 携带详情。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 6. 删除预检

- **Method / Path**：`GET /api/v1/schools/:id/removable-check`
- **权限**：`school.read`
- **响应**：`{ canRemove: boolean, blockers: [{entity,label,count,hint}] }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 学校不存在 |
| 409 | 名称重复 |
| 422 | 在册学生引用（被挡删除） |
