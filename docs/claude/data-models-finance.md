# 数据模型 - 财务 (Finance)

> **何时读这个文件**：改财务模块、账本/流水/转账、收支原因、汇总、对账时读。
> **一行摘要**：account-ledger 范式 — FinanceAccount（账本：银行/微信/支付宝/现金/其他）+ FinanceTransaction（append-only 流水：收入/支出/转账，账号必填）+ FinanceReason（复用 Category 字典 model='FinanceReason'，含 direction 语义）。

---

> 所有外键使用小写实体名（如 `account`、`reason`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

---

## FinanceAccount（财务账号 / 账本）

**字段**：

- `org`（Org ref）— 多租户隔离
- `name`（String，trim，maxlength=50）— 账本名，**同 org 唯一**
- `type`（enum: `bank` / `wechat` / `alipay` / `cash` / `other`）
- **类型相关子字段**（service 按 type 强校验必填/可选）：
  - `bank` → `bankName` (开户行) + `accountHolder` (户名) + `accountNumberLast4` (账号末四位脱敏) + `branch` (支行, 可选)
  - `wechat` → `wechatId`
  - `alipay` → `alipayId`
  - `cash` → `location` (保险柜/抽屉位置, 可选)
  - `other` → 描述放 `remark`
- `isActive`（bool）— 软启用，停用后不入下拉但保留历史
- `isPrimary`（bool）— 机构默认账本；**每 org 至多 1 个**（partial unique 索引保证）
- `balance` / `totalIncome` / `totalExpense` / `lastTransactionAt` — 写流水后 `$inc` 累加
- `createdBy`（User ref）、`remark`、`meta`

**索引**：
- `{ org: 1, name: 1 }` unique
- `{ org: 1, isActive: 1 }`
- `{ org: 1, type: 1 }`
- `{ org: 1, isPrimary: 1 }` **unique + partial** (`partialFilterExpression: { isPrimary: true }`)

**删除门控**（CLAUDE.md §8.1）：
1. `requirePlatformPassword`（超管 + 自身密码）
2. 业务硬门：`balance === 0`
3. `assertUnused` 互锁：`FinanceTransaction.countDocuments({account: id}) === 0`

切换默认账本时，service 先 `updateMany({org, _id: {$ne: id}}, {isPrimary: false})` 再 `updateOne({_id: id}, {isPrimary: true})`（partial unique 索引保护单点）。

---

## FinanceTransaction（财务流水）

> 不可物理删除。append-only ledger。撤销走反向流水（service 提供 pattern）。

**字段**：

- `org`（Org ref）
- `account`（FinanceAccount ref，**必填**）— 用户原始诉求
- `type`（enum: `income` / `expense` / `transfer`）
- `amount`（Number，> 0.01）— 永远 > 0；方向由 `type` 决定
- `reason`（Category ref，**必填**）— 指向 `Category(model='FinanceReason')`
- `relatedOrder`（Order ref，可选）— Phase 2 联动后由 order.pay 写入
- `relatedStudent`（Student ref，可选）— 学员报名费 / 退费场景
- `transferGroupId`（String）— `type='transfer'` 时关联 2 笔（一出 + 一入）
- `relatedTransferAccount`（FinanceAccount ref）— `type='transfer'` 时指对端账本
- `operator`（User ref，**必填**）
- `occurredAt`（Date，**必填**，默认 now）— 业务发生时间（可改历史日期）
- `balanceAfter`（Number，**必填**）— 写后余额快照，对账用
- `remark`、`meta`

**索引**：
- `{ org: 1, account: 1, occurredAt: -1 }` — 主列表
- `{ org: 1, type: 1, occurredAt: -1 }` — 按类型
- `{ org: 1, reason: 1, occurredAt: -1 }` — 按原因聚合
- `{ org: 1, transferGroupId: 1 }` — 转账对账
- `relatedOrder` / `relatedStudent` 字段索引（订单/学员侧反向查询）

### amount 符号语义

| `type` | 余额变化 | `reason.direction` 校验 |
|---|---|---|
| `income`  | `balance += amount` | 必填 `in` |
| `expense` | `balance -= amount` | 必填 `out` |
| `transfer` | 转出账本 `-= amount` / 转入账本 `+= amount` | 不强约束（允许"内部转账"类） |

### 撤销模式

业务上需要"删一笔流水"时，**不要物理删除**。正确做法：写一条反向流水。
例：误录了一笔 `expense 1000`，撤销时写 `income 1000`，`remark` 写 "冲销 `<原 _id>`" + 选 `in` 类原因，余额自动归零。

### 转账 2 笔流水

