# 财务模块 API 文档 (Finance Module)

> 基础路径：`/api/v1/finance`
>
> 财务管理 (2026-06-25 立项)：财务账本 (FinanceAccount) + 财务流水 (FinanceTransaction) + 收支原因字典 (复用 Category.model='FinanceReason')。
> 流水为 **append-only ledger** —— 不可物理删除，撤销走反向流水。
> Phase 1 不挂 Order 自动联动，财务岗手动录入。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`
- 中间件链：`mws.authenticate` → `mws.requireOrg` → `mws.requirePermission(...)`
- 权限码：
  - `finance.read` — 列表/详情/汇总/字典只读
  - `finance.write` — 写账本/写流水/转账/字典 CRUD
- 物理删除账本/字典需要 `requirePlatformPassword`（超管+二次密码），路由层硬门

---

## 1. 账本管理 `/finance/accounts`

### 1.1 列出账本 — R-3400

- `GET /api/v1/finance/accounts`
- 权限：`finance.read`
- 查询参数：`page`、`pageSize`、`type` (`bank`/`wechat`/`alipay`/`cash`/`other`)、`isActive`、`search` (模糊匹配 name/bankName/holder/wechatId/alipayId/location)
- 响应：`{ data: { items: FinanceAccount[], total, page, pageSize } }`，按 `isPrimary desc, createdAt desc` 排序

### 1.2 获取默认账本 — R-3401

- `GET /api/v1/finance/accounts/primary`
- 权限：`finance.read`
- 响应：`{ data: FinanceAccount | null }` (isPrimary=true && isActive=true 的第一本)

### 1.3 账本详情（含最近 10 笔流水）— R-3402

- `GET /api/v1/finance/accounts/:id`
- 权限：`finance.read`
- 响应：`{ data: { account: FinanceAccount, recentTransactions: FinanceTransaction[] } }`

### 1.4 新建账本 — R-3403

- `POST /api/v1/finance/accounts`
- 权限：`finance.write`
- 请求体：
  ```json
  {
    "name": "招商银行卡-王校长",
    "type": "bank",
    "bankName": "招商银行梓潼支行",
    "accountHolder": "王校长",
    "accountNumberLast4": "1234",
    "branch": "梓潼支行",
    "remark": "对公账户"
  }
  ```
- 子字段强校验：bank → `bankName`+`accountHolder`+`accountNumberLast4` 必填；wechat → `wechatId` 必填；alipay → `alipayId` 必填
- 机构首本 cash 自动 `isPrimary=true`

### 1.5 更新账本 — R-3404

- `PUT /api/v1/finance/accounts/:id`
- 权限：`finance.write`
- 可改字段：`name/bankName/accountHolder/accountNumberLast4/branch/wechatId/alipayId/location/isActive/remark`
- **禁止**改：`type` / `balance` / `isPrimary` (防误操作)

### 1.6 删除账本 — R-3405 (高风险)

- `DELETE /api/v1/finance/accounts/:id`
- Auth：`requirePlatformPassword`（超管+二次密码）
- 业务硬门：
  1. `balance === 0` 否则 422 "请先冲销余额"
  2. `isPrimary` 不可删 (422 "默认账本不可物理删除")
  3. `assertUnused`：无任何 FinanceTransaction 引用

### 1.7 删除预检 — R-3406

- `GET /api/v1/finance/accounts/:id/removable-check`
- 权限：`finance.read`
- 响应：`{ data: { canRemove, blockers: [{entity,label,count,hint}] } }`
- 前端删除按钮触发前先调，弹挡板说明

---

## 2. 流水管理 `/finance/transactions`

### 2.1 流水列表 — R-3410

- `GET /api/v1/finance/transactions`
- 权限：`finance.read`
- 查询参数：`page`、`pageSize`、`accountId`、`type`、`reason`、`relatedOrder`、`relatedStudent`、`dateFrom`、`dateTo`
- 响应：`{ data: { items: FinanceTransaction[], total, page, pageSize } }`，按 `occurredAt desc, createdAt desc`
- populate：`account(name,type)` / `reason(name,meta)` / `operator(realName,mobile)` / `relatedOrder(_id,actualPrice,paidAmount,status)` / `relatedStudent(_id,name)` / `relatedTransferAccount(name,type)`

### 2.2 流水汇总 — R-3411

- `GET /api/v1/finance/transactions/summary`
- 权限：`finance.read`
- 查询参数：`groupBy` (`reason`/`account`/`day`/`month`，默认 `reason`)、`accountId`、`type`、`dateFrom`、`dateTo`
- 响应：`{ data: { groupBy, rows: [{key, income, expense, transferIn, transferOut, net, count}], totals: {income, expense, transferIn, transferOut, count} } }`
- 看板 4 张卡片：总收入 / 总支出 / 净流入 / 账户数（汇总卡用 `getSummary({groupBy: 'account'})` 计算；账户数走 listAccounts）

### 2.3 流水详情 — R-3412

- `GET /api/v1/finance/transactions/:id`
- 权限：`finance.read`
- 响应：`{ data: FinanceTransaction }`（含 populate 字段）

### 2.4 写一笔流水 — R-3413

- `POST /api/v1/finance/transactions`
- 权限：`finance.write`
- 请求体：
  ```json
  {
    "account": "<FinanceAccount._id>",
    "type": "income" | "expense",
    "amount": 1000,
    "reason": "<FinanceReason._id>",
    "relatedOrder": "<optional>",
    "relatedStudent": "<optional>",
    "occurredAt": "2026-06-25T08:00:00.000Z",
    "remark": "学员小王 6 月报名费"
  }
  ```
- service 校验：
  - `amount > 0`
  - `reason.direction` 与 `type` 一致（income+in / expense+out；transfer 跳过）
  - `account` 存在且 `isActive=true`
- 写入：先 `FinanceTransaction.create()` 含 `balanceAfter`，再 `FinanceAccount.updateOne($inc balance + totalIncome/Expense + lastTransactionAt)` — **account-ledger 范式**

### 2.5 转账 — R-3414

- `POST /api/v1/finance/transactions/transfer`
- 权限：`finance.write`
- 请求体：
  ```json
  {
    "fromAccount": "<FinanceAccount._id>",
    "toAccount": "<FinanceAccount._id>",
    "amount": 2000,
    "reason": "<FinanceReason._id> (建议选"内部转账")",
    "occurredAt": "...",
    "remark": "微信 → 现金"
  }
  ```
- service 用 `mongoose.startSession() + session.withTransaction()` 同一 session 写 2 笔：
  - 笔 A (`from`)：type=transfer, direction=out, relatedTransferAccount=to, transferGroupId=G
  - 笔 B (`to`)：type=transfer, direction=in, relatedTransferAccount=from, transferGroupId=G
- 失败 abort

### 2.6 撤销流水（无端点）

财务岗**不删**流水。撤销流程：
- 写一笔反向流水（type 翻转 + 同金额）
- remark 写 "冲销 `<原 _id>`"
- 余额自动归零

---

## 3. 收支原因字典 `/finance/reasons`

### 3.1 字典列表 — R-3420

- `GET /api/v1/finance/reasons`
- 权限：`finance.read`
- 查询参数：`direction` (`in`/`out`)、`isActive`
- 响应：`{ data: Category[] }`（model='FinanceReason' 的全部，按 `sort asc, createdAt asc`）

### 3.2 新建字典 — R-3421

- `POST /api/v1/finance/reasons`
- 权限：`finance.write`
- 请求体：
  ```json
  {
    "name": "学员报名",
    "direction": "in",
    "category": "学费",
    "sort": 1
  }
  ```
- service 校验：`direction` 必填 (`in` / `out`)

### 3.3 更新字典 — R-3422

- `PUT /api/v1/finance/reasons/:id`
- 权限：`finance.write`
- 可改字段：`name/isActive/sort/code/direction/category`

### 3.4 删除字典 — R-3423 (中风险)

- `DELETE /api/v1/finance/reasons/:id`
- Auth：`requirePlatformPassword`（超管+二次密码）
- 互锁检查：`FinanceTransaction.countDocuments({reason: id}) === 0`，否则 422 + blockers

### 3.5 删除预检 — R-3424

- `GET /api/v1/finance/reasons/:id/removable-check`
- 权限：`finance.read`
- 响应：`{ data: { canRemove, blockers } }`

---

## 4. 数据模型字段速查

### FinanceAccount
- `org` (Org ref) / `name` (unique per org) / `type` (bank/wechat/alipay/cash/other)
- `bankName` / `accountHolder` / `accountNumberLast4` / `branch` (bank)
- `wechatId` (wechat) / `alipayId` (alipay) / `location` (cash)
- `isActive` / `isPrimary` (partial unique)
- `balance` / `totalIncome` / `totalExpense` / `lastTransactionAt`
- `createdBy` (User ref) / `remark` / `meta`

### FinanceTransaction
- `org` / `account` (必填) / `type` (income/expense/transfer) / `amount` (>0)
- `reason` (Category model='FinanceReason', 必填) / `relatedOrder` (可选) / `relatedStudent` (可选)
- `transferGroupId` (transfer 关联) / `relatedTransferAccount` (transfer 对端)
- `operator` (必填) / `occurredAt` / `balanceAfter` (写后快照) / `remark` / `meta`

### FinanceReason (复用 Category)
- `org` (per-org) / `name` (unique per org+model) / `meta.direction` (in/out, 必填) / `meta.category` (二级分类) / `isActive` / `sort`

详细 schema 与聚合管道见 [docs/claude/data-models-finance.md](../../../docs/claude/data-models-finance.md)。
