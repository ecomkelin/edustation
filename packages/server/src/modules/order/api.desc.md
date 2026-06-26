# Order 模块 API 文档

> 基础路径：`/api/v1/orders`
>
> 订单管理。一个订单可包含**多个 CourseProduct**（`items` 数组；如"国画 48 节 + 书法 24 节"打包购买）。
> 订单状态：`pending`（待支付）→ `paid`（已支付）→ `partially_refunded`（部分退款）/ `refunded`（已退款）/ `cancelled`（已取消，仅 pending 可达）。
> **支付成功（`pay`）会自动按 `items` 逐项创建 `StudentProduct`**（`source='order'`）。
> **退款（`refund`）支持部分退款累计**，累计到 `refundedAmount == paidAmount` 自动转 `refunded`；首次退款时联动把所有 `StudentProduct` 软停用。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `order.read`
  - `order.write` —— 创建/取消
  - `order.pay` —— 标记支付 / 发起退款（label "收款 / 退款"，权限码语义统一，财务复用）
- 状态枚举（`ORDER_STATUSES`）：`pending` / `paid` / `partially_refunded` / `cancelled` / `refunded`。
- 支付方式（`PAYMENT_METHODS`）：`cash`（现金） / `wechat`（微信） / `alipay`（支付宝） / `bank`（银行转账） / `other`。
- 价格逻辑：
  - `originalPrice` = `Σ items[].unitPrice * items[].quantity`（创建时由 CourseProduct 当前价快照）
  - `actualPrice` = 实际成交价（可优惠；`<= originalPrice`）
  - `paidAmount` = 累计实收金额（分期/部分支付时 `< actualPrice`）
  - `paidAt` = 最近一次支付成功时间（service 写入）

---

## 1. 订单列表

- **Method / Path**：`GET /api/v1/orders`
- **权限**：`order.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| student | String (ObjectId) | 按学生过滤 |
| status | String | 状态过滤（可逗号分隔多值） |
| paymentMethod | String | 支付方式 |
| start | Date | 创建时间下界 |
| end | Date | 创建时间上界 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：`{ data: { items: Order[], total, page, pageSize } }`。

`Order` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Order._id |
| org | String | 机构 ID |
| student | Object | 学生（populate） |
| items | OrderItem[] | 订单明细（每项含 courseProduct / quantity / unitPrice / name 快照） |
| originalPrice | Number | 原价 |
| actualPrice | Number | 实际成交价 |
| paidAmount | Number | 已付金额 |
| paidAt | Date\|null | 最近一次支付成功时间 |
| refundedAmount | Number | 累计退款金额（0 ≤ refundedAmount ≤ paidAmount；2026-06-25 R-1722 退款端点） |
| refundedAt | Date\|null | 最近一次退款时间 |
| refunds | RefundItem[] | 退款流水子文档（每次退款一笔，含 amount/reason/operator/refundedAt + 课时快照） |
| status | String | 订单状态 |
| paymentMethod | String\|null | 支付方式 |
| remark | String | 备注 |
| createdAt / updatedAt | Date | 时间戳 |

`OrderItem` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| courseProduct | Object | 课程产品（populate；含 discountPrice / promotionPrice） |
| quantity | Number | 数量 |
| unitPrice | Number | 单价快照（创建时取自 CourseProduct 当前价） |
| name | String | 产品名快照 |

---

## 2. 订单详情

- **Method / Path**：`GET /api/v1/orders/:id`
- **权限**：`order.read`
- **成功响应** (`200 OK`)：单个 Order 对象。

---

## 3. 创建订单

- **Method / Path**：`POST /api/v1/orders`
- **权限**：`order.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| student | String (ObjectId) | 是 | 学生 ID |
| items | OrderItemInput[] | 是 | 至少 1 项 |
| actualPrice | Number | 否 | 实际成交价；不传时 = `originalPrice` |
| paymentMethod | String | 否 | 支付方式；与 `paidAmount` 同时传则一气呵成建为已支付订单 |
| paidAmount | Number | 否 | 实付金额；与 `paymentMethod` 同时传则一气呵成建为已支付订单 |
| remark | String | 否 | 备注，长度 <= 500 |

`OrderItemInput`（请求体中的 items 元素）：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| courseProduct | String (ObjectId) | 是 | 课程产品 ID |
| quantity | Number | 否 | 数量，默认 1，>= 1 |

- **副作用**：
  - service 加载所有 CourseProduct，校验存在/上架/同机构
  - 对每项快照 `unitPrice`（`promotionActive=true` 时取 `promotionPrice`，否则 `discountPrice`）和 `name`
  - `originalPrice = Σ unitPrice * quantity`
  - 业务动作二选一：
    - **「待支付」订单**：`paymentMethod` 和 `paidAmount` 都缺省 → `status='pending'`，`paidAmount=0`，`paidAt=null`
    - **「员工线下收款一气呵成」订单**：`paymentMethod` 与 `paidAmount` 同时传入 → 原子地 `status='paid'`，写入 `paymentMethod / paidAmount / paidAt`，并**按 items 创建 `StudentProduct`**（`source='order'`）
