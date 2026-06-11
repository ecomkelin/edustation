# Org 模块 API 文档

> 基础路径：`/api/v1/orgs`
>
> 机构（租户）管理。本模块**仅平台超管**可访问，路由层统一校验 `req.user.isPlatformAdmin`。
> 所有 Org 数据通过 `org` 字段隔离，机构停用为软删（`isActive=false`）。

---

## 通用约定

- 公共请求头：`Authorization: Bearer <access>`。
- 公共响应格式：`{ success, data, message? }`。
- 错误：未登录 `401`；非平台超管 `403`。

---

## 1. 机构列表

- **Method / Path**：`GET /api/v1/orgs`
- **权限**：平台超管
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按 `name` / `nameAbbreviation` 模糊匹配 |
| type | String (ObjectId) | 机构类型（Category.model='Org'） |
| region | String (ObjectId) | 地区（Region._id） |
| isActive | Boolean | 启用状态 |
| page | Number | 页码，默认 1 |
| pageSize | Number | 每页条数，默认 20 |

- **成功响应** (`200 OK`)：`{ data: { items: Org[], total, page, pageSize } }`

---

## 2. 机构详情

- **Method / Path**：`GET /api/v1/orgs/:id`
- **权限**：平台超管
- **路径参数**：`id` —— Org._id。
- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | 机构 ID |
| unicode | String | 机构统一编码，唯一 |
| name | String | 机构全称 |
| nameAbbreviation | String | 机构简称 |
| type | Object\|null | 机构类型（来自 Category） |
| region | Object\|null | 所属地区（来自 Region） |
| principal | Object\|null | 负责人 User |
| contactPerson | String | 联系人 |
| contactPhone | String | 联系电话 |
| address | String | 详细地址 |
| establishedDate | Date\|null | 成立日期（创建后不可改） |
| isActive | Boolean | 是否启用 |
| meta | Object | 扩展属性 |
| createdAt / updatedAt | Date | 时间戳 |

---

## 3. 候选负责人列表

- **Method / Path**：`GET /api/v1/orgs/:id/candidate-principals`
- **权限**：平台超管
- **说明**：返回本机构中可被指派为负责人的用户候选列表。
- **成功响应** (`200 OK`)：`{ data: User[] }`，元素结构 `{ id, mobile, realName }`。

---

## 4. 创建机构

- **Method / Path**：`POST /api/v1/orgs`
- **权限**：平台超管
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| unicode | String | 是 | 机构唯一编码 |
| name | String | 是 | 机构全称 |
| nameAbbreviation | String | 是 | 机构简称 |
| type | String (ObjectId) | 否 | 机构类型（Category） |
| region | String (ObjectId) | 否 | 所属地区（Region） |
| principal | String (ObjectId) | 否 | 负责人 User._id |
| contactPerson | String | 否 | 联系人 |
| contactPhone | String | 否 | 联系电话 |
| address | String | 否 | 详细地址 |
| establishedDate | Date | 是 | 成立日期，**创建后不可改** |
| meta | Object | 否 | 扩展属性 |

- **成功响应** (`201 Created`)：返回创建的 Org 对象。
- **失败**：`409` —— `unicode` / `name` / `nameAbbreviation` 重复。

---

## 5. 更新机构

- **Method / Path**：`PUT /api/v1/orgs/:id`
- **权限**：平台超管
- **请求体**：同创建接口，但 **`establishedDate` 不可修改**（后端忽略该字段）。
- **约束**：
  - `principal` 必须属于本机构（在 `UserOrgRel` 中存在与本机构的关联），否则 `400`。
- **成功响应** (`200 OK`)：返回更新后的 Org 对象。

---

## 6. 停用机构（软删）

- **Method / Path**：`DELETE /api/v1/orgs/:id`
- **权限**：平台超管
- **说明**：将 `isActive` 置为 `false`，不物理删除。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 7. 启用 / 停用切换

- **Method / Path**：`POST /api/v1/orgs/:id/toggle-active`
- **权限**：平台超管
- **说明**：在 `isActive` 与 `!isActive` 之间切换，属于**敏感操作**，需二次确认。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| password | String | 是 | 当前管理员密码（用于二次确认） |

- **成功响应** (`200 OK`)：返回更新后的 Org 对象。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 参数校验失败 / 负责人不属于本机构 |
| 401 | 未登录 |
| 403 | 非平台超管 |
| 404 | 机构不存在 |
| 409 | 唯一字段冲突 |
