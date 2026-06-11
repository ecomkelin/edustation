# Region 模块 API 文档

> 基础路径：`/api/v1/regions`
>
> 地区字典（平台级）。`Region` 是一棵多层级地区树（省/市/区/县），通过 `parent` 字段嵌套。
> 当前被 `Org.region`、`User.region` 引用。
>
> ⚠️ **仅平台超管**可访问。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`。
- 删除规则：**被 Org.region 引用或存在子级时拒绝**（`400`）。

---

## 1. 地区字典列表

- **Method / Path**：`GET /api/v1/regions`
- **权限**：平台超管
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| parent | String (ObjectId) | 父级 ID；`null` 表示顶级（省/直辖市） |
| level | Number | 层级（1=省 2=市 3=区/县） |
| keyword | String | 按 `name` 模糊匹配 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 50 |

- **成功响应** (`200 OK`)：`{ data: { items: Region[], total, page, pageSize } }`。

`Region` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Region._id |
| name | String | 名称 |
| code | String | 行政区划代码 |
| level | Number | 层级 |
| parent | String\|null | 父级 ID |
| isActive | Boolean | 启用状态 |

---

## 2. 地区字典树

- **Method / Path**：`GET /api/v1/regions/tree`
- **权限**：平台超管
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| rootId | String (ObjectId) | 起始节点 ID；不传则从顶级开始 |
| maxLevel | Number | 展开深度，默认全部 |

- **成功响应** (`200 OK`)：

```json
{
  "data": [
    {
      "id": "...",
      "name": "广东省",
      "children": [
        { "id": "...", "name": "深圳市", "children": [] }
      ]
    }
  ]
}
```

---

## 3. 地区字典详情

- **Method / Path**：`GET /api/v1/regions/:id`
- **权限**：平台超管
- **成功响应** (`200 OK`)：单个 Region 对象。

---

## 4. 新增地区

- **Method / Path**：`POST /api/v1/regions`
- **权限**：平台超管
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 是 | 名称 |
| code | String | 是 | 行政区划代码，全局唯一 |
| level | Number | 是 | 层级（1/2/3） |
| parent | String (ObjectId) | 否 | 父级 ID；`level=1` 时必须为空 |
| isActive | Boolean | 否 | 默认 true |

- **成功响应** (`201 Created`)：返回创建的 Region。
- **约束**：`parent.level` 必须等于 `level - 1`；`code` 唯一。
- **失败**：`409` —— `code` 重复。

---

## 5. 更新地区

- **Method / Path**：`PUT /api/v1/regions/:id`
- **权限**：平台超管
- **请求体**：`name`, `code`, `parent`, `isActive`（均可选）。
- **约束**：
  - 禁止将 `parent` 设为自身或自身的后代。
  - 变更 `parent` 时需重新校验层级。
- **成功响应** (`200 OK`)：返回更新后的 Region。

---

## 6. 删除地区

- **Method / Path**：`DELETE /api/v1/regions/:id`
- **权限**：平台超管
- **约束**：
  - 被 `Org.region` / `User.region` 引用时拒绝，返回 `400`。
  - 存在子地区时拒绝（先删子级），返回 `400`。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 被引用 / 存在子级 / parent 校验失败 |
| 401 | 未登录 |
| 403 | 非平台超管 |
| 404 | 地区不存在 |
| 409 | 行政区划代码重复 |
