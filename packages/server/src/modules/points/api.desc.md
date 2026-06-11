# Points 模块 API 文档（Stub）

> 基础路径：`/api/v1/points`
>
> 积分账户模块。家长登录后**始终操作当前激活子女**的积分。
> 当前模块为 **Stub 实现**（仅占位路由），积分商城、分享得积分、签到积分等完整能力将在阶段 2/3 扩展。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`、**`x-active-student-id`**。
- 中间件链：`mws.authenticate` → `mws.requireOrg` → `mws.activeStudent`。
- 不需 `student.read`，家长端无需任何业务权限码即可调用。

---

## 1. 当前孩子的积分余额

- **Method / Path**：`GET /api/v1/points/me`
- **权限**：authenticated
- **说明**：返回当前激活子女的积分账户。若不存在则惰性创建（`balance=0`）。
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "student": "...",
    "balance": 120
  }
}
```

> **Stub 状态**：可能直接返回 `balance=0` 占位。

---

## 2. 触发积分入账（Stub）

- **Method / Path**：`POST /api/v1/points/earn`
- **权限**：authenticated
- **说明**：用于阶段 3 的分享得积分、签到、活动奖励等触发场景的内部接口。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| amount | Number | 是 | 入账积分，正整数 |
| type | String | 是 | 业务类型（`share` / `signin` / `activity` / `other`） |
| refId | String | 否 | 关联业务 ID（分享 ID、活动 ID 等） |
| remark | String | 否 | 备注 |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "transaction": { "id": "...", "amount": 10, "type": "share", "refId": "..." },
    "balance": 130
  }
}
```

> **Stub 状态**：当前接口为占位，不会真正写入 `PointsTransaction`。

---

## 3. 积分流水

- **Method / Path**：`GET /api/v1/points/transactions`
- **权限**：authenticated
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| type | String | 业务类型 |
| start | Date | 下界 |
| end | Date | 上界 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 30 |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      { "id": "...", "amount": 10, "type": "share", "refId": "...", "createdAt": "..." }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 30
  }
}
```

> **Stub 状态**：可能返回空数组。

---

## 数据模型（参考）

`PointsAccount`：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| student | ObjectId | 所属学生（unique） |
| balance | Number | 当前余额 |

`PointsTransaction`：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| student | ObjectId | 所属学生 |
| amount | Number | 正为入账，负为消耗 |
| type | String | 业务类型枚举 |
| refId | String | 关联业务 ID |
| remark | String | 备注 |
| createdAt | Date | 时间戳 |

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 缺少 `x-active-student-id` / `amount` 非法 |
| 401 | 未登录 |
| 404 | 学生不存在 |