- **StudentProduct 数量规则**：同一 `courseProduct` 的多个 item（含 `quantity > 1` 或重复行）**合并成一份** SP，`totalLessons = p.totalLessons × 累计 quantity`，`remainingLessons` 同。例：「16 节课包 × 3」→ 1 份 48 节 SP。
- **成功响应** (`201 Created`)：
  - 待支付订单：返回单个 Order 对象
  - 已支付订单：返回 `{ order: Order, studentProducts: StudentProduct[] }`
- **约束**：
  - 学生必须属于本机构。
  - 所有课程产品必须属于本机构且 `isActive=true`，否则 `400`。
  - `paymentMethod` 与 `paidAmount` 必须同时缺省或同时传入（避免「半成品」状态）。

---

## 4. 支付订单（按 items 创建 StudentProduct）

- **Method / Path**：`POST /api/v1/orders/:id/pay`
- **权限**：`order.pay`
- **说明**：订单标记为 `paid`，并**按 items**创建 `StudentProduct`（`source='order'`），
  写入 `totalLessons`、`remainingLessons`、`expireDate`（按课程产品 `validDays` 计算）。
  - 同一 `courseProduct` 的多个 item **合并成一份** SP，`totalLessons = p.totalLessons × 累计 quantity`。
  - **典型场景**：未来家长端 / 小程序线上支付后，支付网关异步回调时调用此接口。
  - **门店收银场景**应直接走「创建订单」接口并同时传 `paymentMethod + paidAmount`（见上一节），**不需要**先建 pending 订单再回调本接口。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| paymentMethod | String | 是 | 支付方式 |
| paidAmount | Number | 是 | 实付金额，>= 0 |

- **约束**：
  - 仅 `status='pending'` 可支付，已支付/已取消返回 `400`。
  - `paidAmount` 通常应等于 `actualPrice`；分期场景允许 `< actualPrice`，但订单会保持 `pending`。
- **成功响应** (`200 OK`)：返回 Order 与新建的 StudentProduct 数组。

```json
{
  "success": true,
  "data": {
    "order": { "id": "...", "status": "paid", "paidAmount": 1980 },
    "studentProducts": [
      { "id": "...", "totalLessons": 16, "remainingLessons": 16, "expireDate": "2027-06-08T...", "source": "order" }
    ]
  }
}
```

---

## 5. 取消订单

- **Method / Path**：`POST /api/v1/orders/:id/cancel`
- **权限**：`order.write`
- **说明**：将 `status='cancelled'`。已支付订单（`status='paid'`）不能直接取消，需走退款流程（阶段 3 财务模块）。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| reason | String | 否 | 取消原因，长度 <= 200 |

- **约束**：`status='paid'` 的订单取消返回 `400`，提示需走退款。
- **成功响应** (`200 OK`)：返回取消后的 Order。

---

## 6. 退款（R-1722 2026-06-25 立项）

- **Method / Path**：`POST /api/v1/orders/:id/refund`
- **权限**：`order.pay`（label 已是"收款 / 退款"，财务复用）
- **说明**：支持部分退款（多次退款累计），累计到 `refundedAmount == paidAmount` 时自动 `status='refunded'`。**首次退款时**把该订单下的所有 `StudentProduct`（`source='order'`）软停用（`isActive=false` + `meta.refundedAt/reason/refundId`），后续不再重复操作。已消课的考勤不回滚（保留审计），`CourseEnrollment.studentProduct`（主用课包）不解绑（软引用，FIFO 兜底）。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| amount | Number | 是 | 本次退款金额，`> 0`，`≤ (paidAmount - refundedAmount)` |
| reason | String | 是 | 退款原因，1-500 字（财务凭证 + 家长沟通追溯） |

- **约束**：
  - 仅 `status='paid' / 'partially_refunded'` 可退；其他状态返回 `422`。
  - `amount` 超出可退余额返回 `422`（含 0.01 浮点容差）。
  - **失败补偿**：若首次退款的 SP 联动停用失败，service 自动回滚 Order（refunds 子文档 / refundedAmount / status 全部回退），返回 `422`。
- **成功响应** (`200 OK`)：

```json
{
  "success": true,
  "data": {
    "order": { "id": "...", "status": "partially_refunded|refunded", "refundedAmount": 500, "refunds": [...] },
    "refundId": "ObjectId",
    "newStatus": "partially_refunded|refunded",
    "refundedAmount": 500
  }
}
```

- **副作用**：
  - `Order.refunds.push({ amount, reason, operator, refundedAt, remainingLessonsSnapshot, consumedLessonsSnapshot })`
  - `Order.refundedAmount += amount`；`Order.refundedAt = new Date()`
  - `Order.status` 视累计结果置为 `partially_refunded` 或 `refunded`
  - 首次退款：`StudentProduct.updateMany({ order, org, isActive: true }, { isActive: false, meta.refundedAt/reason/refundId })`
  - `invalidateReportCache(orgId)` —— 报表"本月净收入"需重算

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 课包下架 / 订单已支付/已取消 / 退款走错接口 / 退款金额 <= 0 |
| 401 | 未登录 |
| 403 | 权限不足（缺 `order.pay` 权限） |
| 404 | 订单/课包/学生不存在 |
| 422 | 状态不允许退款 / 退款金额超出可退余额 / 联动停用 SP 失败 |
