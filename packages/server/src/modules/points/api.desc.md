# Points 模块 API 文档（家长端）

> 基础路径：`/api/v1/points`
>
> 家长登录后**始终操作当前激活子女**的积分。
> 本期已完整实现 `me` / `transactions` / `earn`（earn 是 internal-only，阶段 3 分享得积分等业务触发）。
> Admin 端手动调整积分 / 流水管理 走 `/api/v1/points-admin/*`（见 [pointsAdmin/api.desc.md](../pointsAdmin/api.desc.md)）。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`、**`x-active-student-id`**。
- 中间件链：`mws.authenticate` → `mws.requireOrg` → `mws.activeStudent`。
- 不需业务权限码（家长端）。

---

## 1. 当前孩子的积分账户 + 最近流水

- **Method / Path**：`GET /api/v1/points/me`
- **权限**：authenticated
- **说明**：返回当前激活子女的积分账户（含 `balance/totalEarned/totalSpent/lastTransactionAt`）+ 最近 50 条流水。
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "student": "...",
    "balance": 120,
    "totalEarned": 200,
    "totalSpent": 80,
    "lastTransactionAt": "2026-06-21T08:00:00.000Z",
    "recentTransactions": [
      {
        "_id": "...",
        "amount": 10,
        "trigger": "manual_earn",
        "reason": { "name": "考勤积分", "meta": { "defaultValue": 5 } },
        "operator": { "realName": "王老师" },
        "balanceAfter": 120,
        "remark": "考勤积分",
        "createdAt": "2026-06-21T08:00:00.000Z"
      }
    ]
  }
}
```

---

## 2. 触发积分入账（internal-only）

- **Method / Path**：`POST /api/v1/points/earn`
- **权限**：authenticated（**当前未开放给家长端**，阶段 3 业务触发时由 server 端内部调用；普通家长调此端点会因没 `student` 而 400）
- **说明**：用于阶段 3 的分享得积分、签到、活动奖励等触发场景的内部接口。本期已用 `points.service.recordTransaction` 实现完整 account-ledger。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| student | String | 是 | 学员 ObjectId（可选，省略时取 `x-active-student-id`） |
| amount | Number | 是 | 积分变动（signed，正=入账，负=出账） |
| trigger | String | 是 | POINTS_TRIGGERS 枚举：`manual_earn`/`order_earn`/`attendance_earn`/...（见 shared/enums.js） |
| reason | String | 否 | PointsReason category _id（manual_* 必填） |
| refType | String | 否 | 关联实体名（`'Pet'`/`'Order'`/...） |
| refId | String | 否 | 关联实体 _id |
| meta | Object | 否 | 业务扩展字段 |
| remark | String | 否 | 备注 |

- **成功响应** (`201 Created`)：

```json
{
  "data": {
    "transaction": {
      "_id": "...",
      "amount": 10,
      "trigger": "manual_earn",
      "balanceAfter": 130,
      "reason": "...",
      "operator": "...",
      "createdAt": "..."
    },
    "account": {
      "_id": "...",
      "balance": 130,
      "totalEarned": 200,
      "totalSpent": 80
    }
  }
}
```

---

## 3. 积分流水分页

- **Method / Path**：`GET /api/v1/points/transactions`
- **权限**：authenticated
- **查询参数**：

| 参数 | 类型 | 默认 | 说明 |
| ---- | ---- | ---- | ---- |
| student | String | `x-active-student-id` | 学员 ObjectId |
| page | Number | 1 | 页码 |
| pageSize | Number | 30 | 每页条数（max 100） |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      {
        "_id": "...",
        "amount": 10,
        "trigger": "manual_earn",
        "reason": { "name": "考勤积分" },
        "operator": { "realName": "王老师" },
        "balanceAfter": 130,
        "remark": "...",
        "createdAt": "..."
      }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 30
  }
}
```

---

## 数据模型（参考）

`PointsAccount`（[models/PointsAccount.model.js](../../models/PointsAccount.model.js)）：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| org | ObjectId | 所属机构 |
| student | ObjectId | 所属学生（unique） |
| balance | Number | 当前余额（>= 0） |
| totalEarned | Number | 累计入账 |
| totalSpent | Number | 累计出账（正数） |
| lastTransactionAt | Date | 最近一笔流水时间 |

`PointsTransaction`（[models/PointsTransaction.model.js](../../models/PointsTransaction.model.js)）：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| org | ObjectId | 所属机构 |
| student | ObjectId | 所属学生 |
| account | ObjectId | 反向引用积分账户 |
| amount | Number | signed: 正=入账, 负=出账 |
| trigger | String | POINTS_TRIGGERS 枚举（业务触发来源） |
| refType / refId | String / ObjectId | 多态引用业务实体 |
| reason | ObjectId (Category) | 关联积分原因（manual_* 必填） |
| operator | ObjectId (User) | 触发员工（manual_* 必填） |
| meta | Mixed | 业务扩展字段 |
| balanceAfter | Number | 写入流水时的账户余额快照 |
| remark | String | 备注 |
| createdAt | Date | 时间戳 |

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 缺少 `x-active-student-id` / `amount` 非法 / reason 不合法 |
| 401 | 未登录 |
| 403 | 学员已禁用 / 当前用户无对应操作权限 |
| 404 | 学员不存在 |
| 422 | 积分不足（扣分超额） |
