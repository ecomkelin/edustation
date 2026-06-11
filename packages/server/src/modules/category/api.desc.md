# Category 模块 API 文档

> 基础路径：`/api/v1/categories`
>
> 类别字典（平台级）。`Category` 是一棵多层级字典树，通过 `model` 字段区分用途，
> 当前主要被 `Org.type` 引用（`model='Org'`），代表"机构类型"。
>
> ⚠️ **仅平台超管**可访问，路由层强制校验 `req.user.isPlatformAdmin`。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`。
- 公共响应：`{ success, data, message? }`。
- 删除规则：**被 Org.type 引用时拒绝删除**（`400`）。

---

## 1. 类别字典列表

- **Method / Path**：`GET /api/v1/categories`
- **权限**：平台超管
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| model | String | 字典模型名，如 `Org`；不传则返回所有 |
| parent | String (ObjectId) | 父级 ID；`null` 表示顶级 |
| keyword | String | 按 `name` 模糊匹配 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 50 |

- **成功响应** (`200 OK`)：`{ data: { items: Category[], total, page, pageSize } }`。

`Category` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Category._id |
| model | String | 字典模型，如 `Org` |
| name | String | 名称 |
| parent | String\|null | 父级 ID |
| order | Number | 排序号 |
| isActive | Boolean | 启用状态 |
| meta | Object | 扩展属性 |

---

## 2. 类别字典树

- **Method / Path**：`GET /api/v1/categories/tree`
- **权限**：平台超管
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| model | String | 字典模型名，如 `Org` |

- **成功响应** (`200 OK`)：

```json
{
  "data": [
    {
      "id": "...",
      "name": "科技类",
      "children": [
        { "id": "...", "name": "编程", "children": [] }
      ]
    }
  ]
}
```

---

## 3. 类别字典详情

- **Method / Path**：`GET /api/v1/categories/:id`
- **权限**：平台超管
- **成功响应** (`200 OK`)：单个 Category 对象。

---

## 4. 新增类别

- **Method / Path**：`POST /api/v1/categories`
- **权限**：平台超管
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| model | String | 是 | 字典模型，如 `Org` |
| name | String | 是 | 名称 |
| parent | String (ObjectId) | 否 | 父级 ID；空表示顶级 |
| order | Number | 否 | 排序号，默认 0 |
| isActive | Boolean | 否 | 默认 true |
| meta | Object | 否 | 扩展属性 |

- **成功响应** (`201 Created`)：返回创建的 Category。
- **约束**：`parent` 必须存在且 `model` 一致。

---

## 5. 更新类别

- **Method / Path**：`PUT /api/v1/categories/:id`
- **权限**：平台超管
- **请求体**：`name`, `parent`, `order`, `isActive`, `meta`（均可选）。
- **约束**：禁止将 `parent` 设为自身或自身的后代（避免成环），后端返回 `400`。
- **成功响应** (`200 OK`)：返回更新后的 Category。

---

## 6. 删除类别

- **Method / Path**：`DELETE /api/v1/categories/:id`
- **权限**：平台超管
- **约束**：
  - 被 `Org.type` 引用时拒绝，返回 `400`。
  - 存在子类别时拒绝（先删子级），返回 `400`。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 被引用 / 存在子级 / parent 校验失败 |
| 401 | 未登录 |
| 403 | 非平台超管 |
| 404 | 类别不存在 |
