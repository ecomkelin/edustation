# Subject 模块 API 文档

> 基础路径：`/api/v1/subjects`
>
> 学科管理。机构内可创建自己的学科（如"钢琴"、"绘画"、"编程"等），课程体系的上层分类。
> Subject 1:N CourseProduct（课程产品）。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `subject.read`
  - `subject.write`

---

## 1. 学科列表

- **Method / Path**：`GET /api/v1/subjects`
- **权限**：`subject.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按 `name` 模糊匹配 |
| category | String | 业务分类（如"艺术"/"科技"） |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data.items | Subject[] | 元素结构见下 |
| data.total | Number | 总数 |

`Subject` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Subject._id |
| name | String | 学科名 |
| category | String | 业务分类标签 |
| createdAt / updatedAt | Date | 时间戳 |

---

## 2. 学科详情

- **Method / Path**：`GET /api/v1/subjects/:id`
- **权限**：`subject.read`
- **成功响应** (`200 OK`)：单个 Subject 对象。

---

## 3. 创建学科

- **Method / Path**：`POST /api/v1/subjects`
- **权限**：`subject.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 是 | 学科名，机构内唯一 |
| category | String | 否 | 业务分类 |

- **成功响应** (`201 Created`)：返回创建的 Subject。
- **失败**：`409` —— 名称重复。

---

## 4. 更新学科

- **Method / Path**：`PUT /api/v1/subjects/:id`
- **权限**：`subject.write`
- **请求体**：`name`, `category`（均可选）。
- **成功响应** (`200 OK`)：返回更新后的 Subject。

---

## 5. 删除学科

- **Method / Path**：`DELETE /api/v1/subjects/:id`
- **权限**：`subject.write`
- **约束**：当该学科下存在 `CourseProduct` / `CourseInstance` 时拒绝删除，返回 `400`。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 存在下级引用，删除被拒 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 学科不存在 |
| 409 | 名称重复 |

---

## 跨机构同步（仅平台超管）

> 用途：当用户为平台超管 (`User.isPlatformAdmin = true`) 时，可以把另一家机构的若干个学科复制到当前所选的目标机构。
> 行为：源端和目标端都按 `name` 去重 —— 同名不覆盖也不报错，直接放进 `skipped` 列表。
> 复制字段：`name` / `category` / `objectives` / `description` / `posterUrl` / `videoUrl`。
> `category` 引用的是平台级 Category 字典（`model === 'Subject'`），可跨机构共享 —— 同步时直接带过 ObjectId；若源端引用的 Category 已被删除或 `model` 变更，复制到目标端时 `category` 置 `null`（仅记录、不阻断）。

---

## 6. 源机构列表

- **Method / Path**：`GET /api/v1/subjects/source-orgs`
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

## 7. 指定机构的学科列表

- **Method / Path**：`GET /api/v1/subjects/by-org/:orgId`
- **权限**：仅平台超管。
- **说明**：列出指定机构下的全部学科，供同步前预览。
- **路径参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| orgId | String | 源机构 ObjectId |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      {
        "_id": "...",
        "name": "钢琴",
        "category": { "_id": "...", "name": "艺术", "code": "art", "level": 0 },
        "objectives": ["基础指法", "入门曲目"],
        "description": "...",
        "posterUrl": "...",
        "videoUrl": "..."
      }
    ]
  }
}
```

- **失败**：`400` orgId 不合法；`401` 未登录；`403` 非平台超管。

---

## 8. 同步学科到当前机构

- **Method / Path**：`POST /api/v1/subjects/sync`
- **权限**：仅平台超管；且 `req.orgId`（来自 `x-org-id`）必须存在 —— 即必须先在顶部「机构切换」中选择目标机构。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| sourceOrgId | String | 是 | 源机构 ObjectId（必须 ≠ 目标机构） |
| subjectIds | String[] | 是 | 要复制的源学科 id 列表，1-200 个，全部必须为合法 ObjectId |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "created": [
      {
        "_id": "...",
        "org": "...",
        "name": "钢琴",
        "category": "...",
        "objectives": ["..."],
        "description": "...",
        "posterUrl": "...",
        "videoUrl": "..."
      }
    ],
    "skipped": [
      { "sourceId": "...", "name": "绘画", "reason": "already-exists-in-target" },
      { "sourceId": "...", "name": "编程", "reason": "duplicate-in-source" },
      { "sourceId": "...", "name": null, "reason": "source-subject-not-found" }
    ],
    "createdCount": 2,
    "skippedCount": 1
  }
}
```

- **`skipped[].reason` 取值**：

| reason | 含义 |
| ------ | ---- |
| `already-exists-in-target` | 目标机构已有同名学科（**不覆盖**） |
| `duplicate-in-source` | 源内多次出现同名（仅复制第一条） |
| `source-subject-not-found` | subjectId 在源机构找不到 |

- **失败**：

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 未选目标机构 / sourceOrgId 不合法 / 源等于目标 / subjectIds 为空 / 含非法 id / 超过 200 个 |
| 401 | 未登录 |
| 403 | 非平台超管 |
| 404 | 源 / 目标机构不存在 |