`POST /finance/transactions/transfer` 一次写 2 笔：
- 笔 A：`account=from, type=transfer, amount=N, relatedTransferAccount=to, balanceAfter=from.balance-N`
- 笔 B：`account=to,   type=transfer, amount=N, relatedTransferAccount=from, balanceAfter=to.balance+N`
- 共享 `transferGroupId`（生成 `new ObjectId().toString()`）

`transferAccounts` 用 `mongoose.startSession()` + `session.startTransaction()`，2 笔必须在同一 session 内完成；失败 abort。

---

## FinanceReason（财务原因）

**复用 Category 字典**，不新建独立 model。`Category.model === 'FinanceReason'`（2026-06-25 立项扩展 `Category.model` enum）。

**字段**（沿用 Category schema）：
- `org`（Org ref，必填，per-org 隔离）
- `name`（String，必填，trim）— "学员报名" / "工资" / "租金" / "退费" / "内部转账" / ...
- `meta.direction`（`'in'` / `'out'`，**必填**）— service 校验 `type` 与 `direction` 一致（transfer 除外）
- `meta.category`（String，可选）— 二级分类："学费" / "人工" / "场地" / "办公" / "其他" / "转账"（UI 分组用）
- `isActive`（bool）
- `sort`（Number）
- `level` / `parentCategory`（保留多级分类扩展能力，本期只用顶级）

**唯一索引**： `{ org: 1, model: 1, name: 1, parentCategory: 1 }`（Category 既有）

**删除门控**：
1. `requirePlatformPassword`
2. 业务硬门：`FinanceTransaction.countDocuments({reason: id}) === 0`

**Seed**（梓潼 + 所有启用 org）：
- 学员报名 (in) / 退费 (out) / 工资 (out) / 租金 (out) / 水电 (out) / 办公用品 (out) / 其他收入 (in) / 其他支出 (out) / 内部转账 (in+out 都允许, category=转账)

---

## 汇总 (getSummary)

`GET /finance/transactions/summary?groupBy=reason|account|day|month&dateFrom=&dateTo=&accountId=&type=`

返回 `[{ key, label, income, expense, count }]`，对应 `MongoDB aggregate`：
- `groupBy=reason` → 按 `reason` populate 后 name
- `groupBy=account` → 按 `account` populate 后 name
- `groupBy=day` → `$dateToString: { format: '%Y-%m-%d', date: '$occurredAt' }`
- `groupBy=month` → `$dateToString: { format: '%Y-%m', date: '$occurredAt' }`

`income` = `sum(amount where type='income')` + `sum(amount where type='transfer' and relatedTransferAccount=account)`（转入视为入账）
`expense` = `sum(amount where type='expense')` + `sum(amount where type='transfer' and account=this account)`（转出视为出账）

---

## 与 Order 的关系（Phase 1 不挂联动）

- `Order.paymentMethod`（`wechat` / `alipay` / `cash` / `bank` / `other`）保持原样，**不强制**关联 FinanceAccount
- Phase 1：财务岗手工从 admin 端录入流水，必要时在 `relatedOrder` 字段挂订单 ID
- Phase 2：`order.service.pay` 末尾用 outbox 模式写 FinanceTransaction（详见 plans/enchanted-swinging-rocket.md §7）

---

## 与 Points 的对比（account-ledger 同源）

| 维度 | Points | Finance |
|---|---|---|
| 账户 | PointsAccount (1 学生 1 账户) | FinanceAccount (1 机构 N 账本) |
| 流水 | PointsTransaction | FinanceTransaction |
| 业务触发 | points.service.recordTransaction | financeTransaction.service.recordTransaction |
| 字典 | Category(model='PointsReason') | Category(model='FinanceReason') |
| amount 符号 | 有符号（+入 / -出） | 永远 > 0；方向由 type 字段 |
| 余额更新 | $inc balance + totalEarned/Spent | $inc balance + totalIncome/Expense |
| 撤销模式 | 反向流水 (trigger='refund') | 反向流水 (type 翻转) |
| 物理删除 | 不支持 | 账本可删（业务门挡）；流水不可删 |

---

## 权限码 (2026-06-25 立项)

- `finance.read` — 列表/详情/汇总/字典只读（默认：管理员 + 教务 + 财务）
- `finance.write` — 写账本/写流水/转账/字典 CRUD（默认：管理员 + 财务）

4 处同步范式：见 [position-dual-hardcode-pitfall](../../.claude/projects/-Users-kelin-prog-rgzw-edustation/memory/position-dual-hardcode-pitfall.md) 与 [report-permission-rollout](../../.claude/projects/-Users-kelin-prog-rgzw-edustation/memory/report-permission-rollout.md)。新装机构走 `initial.data.json` + `position.service.js DEFAULT_POSITIONS`；老机构跑 `scripts/db/_migrate-finance-permissions.js` 补齐。
