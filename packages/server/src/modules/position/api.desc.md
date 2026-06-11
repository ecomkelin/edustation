# Position 模块 API 文档

> 基础路径：`/api/v1/positions`
>
> 职位（角色）管理。每个机构拥有自己的职位库，职位的 `permissions: [String]` 决定其权限集合。
> 系统职位（`isSystem=true`，如 `机构管理员`、`教务`、`老师`、`家长`）不可删除。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `position.read` —— 查看
  - `position.write` —— 创建/更新/删除/改权限
- 权限码目录（所有可用权限码的清单）来自 `shared/permissions.json`，前后端共享。

---

## 1. 权限码目录

- **Method / Path**：`GET /api/v1/positions/permissions-catalog`
- **权限**：`position.write`（仅管理职位时才需要查看完整目录）
- **说明**：返回平台所有可用的权限码（按模块分组），供编辑职位时使用。
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "groups": [
      {
        "key": "user",
        "label": "用户管理",
        "permissions": [
          { "code": "user.read", "label": "查看用户" },
          { "code": "user.write", "label": "编辑用户" }
        ]
      }
    ]
  }
}
```

---

## 2. 当前机构职位列表

- **Method / Path**：`GET /api/v1/positions`
- **权限**：`position.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按名称模糊匹配 |
| isSystem | Boolean | 仅系统职位 / 仅自定义 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data.items | Position[] | 见下表 |
| data.total | Number | 总数 |

`Position` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Position._id |
| name | String | 职位名 |
| permissions | String[] | 权限码列表 |
| isSystem | Boolean | 系统职位标记 |

---

## 3. 职位详情

- **Method / Path**：`GET /api/v1/positions/:id`
- **权限**：`position.read`
- **成功响应** (`200 OK`)：单个 Position 对象。

---

## 4. 创建职位

- **Method / Path**：`POST /api/v1/positions`
- **权限**：`position.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 是 | 职位名，机构内唯一 |
| permissions | String[] | 否 | 权限码列表；空数组表示无任何权限 |

- **成功响应** (`201 Created`)：返回创建的 Position。
- **失败**：`409` —— 名称重复。

---

## 5. 更新职位

- **Method / Path**：`PUT /api/v1/positions/:id`
- **权限**：`position.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 否 | 职位名 |
| permissions | String[] | 否 | 权限码列表 |

- **成功响应** (`200 OK`)：返回更新后的 Position。
- **约束**：系统职位的 `name` 不允许改（`isSystem=true` 时锁定）。

---

## 6. 删除职位

- **Method / Path**：`DELETE /api/v1/positions/:id`
- **权限**：`position.write`
- **约束**：`isSystem=true` 的系统职位**不可删除**，返回 `400`。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 7. 替换权限码

- **Method / Path**：`PUT /api/v1/positions/:id/permissions`
- **权限**：`position.write`
- **说明**：整体替换职位的 `permissions` 数组（不是合并），传入的每个权限码必须存在于 `permissions-catalog`。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| permissions | String[] | 是 | 权限码列表；空数组表示清空 |

- **成功响应** (`200 OK`)：返回更新后的 Position。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 参数校验失败 / 试图删除系统职位 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 职位不存在 |
| 409 | 职位名重复 |

---

## 跨机构同步（仅平台超管）

> 用途：当用户为平台超管 (`User.isPlatformAdmin = true`) 时，可以把另一家机构的若干个职位复制到当前所选的目标机构。
> 行为：源端和目标端都按 `name` 去重 —— 同名不覆盖也不报错，直接放进 `skipped` 列表。
> 复制后，新职位在目标机构里 `isSystem = false`、`isClient = false`（系统 / 家长是 per-org 概念）。

---

## 8. 源机构列表

- **Method / Path**：`GET /api/v1/positions/source-orgs`
- **权限**：仅平台超管（`isPlatformAdmin`）。
- **说明**：列出可作为「同步源」的其他机构，排除当前目标机构（`x-org-id`，若超管未选则不过滤）。
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| keyword | String | 否 | 名称 / 简称 / 信用代码模糊匹配 |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      { "_id": "...", "name": "杭州艺术培训", "nameAbbreviation": "HZYS", "unicode": "9133...", "isActive": true }
    ]
  }
}
```

- **失败**：`401` 未登录；`403` 非平台超管。

---

## 9. 指定机构的职位列表

- **Method / Path**：`GET /api/v1/positions/by-org/:orgId`
- **权限**：仅平台超管。
- **说明**：列出指定机构下的全部职位（系统 / 自定义 / 家长 都返回），供同步前预览。
- **路径参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| orgId | String | 源机构 ObjectId |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      { "_id": "...", "name": "教务", "permissions": ["student.read", "lessonSchedule.write"], "isSystem": true, "isClient": false }
    ]
  }
}
```

- **失败**：`400` orgId 不合法；`401` 未登录；`403` 非平台超管。

---

## 10. 同步职位到当前机构

- **Method / Path**：`POST /api/v1/positions/sync`
- **权限**：仅平台超管；且 `req.orgId`（来自 `x-org-id`）必须存在 —— 即必须先在顶部「机构切换」中选择目标机构。
- **说明**：复制后的职位在当前机构内 `isSystem = false`、`isClient = false`（系统/家长是 per-org 概念）。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| sourceOrgId | String | 是 | 源机构 ObjectId（必须 ≠ 目标机构） |
| positionIds | String[] | 是 | 要复制的源职位 id 列表，1-200 个，全部必须为合法 ObjectId |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "created": [ { "_id": "...", "org": "...", "name": "教务", "permissions": ["..."], "isSystem": false, "isClient": false } ],
    "skipped": [
      { "sourceId": "...", "name": "管理员", "reason": "already-exists-in-target" },
      { "sourceId": "...", "name": null, "reason": "source-position-not-found" }
    ],
    "createdCount": 3,
    "skippedCount": 1
  }
}
```

- **`skipped[].reason` 取值**：

| reason | 含义 |
| ------ | ---- |
| `already-exists-in-target` | 目标机构已有同名职位（**不覆盖**） |
| `duplicate-in-source` | 源内多次出现同名（仅复制第一条） |
| `source-position-not-found` | positionId 在源机构找不到 |

- **失败**：

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 未选目标机构 / sourceOrgId 不合法 / 源等于目标 / positionIds 为空 / 含非法 id / 超过 200 个 |
| 401 | 未登录 |
| 403 | 非平台超管 |
| 404 | 源 / 目标机构不存在 |

