# 数据模型 - Order / StudentProduct / 支付

> **何时读这个文件**：改订单、课包、支付流程、赠课（gift）、订单退款回滚时读。
> **一行摘要**：交易核心 — Order（多 item 订单 + 三档金额语义 + status 联动 StudentProduct）+ StudentProduct（学生持有的课包，支持订单和赠课两种 source）。

---

> 所有外键使用小写实体名（如 `student`、`courseProduct`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

---

## Order（订单）

**字段**：

- `org`（Org ref）
- `student`（Student ref）
- `items`：`[{ courseProduct, quantity, unitPrice, name }]` — 一个订单可同时购买**多个 CourseProduct**（如"国画 48 节 + 书法 24 节"打包购买）
  - `courseProduct`（CourseProduct ref）
  - `quantity`（Number）
  - `unitPrice`（创建时从 `CourseProduct.discountPrice` 拷贝；如 `promotionActive=true` 则切到 `promotionPrice`）
  - `name`（String — 快照，避免后续产品改名后订单显示错乱）
- `originalPrice`：订单创建时锁定（`Σ items[].unitPrice * items[].quantity`）；不再随产品调价变化
- `actualPrice`：实际成交价（可被促销/折扣/手动调价覆盖；`<= originalPrice`）
- `paidAmount`：累计实收金额（分期付款时 `< actualPrice`；多次付款累加）
- `paidAt`：最近一次支付成功时间（service 写入）
- `status`：`pending` / `paid` / `cancelled` / `refunded`
- `paymentMethod`
- `remark`

### 金额语义（务必搞清）

| 字段 | 含义 | 备注 |
|---|---|---|
| `originalPrice` | 订单创建时锁定的原价合计 | 来自 items 的 `unitPrice * quantity` 之和，订单创建后不变 |
| `actualPrice` | 实际成交价 | 可被促销/折扣/手动调价覆盖；`<= originalPrice` |
| `paidAmount` | 累计实收金额 | 分期付款时 `< actualPrice`；多次付款累加 |
| `paidAt` | 最近一次支付成功时间 | service 写入 |

### 支付联动

`status` → `paid` 时，**按 items 逐项**创建对应 StudentProduct（每项一条 `source='order'`）；退款/取消时按 items 回滚对应 StudentProduct。

> 详细见 CLAUDE.md §16.3 "待开发" 表：`Order.source` / `Order.referrerUserId` 字段待立项。

## StudentProduct（学生持有的课包）

**字段**：

- `student`（Student ref）
- `source`：`'order'`（来自订单付款成功）/ `'gift'`（员工赠课）
- `order`（Order ref — 仅 source='order' 时有值）
- `courseProduct`（CourseProduct ref）
- `totalLessons`
- `remainingLessons`
- `expireDate`
- `isActive`
- `giftReason`（仅 source='gift' 时必填）
- `giftedBy`（User ref — 仅 source='gift' 时必填）
- `giftedAt`（仅 source='gift' 时自动写入）

### `source` 二分语义

| source | order | giftReason | giftedBy | giftedAt |
|---|---|---|---|---|
| `'order'` | **必填** | 空 | 空 | 空 |
| `'gift'` | 空（孤儿赠课） | **必填** | **必填**（员工 User._id） | 自动写入 |

### UI 展示

赠课产生的 StudentProduct 在管理后台/家长端**标红**（区别于正常购买），并显示 `giftReason` 让家长知悉来源。

### 送课权限

员工创建 `source='gift'` 的 StudentProduct **必须**拥有 `studentProduct.gift` 权限码（独立于 `order.write`）；无此权限者只能通过订单支付流程创建 StudentProduct。

### 消课规则

同 [data-models-enrollment.md](./data-models-enrollment.md) §消课规则（FIFO 按 `expireDate` 升序）。
