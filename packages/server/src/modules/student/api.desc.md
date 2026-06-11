# Student 模块 API 文档

> 基础路径：`/api/v1/students`
>
> 学生管理。学生是机构内的业务实体（不登录系统），由家长（User）代为操作。
> `Student` 与 `User` 的关联字段：
> - `guardianUser` —— 主监护人（首登家长）
> - `guardians` —— 全部监护人（多对多）

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `student.read` —— 查看学生列表/详情
  - `student.write` —— 创建/更新/删除/关联家长
- 学生列表自动按当前 org 过滤；`me` 接口专为家长设计。

---

## 1. 家长查自己的子女

- **Method / Path**：`GET /api/v1/students/me`
- **权限**：authenticated（家长）——**不要求** `student.read` 权限
- **说明**：当前登录用户在当前 org 关联的所有学生（主监护人或在 `guardians` 中）。客户端顶部"当前孩子"下拉即来自此接口。
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| isActive | Boolean | 默认 `true` |

- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data | Student[] | 元素结构见下 |

`Student` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Student._id |
| org | String | 机构 ID |
| name | String | 学生姓名 |
| gender | String | 性别枚举 |
| birthday | Date\|null | 生日 |
| guardianUser | String\|null | 主监护人 User._id |
| guardians | String[] | 全部监护人 User._id 列表 |
| notes | String | 备注 |
| isActive | Boolean | 是否在读 |
| meta | Object | 扩展属性 |

---

## 2. 当前机构学生列表

- **Method / Path**：`GET /api/v1/students`
- **权限**：`student.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按 `name` 模糊匹配 |
| gender | String | 性别 |
| isActive | Boolean | 在读状态 |
| guardian | String (ObjectId) | 按监护人过滤 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：`{ data: { items: Student[], total, page, pageSize } }`。

---

## 3. 学生详情

- **Method / Path**：`GET /api/v1/students/:id`
- **权限**：`student.read`
- **成功响应** (`200 OK`)：单个 Student 对象（populate 监护人信息）。

---

## 4. 创建学生

- **Method / Path**：`POST /api/v1/students`
- **权限**：`student.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 是 | 学生姓名 |
| gender | String | 否 | 性别枚举 |
| birthday | Date | 否 | 生日 |
| notes | String | 否 | 备注 |
| guardianMobile | String | 否 | 监护人手机号；**若该手机号已注册为 User**，自动关联到 `guardians` 与 `guardianUser`；若未注册，则提示需在 `setGuardians` 中按 ID 关联 |
| meta | Object | 否 | 扩展属性 |

- **成功响应** (`201 Created`)：返回创建的 Student。
- **副作用**：若传 `guardianMobile` 且该手机号已是 `User`，会同步创建/更新 `UserOrgRel`。

---

## 5. 更新学生

- **Method / Path**：`PUT /api/v1/students/:id`
- **权限**：`student.write`
- **请求体**（均可选）：`name`, `gender`, `birthday`, `notes`, `isActive`, `meta`。
- **成功响应** (`200 OK`)：返回更新后的 Student。

---

## 6. 软删学生

- **Method / Path**：`DELETE /api/v1/students/:id`
- **权限**：`student.write`
- **说明**：`isActive=false`，保留历史订单/考勤关联数据。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 7. 关联/替换监护人

- **Method / Path**：`PUT /api/v1/students/:id/guardians`
- **权限**：`student.write`
- **说明**：整体替换 `guardians` 数组（不是合并）；`guardianUser` 仍指向首位或显式指定。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| guardianIds | String[] | 是 | 监护人 User._id 列表；空数组清空 |
| guardianUser | String (ObjectId) | 否 | 主监护人；不传则默认取 `guardianIds[0]` |

- **约束**：传入的 User 必须存在于本机构（`UserOrgRel` 中存在与本机构的关联），否则 `400`。
- **成功响应** (`200 OK`)：返回更新后的 Student。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 监护人不属于本机构 / 参数校验失败 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 学生不存在 |
