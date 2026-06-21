# PointsAdmin 模块 API 文档（admin 端）

> 基础路径：`/api/v1/points-admin`
>
> 积分管理（admin 端）：学员积分账户只读 + 全机构流水 + 手动调整积分 + 积分原因只读。
> 与家长端 `/api/v1/points/*` 完全分开（家长端用 `x-active-student-id`，admin 端用 `req.params.studentId`）。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 中间件链：`mws.authenticate` → `mws.requireOrg` → `mws.requirePermission(...)`。
- 权限码：
  - `points.read` — 列表 / 详情 / 流水 / 原因
  - `points.write` — 手动调整积分

---

## 1. 学员积分账户列表

- **Method / Path**：`GET /api/v1/points-admin/accounts`
- **权限**：`points.read`
- **查询参数**：

| 参数 | 类型 | 默认 | 说明 |
| ---- | ---- | ---- | ---- |
| page | Number | 1 | 页码 |
| pageSize | Number | 20 | 每页条数（max 100） |
| keyword | String | | 学生姓名 / 监护人手机号模糊 |
| sortBy | String | `balance-desc` | `balance-desc` / `recent` / `name` |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      {
        "_id": "...",
        "name": "张三",
        "gender": "male",
        "school": "...",
        "isActive": true,
        "balance": 120,
        "totalEarned": 200,
        "totalSpent": 80,
        "lastTransactionAt": "2026-06-21T08:00:00.000Z",
        "guardians": [
          { "_id": "...", "realName": "张妈妈", "mobile": "13800001234" }
        ]
      }
    ],
    "total": 45,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 2. 单个学员账户 + 最近流水

- **Method / Path**：`GET /api/v1/points-admin/accounts/:studentId`
- **权限**：`points.read`
- **路径参数**：`studentId` — 学员 ObjectId
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "account": {
      "_id": "...",
      "org": "...",
      "student": "...",
      "balance": 120,
      "totalEarned": 200,
      "totalSpent": 80,
      "lastTransactionAt": "..."
    },
    "recentTransactions": [
      {
        "_id": "...",
        "amount": 10,
        "trigger": "manual_earn",
        "reason": { "_id": "...", "name": "考勤积分", "meta": { "defaultValue": 5 } },
        "operator": { "_id": "...", "realName": "王老师" },
        "balanceAfter": 120,
        "remark": "...",
        "createdAt": "..."
      }
    ]
  }
}
```

---

## 3. 手动调整积分

- **Method / Path**：`POST /api/v1/points-admin/accounts/:studentId/adjust`
- **权限**：`points.write`
- **路径参数**：`studentId` — 学员 ObjectId
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| amount | Number | 是 | signed 整数（正=加分,负=扣分, 绝对值即调整量） |
| reasonId | String | 是 | PointsReason category _id（必须是 `model='PointsReason'` 且 `isActive=true` 且同 orgId） |
| customReason | String | 否 | 自定义备注（覆盖 reason.name 默认备注） |
| remark | String | 否 | 附加备注 |

- **成功响应** (`201 Created`)：

```json
{
  "data": {
    "transaction": {
      "_id": "...",
      "amount": 5,
      "trigger": "manual_earn",
      "reason": "...",
      "operator": "...",
      "balanceAfter": 125,
      "remark": "考勤积分",
      "createdAt": "..."
    },
    "account": {
      "_id": "...",
      "balance": 125,
      "totalEarned": 205,
      "totalSpent": 80
    }
  }
}
```

---

## 4. 全机构流水

- **Method / Path**：`GET /api/v1/points-admin/transactions`
- **权限**：`points.read`
- **查询参数**：

| 参数 | 类型 | 默认 | 说明 |
| ---- | ---- | ---- | ---- |
| page | Number | 1 | 页码 |
| pageSize | Number | 30 | 每页条数（max 200） |
| studentId | String | | 按学员过滤 |
| trigger | String | | CSV 多选，如 `manual_earn,manual_deduct` |
| from | ISO Date | | 起始日期（含） |
| to | ISO Date | | 截止日期（含） |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      {
        "_id": "...",
        "amount": 5,
        "trigger": "manual_earn",
        "student": { "_id": "...", "name": "张三", "gender": "male" },
        "reason": { "_id": "...", "name": "考勤积分" },
        "operator": { "_id": "...", "realName": "王老师" },
        "balanceAfter": 125,
        "remark": "...",
        "createdAt": "..."
      }
    ],
    "total": 152,
    "page": 1,
    "pageSize": 30
  }
}
```

---

## 5. 活跃积分原因（下拉用）

- **Method / Path**：`GET /api/v1/points-admin/reasons`
- **权限**：`points.read`
- **说明**：返回当前 org 所有 `isActive=true` 的 PointsReason category，按 sort 升序。
- **成功响应** (`200 OK`)：

```json
{
  "data": [
    { "id": "...", "name": "订单积分", "defaultValue": 1600, "direction": "in" },
    { "id": "...", "name": "考勤积分", "defaultValue": 5, "direction": "in" },
    { "id": "...", "name": "迟到扣分", "defaultValue": -5, "direction": "out" }
  ]
}
```

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | `amount` 非法 / `reasonId` 缺失或不属于 PointsReason / 日期格式错 |
| 401 | 未登录 |
| 403 | 无 `points.read` / `points.write` 权限 / 学员已被禁用 |
| 404 | 学员不存在 |
| 422 | 积分不足（扣分超额） |
