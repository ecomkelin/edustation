# 数据模型 - 积分 / 宠物 / 喂养

> **何时读这个文件**：改积分账户、积分流水、宠物养成、宠物 catalog（species/items/consumables）、积分发放 trigger、宠物装饰/食物/玩具规则 时读。
> **一行摘要**：积分 MVP（PointsAccount + PointsTransaction ledger 双向金额审计） + Pet v2 扩展（PetAccount 状态机 + PetEvent 事件流 + DB 化 catalog + admin CRUD + 老师代操作 + 课堂展示 polling）。

---

> 所有外键使用小写实体名（如 `student`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

---

# 第一部分：积分子系统

## PointsAccount（积分账户）

- `student`（Student ref, unique, 1:1）
- `balance`（Number — 当前可用积分；**禁止直接 $inc**，必须通过 recordTransaction）
- `lastTransactionAt`（Date — 最后一笔交易时间）

## PointsTransaction（积分流水 / ledger）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org | 多租户 |
| `student` | ObjectId ref Student | required, index |
| `trigger` | String enum | 业务触发来源，详见下方触发点表 |
| `amount` | Number | 正负值都允许；符号由 trigger 决定 |
| `balanceAfter` | Number | 写入时由 service 快照，**禁止应用层计算** |
| `reason` | String | reason 名（来自 Category 字典 `model='PointsReason'`），manual_*/refund 时必填 |
| `customReason` | String | 手动加/扣时 admin 自由文本，reason="__custom__" 时使用 |
| `refType` / `refId` | String / ObjectId | 业务引用（Order / PetAccount / 等） |
| `operator` | ObjectId ref User | manual_* 时记录操作人；其他 trigger 可空 |
| `remark` | String | 自由文本 |
| `meta` | Mixed | 扩展位（trigger='pet' 时含 action / consumableKey） |

**关键设计**：
- 所有积分变动都走 ledger 条目，账户余额 = Σ amount。**不直接更新 PointsAccount.balance**
- `balanceAfter` 由 service 写入时原子计算，避免并发读到旧值
- 反转场景（refund）允许 amount 任意符号，业务层校验

## 触发点（trigger）表

| trigger | direction | 状态 | 用途 |
|---------|-----------|------|------|
| `manual_earn` | +1 | **已落地** | 员工手动加 |
| `manual_deduct` | -1 | **已落地** | 员工手动扣 |
| `order_earn` | +1 | stub | 订单支付成功发积分 |
| `attendance_earn` | +1 | stub | 出勤奖励 |
| `streak_earn` | +1 | stub | 连续出勤奖励 |
| `share_earn` | +1 | stub | 分享得积分 |
| `birthday_earn` | +1 | stub | 生日奖励 |
| `pet` | -1 | **已落地**（喂食/置换扣分；meta.action 区分） |
| `redemption` | -1 | stub | 商城/抽奖/送礼等兑换（meta.redemptionType 区分具体品类） |
| `refund` | 0 | stub | 冲正（amount 任意符号） |

> 详见 `shared/enums.js` 的 `PointsTrigger` / `POINTS_TRIGGER_DIRECTION`。

## 字典：PointsReason

`Category.model='PointsReason'` — 积分变动原因字典，per-org 隔离。手动加/扣时 admin 必须选一个 reason（或填 customReason）。

---

# 第二部分：宠物子系统（Pet v2 + v2-ext，2026-06-21）

## 一、设计总览

### 1.1 5 个 model 概览

| model | 角色 | collection | 关系 |
|-------|------|------------|------|
| `PetAccount` | 业务实体：1 学生 = 1 宠物 | `pet_accounts` | ref Student (1:1 unique), org |
| `PetEvent` | 事件流：状态变更/代操作全审计 | `pet_events` | ref Student, PetAccount |
| `PetSpecies` | catalog：物种图鉴 | `pet_species` | 平台默认 + per-org override |
| `PetItem` | catalog：装饰图鉴 | `pet_items` | 平台默认 + per-org override |
| `PetConsumable` | catalog：食物+玩具图鉴 | `pet_consumables` | 平台默认 + per-org override |

### 1.2 核心抽象

- **1 学生 = 1 宠物**（`PetAccount` 1:1 with Student, unique 索引保证）
- **状态机**：`egg → alive → (death→rebirth=egg 同 tick)` — 玩家只感知 egg/alive
- **4 阶 C/B/A/S** 平衡"积分充裕度"差异：低频学生养得起 C（normal 喂食 5 积分），高频学生追 S（normal 100 积分）
- **PetAccount 存 key 字符串**（`species: 'cat_orange'`），**不存 ObjectId** — species 删除/重命名不影响已生成 PetAccount
- **catalog 双层**：`org=null` 平台默认 + `org=<id>` per-org 自定义（unique 索引自动允许共存）
- **缓存**：catalog 读走 `reportCache.withCache(key, loader, 5min TTL)`；写操作 `invalidateCatalogCache(orgId)`
- **审计**：状态变更写 PetEvent；积分变动走 PointsTransaction（仅 feed/swap 触发）
- **C 端 vs Admin**：C 端走 `/api/v1/pet/*`（auth + activeStudent + requireEnrolledStudent）；Admin 走 `/api/v1/admin/pet/*`（pet.read / pet.write）

---

## 二、数据结构

### 2.1 PetAccount（业务实体）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, required, index | 多租户 |
| `student` | ObjectId ref Student, required, **unique** | 1:1 |
| `state` | String enum `egg`/`alive`/`dead`, default `egg` | 状态机当前态 |
| `stateChangedAt` | Date | 当前态开始时间 |
| `eggTier` | String enum C/B/A/S, default `C` | 蛋态的阶 |
| `eggAdoptedAt` | Date | 本次蛋的开始时间 |
| `eggHatchedAt` | Date, nullable | 上次破壳时间 |
| `species` | String, nullable | 当前 species key（破壳锁定；升阶保留） |
| `tier` | String enum C/B/A/S, nullable | 当前阶（仅 alive） |
| `level` | Number, min 1, default 1 | 等级（升阶时重置 1） |
| `experience` | Number, min 0, default 0 | 经验（升阶时重置 0） |
| `hatchedAt` | Date, nullable | 本次破壳时间 |
| `adoptedAt` | Date | 首次创建时间（admin 列表展示用） |
| `currentHunger` | Number 0-100, default 100 | **饱腹度 source of truth** |
| `maxHunger` | Number min 1, default 100 | 满饱度 |
| `lastFedAt` | Date, nullable | 最后喂食时间（死亡判定） |
| `lastHungerDecayAt` | Date, nullable | 上次 cron 衰减落地时间（CAS 用） |
| `deathThresholdDays` | Number min 1, default 30 | 死亡阈值（per-org override 字段，未来 per-org 化） |
| `nickname` | String max 32, nullable | 宠物昵称 |
| `unlocked.hat` / `.scarf` / `.clothes` / `.accessory` / `.halo` / `.background` | [String] | 各 slot 已解锁 item key |
| `equipped.hat` / `.scarf` / `.clothes` / `.accessory` / `.halo` / `.background` | String or null | 各 slot 当前装备 key |
| `meta` | Mixed | 扩展位 |

**索引**：
- `{org, student}` unique
- `{org, state, lastHungerDecayAt}` — cron 扫表
- `{org, state}` — admin 列表

### 2.2 PetEvent（事件流）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, required, index | |
| `student` | ObjectId ref Student, required, index | 双引用便于按学员/按宠物查 |
| `petAccount` | ObjectId ref PetAccount, required, index | |
| `type` | String enum（18 种），required, index | 详见下表 |
| `payload` | Mixed, default `{}` | 每 type 独立 shape |
| `createdAt` | Date, default now | |

**索引**：
- `{org, student, createdAt: -1}` — 家长端事件流分页
- `{org, type, createdAt: -1}` — admin 端按 type 聚合
- `{petAccount, createdAt: -1}` — per-pet 详情

**18 种事件 type 与 payload shape**：

| type | 触发时机 | payload |
|------|----------|---------|
| `adopt` | 首次领养 | `{ initialTier, by: 'manual'\|'enrollment'\|'admin' }` |
| `hatch` | 破壳 | `{ tier, species, level, unlocked: [...] }` |
| `feed` | 喂食（业务） | `{ consumableKey, foodType, expGain, hungerBefore, hungerAfter, expBefore, expAfter, tier, level }` |
| `levelup` | 喂食触发的升级 | `{ fromLevel, toLevel, tier }` |
| `tierup` | 满级升阶 | `{ fromTier, toTier, species }` |
| `tierdown` | 主动降阶 | `{ fromTier, toTier, reason: 'manual', autoUnequipped: [...] }` |
| `swap` | 置换蛋 | `{ tier, cost, fromSpecies }` |
| `death` | cron 判定死亡 | `{ tier, hunger, daysAtZero, reason: 'hunger' }` |
| `rebirth` | 死→蛋（同一 tick） | `{ tier, fromDeath: true }` |
| `equip` | 装备 | `{ slot, itemKey, fromItemKey }` |
| `unequip` | 卸下（含 tierdown 自动卸） | `{ slot, itemKey, fromItemKey, reason? }` |
| `admin_override` | admin 字段调整 | `{ changes: [...], operator, reason }` |
| `admin_adopt` | **老师/admin 代领蛋**（ext） | `{ operator, by: 'admin', initialTier }` |
| `admin_feed` | **老师/admin 代喂食**（ext） | `{ operator, by: 'admin', consumableKey, ...feed payload }` |
| `admin_hatch` | **老师/admin 代破壳**（ext） | `{ operator, by: 'admin', tier, species }` |
| `admin_swap` | **老师/admin 代置换**（ext） | `{ operator, by: 'admin', tier, cost, fromSpecies }` |
| `admin_tierdown` | **老师/admin 代降阶**（ext） | `{ operator, by: 'admin', fromTier, toTier, autoUnequipped }` |
| `admin_equip` | **老师/admin 代换装**（ext） | `{ operator, by: 'admin', slot, itemKey, fromItemKey }` |

**关键不变量**：
- 升阶/降阶/破壳/死亡 0 积分，**不**写 PointsTransaction（避免污染积分看板）
- 业务事件（feed/tierup/swap 等）和 admin 代操作事件（admin_feed 等）通过 type 区分；与 points.transaction 的 `trigger='pet'` + `meta.action` 互不重叠
- 写 PetEvent 不阻塞主流程（`petEvent.recordEvent` 失败仅 log warn）

### 2.3 PetSpecies（物种图鉴，DB 化）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, **default null**, index | null=平台默认；非null=per-org |
| `key` | String, required, trim | 全局 key（如 `cat_orange`） |
| `name` | String max 64, required | 中文名 |
| `tier` | enum C/B/A/S, required, index | 破壳池分类 |
| `visualType` | enum `image`/`svg`, required | **不支持 html/css/js**（XSS） |
| `imageFile` | ObjectId ref File, nullable | visualType=image 时用 |
| `svgContent` | String max 50000, nullable | visualType=svg 时用（自动 sanitize） |
| `weight` | Number 0-10000, default 100 | 破壳加权随机权重（0=不参与抽取） |
| `isActive` | Boolean, default true, index | 软启用 |
| `description` | String max 500, nullable | |
| `meta` | Mixed | |
| `createdBy` / `updatedBy` | ObjectId ref User | 审计 |
| `createdAt` / `updatedAt` | Date | |

**索引**：
- `{org, key}` unique（null + key 全局唯一；同 org 下不重）
- `{org, tier, isActive}` — 列表查询

**破壳抽签规则**：
- `rollSpecies(tier)` 在 `listSpecies({tier, isActive:true})` 池子里加权随机
- 同阶 4 个 species 默认 weight=100（等概率）
- 池为空 → `null`（hatch 接口返 422）

### 2.4 PetItem（装饰图鉴，DB 化）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, default null, index | 同 species |
| `key` | String, required | e.g. `hat_party` |
| `name` | String max 64, required | |
| `slot` | enum `hat`/`scarf`/`clothes`/`accessory`/`halo`/`background`, required, index | 6 个槽位 |
| `unlockType` | enum `level`/`tier`, required | 升级解锁 / 升阶解锁 |
| `unlockTier` | enum C/B/A/S, nullable | unlockType=tier 时用（升 B 解锁 C+B 累积） |
| `unlockLevel` | Number 1-100, nullable | unlockType=level 时用 |
| `imageFile` | ObjectId ref File, nullable | 装饰贴图 |
| `compatibleSpecies` | [String], default [] | **宽松 UI 提示，equip 不强制校验**（D2 决策） |
| `isActive` | Boolean | |
| `description` / `meta` | 同 species | |

**索引**：
- `{org, key}` unique
- `{org, slot, isActive}` — 列表
- `{org, unlockType, unlockTier}` — 升阶时批量取

### 2.5 PetConsumable（食物+玩具，DB 化）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, default null, index | |
| `key` | String, required | e.g. `food_normal`、`toy_ball` |
| `name` | String max 64, required | |
| `kind` | enum `food`/`toy`, required, index | 食物 vs 玩具（玩具与食物同机制） |
| `applicableTier` | enum C/B/A/S/`all`, required | `all` 时 perTier 每阶独立；否则仅适用该阶 |
| `perTier` | Mixed subdoc | `{ C: {pointCost, hungerRestore, expGain}, B:..., A:..., S:..., all: {…} }` |
| `imageFile` | ObjectId ref File | 图标 |
| `isActive` / `description` / `meta` | 同 species | |

**索引**：
- `{org, key}` unique
- `{org, kind, isActive}` — 列表

**perTier schema**（每阶 config）：
```js
{ pointCost: 0-100000, hungerRestore: 0-100, expGain: 0-100000 }
```

---

## 三、宠物规则

### 3.1 阶表（4 阶 C/B/A/S 平衡"积分充裕度"）

来源：`shared/petConfig.js#PET_TIER_CONFIG`（平台硬编码，D5 决策）

| 阶 | maxLv | expFormula(L) | normal cost | premium cost | super cost | swapCost | decay/day | deathThresholdDays |
|---|-------|---------------|-------------|--------------|------------|----------|-----------|---------------------|
| C | 10 | 50 + L×20 | 5 积分 | 15 积分 | 40 积分 | 80 | 1 | 30 |
| B | 15 | 80 + L×30 | 15 | 40 | 100 | 200 | 1 | 25 |
| A | 20 | 120 + L×50 | 40 | 100 | 250 | 500 | 2 | 20 |
| S | 30 | 200 + L×80 | 100 | 250 | 600 | 1000 | 3 | 15 |

**喂食三档回报**（每阶 per foodType 独立数值，DB 存储在 `PetConsumable.perTier`）：

| 阶 | normal (exp/hunger) | premium (exp/hunger) | super (exp/hunger) |
|---|---------------------|----------------------|---------------------|
| C | 10/15 | 30/40 | 80/100 |
| B | 20/12 | 60/35 | 160/100 |
| A | 40/10 | 120/30 | 320/100 |
| S | 80/8 | 240/25 | 640/100 |

**设计原则**：
- C 阶喂养便宜（normal 5 积分）→ 积分少/学习频率低的学生养得起
- S 阶喂养昂贵（normal 100 积分）→ 积分多/学习频率高的学生有奔头
- 高阶衰减快 + 死亡阈值短 → 避免"养到 S 后躺平"

### 3.2 状态机

```
[adopt 触发] → [state=egg, eggTier=C, hunger=100, level=1, exp=0]
                │
                │ hatch (0 积分)
                ▼
[state=alive, tier=C, species=locked, level=1, exp=0, hunger=100]
                │
                ├─ feed (扣积分 + exp+hunger; 可能 levelup / tierup)
                │   ├─ levelup (单数级)
                │   └─ tierup: 满级 + exp ≥ tierUpThreshold
                │       → [state=egg, eggTier=B, level=1, exp=0, species=同前 D2, hunger=100]
                │       │ hatch
                │       └─► [state=alive, tier=B, species=同前, ...]
                │
                ├─ tier-down (玩家主动, 0 积分; unlocked 保留, equipped 超 cap 自动卸)
                │   → [state=egg, eggTier=target, level=1, exp=0, species=同前, unlocked 保留]
                │
                ├─ swap-egg (扣积分, 保留当前 tier)
                │   → [state=egg, eggTier=current, level=1, exp=0, species=null]
                │       │ hatch
                │       └─► [state=alive, tier=current, species=重新随机]
                │
                └─ cron: currentHunger=0 + daysSince(lastFedAt) ≥ deathThresholdDays
                    → [state=dead] → 同一 tick rebirth (state=egg, level=1, exp=0,
                      hunger=maxHunger, lastFedAt=null, species 同前, unlocked 保留)
```

**关键不变量**（service 层必须保证）：
- `(state='alive') ⇒ (experience < expToNext(level, tier))` — 升阶后强制重置
- 满级升阶在 feed 事务内级联完成 — 不存在"满级未升阶"窗口
- `tierdown` 是原子的单次 `$set`
- `species` 在 `state=egg` 仍存在时 `hatch` 不再随机（D2：升阶保留 species）
- 死亡→rebirth 必须在同一 cron tick 完成（玩家 UI 永远只看到 alive/egg）
- `currentHunger` 是 source of truth；read 路径不再二次计算（D1）

### 3.3 装饰解锁规则（D3 决策）

**升级解锁**（unlockType=level, 适用 hat/scarf/clothes/accessory）：
- 条件：`item.unlockTier ≤ pet.tier` 且 `item.unlockLevel ≤ pet.level`
- 触发：feed 触发的 levelup 自动 join 到 `unlocked[slot]`
- 跨阶限制：高阶 item（如 unlockTier=A）不能通过低阶 level 强行解锁

**升阶解锁**（unlockType=tier, 适用 halo/background）：
- 条件：`item.unlockTier == pet.tier`（升 B 时解锁 B 阶所有 halo/background）
- 触发：feed 触发的 tierup 自动 join 到 `unlocked[slot]`
- **不自动装备**（D4 决策）— 玩家去换装页自选

**降阶时（D3 决策）**：
- `unlocked` **全部保留**（玩家资产不丢）
- `equipped` 中**超新阶 cap** 的（即 `item.unlockTier > targetTier`）**自动卸下**
- 卸下事件写 PetEvent `unequip` payload 含 `reason: 'tierdown_cap'`

**equip 校验**：
- `item.slot` 必须等于请求 slot
- `itemKey` 必须 ∈ `pet.unlocked[slot]`
- `compatibleSpecies` **不校验**（D2：宽松 UI 提示）
- 卸下（itemKey=null）总是允许

### 3.4 饥饿衰减 cron（D1 决策）

源码：`packages/server/src/modules/pet/petCron.js`，参照 `setInterval+unref` 模式（参考 `captcha.service`）。

**核心机制**：
- 间隔：1h（`setInterval(..., 3600000).unref()`）
- 读路径**不**计算饥饿度（`currentHunger` 是持久化字段）
- 所有写者（cron 衰减 / feed 加成 / admin 调整）用 **CAS**：
  ```js
  findOneAndUpdate({_id, state, currentHunger: oldVal, lastHungerDecayAt: oldVal},
                   {$set: {currentHunger: newVal, lastHungerDecayAt: now}}, {new: true})
  ```
- CAS 失败 retry 1 次；连续失败 log 告警，不阻塞

**单 tick 补偿（K8s 丢 tick 应对）**：
- 每次 sweep 算 `elapsedHours = floor((now - lastHungerDecayAt) / 1h)`
- 按"自上次以来累积的小时数"扣 hunger → 丢 1 tick = 1h 衰减未扣，可接受
- 不用"按 tick 增量"（会累积漂移）

**死亡判定**：
- `currentHunger === 0 && (now - lastFedAt) ≥ deathThresholdDays` → 死亡
- 同一 `dieAndRebirth()` 函数里：写 `death` PetEvent → CAS 翻 state=egg → 写 `rebirth` PetEvent
- **可观察状态 = egg**（dead 是瞬间态，玩家几乎不可见）

**阶梯衰减速率**（`petConfig[tier].decayPerDay`）：
- C: 1/天，30 天死亡
- B: 1/天，25 天死亡
- A: 2/天，20 天死亡
- S: 3/天，15 天死亡（越高越难养）

### 3.5 积分扣减规则（与 PointsTransaction 联动）

仅 `feed` / `swap-egg` 触发扣分；其他动作（hatch / tierup / tierdown / death / rebirth）**0 积分**，不写 PointsTransaction。

```
feed:    points.recordTransaction({ trigger: 'pet', amount: -perTierConfig.pointCost,
                                    refType: 'PetAccount', refId: pet._id,
                                    operator: by==='admin' ? adminId : null,
                                    meta: { action: 'feed', consumableKey, expGain, hungerGain } })
swap:    points.recordTransaction({ trigger: 'pet', amount: -petConfig.swapCost, ...,
                                    meta: { action: 'swap_egg' } })
```

`points.recordTransaction` 已含：
- balance CAS 原子更新
- balanceAfter 快照
- 流水记录（PointsTransaction）
- `invalidateReportCache(orgId)` 报告缓存失效

**不在 PetEvent 写积分**（业务事件流独立于积分账本，避免污染积分看板）。

---

## 四、管理规则

### 4.1 三层角色 + 权限码

| 角色 | 端点 | 权限码 | 关键行为 |
|------|------|--------|----------|
| 家长（C 端） | `/api/v1/pet/*` | 仅 auth + activeStudent + requireEnrolledStudent | 不需要业务权限码（业务权限码已隐含在 enroll 关系里） |
| Admin | `/api/v1/admin/pet/accounts/*`、`/admin/pet/species`、`/admin/pet/items`、`/admin/pet/consumables` | pet.read / pet.write | 详见下方各场景 |
| 老师/教务（业务岗） | 同 Admin | pet.write | 复用 Admin 端点（**不**单独搞"老师代操作"端点） |

**权限码 4 处同步**（参照 [[position-dual-hardcode-pitfall]]）— 本模块已落地：
- `shared/permissions.json`（`pet` group：`pet.read` + `pet.write`）
- `DEFAULT_POSITIONS`（管理员 + 教务已加 pet.write）
- `startupMigrations.addPetWritePermToExistingPositions`（已有机构补码，幂等）
- Admin 端路由 `mws.requirePermission('pet.write')` 硬门

### 4.2 平台超管 vs 机构 admin 权限

- **平台超管**（isPlatformAdmin）：全部 catalog CRUD（平台默认 + 任何 org）；可改 `org=null` 记录
- **机构 admin**（org 内 管理员/教务 with pet.write）：仅能 CRUD 自己 org 的 catalog；**不能改 org=null 平台默认**（service 内 hard check `if (!doc.org || String(doc.org) !== String(orgId))`）

### 4.3 Catalog CRUD 管理规则

每个 catalog（species/items/consumables）共 6 端点：
- `GET /` — list（filter: tier/slot/kind + isActive + keyword）
- `POST /` — create（写 audit；imageFile 走 `fileBind.diffSingleById`）
- `GET /:id` — detail
- `PUT /:id` — update（白名单字段；imageFile 变更走 `fileBind.diffSingleById`）
- `DELETE /:id` — remove（**requirePlatformPassword** 高风险删除）
- `GET /:id/removable-check` — 预检（pet.read 即可调）

**删除互锁 usageChecks**（`removable.assertUnused`）：

| catalog | usageChecks | 原因 |
|---------|-------------|------|
| PetSpecies | `PetAccount.species === key` | 删后历史宠物 speciesRecord 渲染 fallback 🐾 |
| PetItem | `PetAccount.unlocked 数组包含 key` | 删后历史解锁失效（玩家资产丢失） |
| PetConsumable | （空） | 无强引用；历史消费由 PetEvent 流水审计 |

**不查 `PetAccount.equipped`**：equipped 是临时状态，删 item 时 equipped=null 即可，无需挡。

**前端删除流程**（参照 `DestructiveConfirm` 模式）：
1. 用户点删除 → 调 `removable-check` 预检
2. `canRemove=false` → 弹挡板（blockers 列表）→ 不进入密码输入
3. `canRemove=true` → 弹密码输入（ElMessageBox.prompt）→ 调 DELETE 带 password
4. 失败兜底：`handleRemoveError(err, '无法删除 · 中风险', target)` 还原挡板

### 4.4 PetAccount CRUD 管理规则

- `GET /admin/pet/accounts` — list（filter: state/tier/keyword + 分页）
- `GET /admin/pet/accounts/:id` — detail（带最近 20 条事件）
- `GET /admin/pet/accounts-by-student?studentId=xxx` — 按学员查（课堂展示用）
- `PUT /admin/pet/accounts/:id` — 字段调整（白名单：nickname / currentHunger / lastFedAt / deathThresholdDays / state / level / experience / maxHunger）
- `GET /admin/pet/events` — 事件流分页（filter: petAccountId/studentId/type）

**不允许 admin 改的字段**：`org` / `student` / `adoptedAt` / `species` / `tier`（结构性字段走专门流程）

### 4.5 老师/admin 代操作 6 端点

| 端点 | body | 行为 | 积分 |
|------|------|------|------|
| `POST /admin/pet/accounts` | `{ studentId }` | adopt on behalf | 0 |
| `POST /admin/pet/accounts/:id/feed` | `{ consumableKey }` | feed on behalf | 扣学员积分（operatorId 记录） |
| `POST /admin/pet/accounts/:id/hatch` | `{}` | hatch on behalf | 0 |
| `POST /admin/pet/accounts/:id/swap-egg` | `{}` | swap on behalf | 扣学员积分 |
| `POST /admin/pet/accounts/:id/tier-down` | `{ targetTier }` | tier-down on behalf | 0 |
| `POST /admin/pet/accounts/:id/equip` | `{ slot, itemKey }` | equip on behalf | 0 |

**所有代操作写 PetEvent `admin_*` type**（与业务事件 type 区分审计）：
- `pet.service.feed(...,by='admin')` 内部写 type='admin_feed'
- `petAdmin.service.feedOnBehalf` 额外 update 一次把 `payload.operator` 注入（因 service 内部不知道 operatorId）

**关键业务规则**：
- 代喂食 / 代置换会**真扣学员积分**（走 points.recordTransaction，operatorId 记为 admin）
- 代领蛋（学员无 PetAccount 时）→ state=egg 兜底
- 代降阶 0 积分；species 保留；unlocked 保留；equipped 超 cap 自动卸
- 老师代操作**不**绕过 requireEnrolledStudent（学员必须已报 1 个班才能喂食/破壳）— 但实际场景多在课上（学生肯定已报班），未报班场景暂不处理

### 4.6 课堂展示（classroom display）

**路由**：`/class/pet-display?studentId=xxx`（顶级路由，独立 ClassroomLayout）

**Layout 策略**：
- `ClassroomLayout.vue` 独立组件（无 sidebar/header/padding，深色背景）
- 路由表（`router/index.js`）把 `/class` 单独挂 ClassroomLayout，不进 DefaultLayout

**行为**：
- 初始：调 `petAdminApi.getByStudent(studentId)` 拉详情
- 轮询：每 3s 调一次 `getByStudent`（admin 端不走 cache，因为 per-pet detail 实时性要求高）
- 操作：调代操作 API，成功后立即 refresh
- 关闭：`window.close()`（window.open 打开时）兜底 `history.back()`

**polling 实现**（admin 第一个 polling 页面）：
```js
const pollTimer = ref(null)
onMounted(async () => {
  await fetchOnce()
  pollTimer.value = setInterval(fetchOnce, 3000)
})
onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
})
```

**展示内容**：
- 顶栏：学员名 + 阶徽章 + 等级 + 状态 tag + 实时同步指示器（脉冲点）
- 主体：左大图（image/SVG/emoji fallback）+ 右数据（exp 进度 / hunger 进度 / 6 装备槽网格）
- 操作：喂食 / 破壳 / 置换 / 降阶（按 pet.write 权限）
- 底部：最近 10 条事件表

### 4.7 Admin UI 菜单结构

```
学员与订单
├─ 学生管理
├─ 学生课包
├─ 学生作品
├─ 订单
├─ 积分管理
├─ 宠物实例           (perm: pet.read)
├─ 宠物图鉴           (perm: pet.write, 新)
├─ 装饰图鉴           (perm: pet.write, 新)
└─ 食物玩具           (perm: pet.write, 新)

课堂展示              (新分组, 2026-06-21)
└─ 宠物课堂展示       (perm: pet.read)
```

---

## 五、C 端 vs Admin 端差异

| 维度 | C 端（家长） | Admin 端 |
|------|--------------|----------|
| 路径 | `/api/v1/pet/*` | `/api/v1/admin/pet/*` |
| 中间件 | `authenticate` → `requireOrg` → `activeStudent` → (写) `requireEnrolledStudent` | `authenticate` → `requireOrg` → `requirePermission` |
| 权限 | 仅 auth + activeStudent | pet.read / pet.write |
| 代操作 | 不允许 | 6 端点（adopt/feed/hatch/swap/tierdown/equip） |
| Catalog CRUD | 仅 GET（listCatalog/listSpecies） | 完整 CRUD |
| 视图 | 玩家视角（自己的宠物） | 机构视角（全量宠物 + 工具） |

---

## 六、客户端（uni-app）规则

C 端家长通过 uni-app（微信小程序 / H5 / App）访问：
- `/pages/tabbar/pet.vue` — 主页（三态：egg / alive / dead）
- `/pages/pet/equip.vue` — 换装页（6 slot 网格）
- `/pages/pet/hatch.vue` — 破壳动画页
- `stores/pet.js` — Pinia store
- `api/pet.js` — REST 客户端
- `utils/constants.js` — PetTier/PetState/FoodType/PetSlot + species emoji fallback map

**feed 接口兼容**：`POST /pet/feed` body 接受 `consumableKey`（新）或 `foodType`（v1 兼容，自动映射为 `food_<type>`）

**视觉渲染**：
- `speciesRecord.visualType === 'image'` → `<img :src="imageFile.url">`
- `speciesRecord.visualType === 'svg'` → `v-html="svgContent"`（已 sanitize）
- `speciesRecord` 不存在或 key 找不到 → emoji fallback（`PET_SPECIES_EMOJI` map）

---

## 七、明确未做（含原因 + 何时做）

> 这一节列**所有**"未做"项 — 包括 MVP 故意省略的（明确不做）和未来规划但当前不做的。  
> 目的：让未来 CC 接手时一眼知道边界，不用瞎猜业务意图。

### 7.1 视觉相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 1 | `visualType='html'` 支持 HTML/CSS/JS 渲染 | **XSS 风险极高**：admin 写任意 HTML 会被 v-html 直接执行；即使 sanitize 也难防 dom clobbering / mutation XSS | 仅当业务强需求（如交互式动画宠物）。落地步骤：visualType='component' + 存白名单 Vue 组件名 + 服务端校验白名单 |
| 2 | species/items 动效（Lottie / 序列帧） | 当前 visualType 仅 image / svg，机构 admin 教学场景不需要 | SaaS 推广到 200+ 机构、客户要求更炫的"炫技"宠物时做；动效资源走 File 扩展 scope='pet-animation' |
| 3 | 物种故事/图鉴页（C 端"我的图鉴收集进度"） | 业务上 catalog 是给 admin 管的图鉴，不是玩家收集系统 | 阶段 4+（AI 与实时）；或商业化"宠物图鉴集邮"功能时 |

### 7.2 装饰相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 4 | `compatibleSpecies` 严格校验 equip | **D2 决策**（已落定）：宽松 UI 提示不强制 — 装饰是"通用资产"，跨物种装备是"风格搭配"，不挡玩家创意 | 业务方要求"独角兽专属装备"营销点时改 strict 模式（schema 加 strict 字段） |
| 5 | 装饰商城（用积分购买未解锁 item） | MVP 装饰走"解锁即拥有"模型（不消耗积分），与积分经济解耦 | v3 商业化时做：加 PetItemOwnership 表 + 商品上架流 + 兑换扣分（trigger='redemption'） |
| 6 | 装饰染色 / 皮肤变体 | 当前每件 item 只有 1 张图 | 商业化"个性化"时做：加 `colorVariants: [String]` 字段，前端用 CSS filter 或上传变体图 |
| 7 | 限时装饰（节日限定） | 当前所有装饰永久可解锁 | 运营活动需要时做：加 `availableFrom` / `availableTo` Date 字段，service 过滤 |

### 7.3 宠物行为/养成相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 8 | 玩具新维度"心情值"（`mood` 字段） | **D3 决策**（已落定）：玩具与食物同机制（pointCost + hungerRestore + expGain），不引入新维度 | 业务反馈"玩具应该区别于食物"时再做：加 PetAccount.mood + cron 衰减 + 新 PetEvent type='mood_decay' |
| 9 | 宠物改名（独立 UI 入口） | MVP 改名走 admin `update` 白名单字段；C 端未单独做 UI | 客户反馈"玩家想给自己宠物起名"时加 `POST /pet/rename` 端点 + UI 入口 |
| 10 | 宠物繁殖 / 生蛋（两只宠物交配） | 业务上 1 学生 = 1 宠物模型未设计多宠；繁殖会破坏当前 unique 索引 | SaaS 商业化大版本（v4+）重新设计多宠模型时 |
| 11 | 宠物学习技能（额外加 buff 到 LessonAttendance） | 业务上"宠物 → 学习"的因果关系未设计；当前宠物纯娱乐 | 业务方想用宠物激励学习行为时做：加 `petBuff: {attendanceExpMultiplier, pointsMultiplier}` 字段 |
| 12 | 宠物病 / 治疗机制 | 当前死亡是饥饿阈值的 hard 失败，无中间态 | 客户反馈"宠物死太突然"时做：加 `state='sick'` 中间态 + 治疗消耗积分 |

### 7.4 教学/展示相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 13 | 课堂展示 SSE 推送 | 当前 3s polling 够用（用户在教室看 1-2 个学生，server 压力小） | 老师端同时打开 >5 个课堂页（多班对比场景）时做 SSE：单连接 push 状态变更事件，省 server 反复读 DB |
| 14 | 大屏/投影模式（4K / 16:9 适配） | 当前 classroom 布局是普通 16:9；分辨率自适应 OK | 客户买 4K 投影仪（教育装备升级）时做：CSS 媒体查询 + 大字号主题 |
| 15 | 课堂展示"全屏切换"快捷键（F11） | 当前按钮 [关闭] 即可；F11 是浏览器原生 | 老师反馈"上课时找不到关闭按钮"时做 keydown 监听 |
| 16 | 课堂展示"录屏 / 截图" | 教育场景可能有"宠物成长记录"需求 | 阶段 4+：加 screenshot API 或前端 html2canvas |
| 17 | 课堂展示多学生对比视图 | 当前单学生；多生对比是营销/竞争场景 | 机构校长要求"班级 PK"时做：多学生网格 + 排行榜 |

### 7.5 通知/通讯相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 18 | 宠物死亡/饥饿推送通知 | MVP 用客户端下次打开 dialog 提示（PetEvent 留痕） | 商业化 v3：加 WebSocket / 微信公众号模板消息 |
| 19 | 升阶/破壳庆祝动画 | 当前客户端只有基础动画（`hatch.vue` 的破壳动效） | 商业化"成就感"体验时做：全屏动效 + 音效 + 分享海报 |
| 20 | 微信分享裂变（带宠物皮肤） | v1 阶段 2 有"分享得积分"占位，未实装宠物皮肤 | 阶段 3 商用强化时做：海报模板 + 宠物 skin 分享图 |

### 7.6 商业化相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 21 | 宠物商城（用积分/RMB 买装饰/食物） | MVP 装饰走"解锁即拥有"模型，不与积分经济挂钩 | v3 商业化大版本（营利模式确立后） |
| 22 | VIP 专属宠物 / 皮肤 | 业务上无 VIP 等级分层 | 阶段 3：加 VIP 系统后做 |
| 23 | 跨机构宠物市场（机构 A 卖给机构 B） | SaaS 多租户原则禁止跨机构资源 | 不做（违反 SaaS 隔离原则） |
| 24 | 宠物保险（复活币付费购买） | 当前死亡自动回蛋，0 积分；复活币会让死亡"无成本" | 商业化"免广告复活"等场景才做 |

### 7.7 数据/治理相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 25 | `per-org 阈值可调`（deathThresholdDays、feedCost） | **D5 决策**（已落定）：MVP 平台硬编码 `shared/petConfig.js` | 多机构规模化、SaaS 商业模式确立后做：加 `SiteConfig.in5` 字段，service 查表代替 hardcode |
| 26 | 平台默认 catalog 在线编辑（不需重跑 seed） | 当前 `org=null` 记录由 seed 写一次；admin 改后再跑 seed 不会覆盖 | 当前已经支持（service 不挡 `org=null` 写 — 仅挡非 super-admin）；超管在线编辑即可，无需技术改动 |
| 27 | PetEvent 冷归档（>6 月迁冷存储） | 数据量小（平均每学生每天 0.1 事件） | 数据量 >10M 事件 / 月时做 MongoDB Time Series Collection 或定期 export |
| 28 | 宠物数据导出/导入（家长换手机） | 当前 PetAccount 绑 student，跨设备自动同步（auth 后取） | 客户要求"单机版"时做（offline-first） |

### 7.8 测试/质量相关

| # | 项 | 不做原因 | 何时做 |
|---|----|----------|--------|
| 29 | `pet.service.feed` 满级升阶级联单测 | 单元测试覆盖率在 SaaS 早期不是瓶颈（手动 E2E 覆盖） | 项目过稳定期（v2+）后做：jest + mongodb-memory-server |
| 30 | `petCron` death→rebirth 同 tick 单测 | 同上 | 同上 |
| 31 | Admin UI 组件级测试（Vitest + @vue/test-utils） | 当前用手动 E2E + 关键路径手测 | 重构 / 大改时加 regression 测试 |
| 32 | E2E 自动化（Playwright） | 投入产出比低（SaaS 早期） | 阶段 3 商用强化（多客户验收）时做 |

---

## 八、相关记忆参考

- [[pet-system-v2-design]] — v1 设计（状态机 + 阶表）
- [[pet-hunger-cron-pattern]] — cron 写 + CAS + 单 tick 补偿
- [[pet-catalog-db-migration]] — v2-ext DB 化经验（catalog + 代操作 + 课堂展示）
- [[category-tenant-split]] — per-org 字典模式参考
- [[report-cache-key-bucket-bug]] — `withCache` key 必须 orgId 开头
- [[position-dual-hardcode-pitfall]] — 4 处权限码同步
- [[report-permission-rollout]] — 新权限码同步报告模块
- [[http-interceptor-unpack-pitfall]] — admin api 调用 .data 不要再 .data
- [[mongoose-collection-name-pitfall]] — 新 model collection 名确认

---

## 九、关键文件路径

**模型**：
- `packages/server/src/models/PetAccount.model.js`
- `packages/server/src/models/PetEvent.model.js`
- `packages/server/src/models/PetSpecies.model.js`
- `packages/server/src/models/PetItem.model.js`
- `packages/server/src/models/PetConsumable.model.js`

**Shared 静态**（deprecated，仅作 seed 源 + dev 兜底）：
- `shared/petConfig.js` — 阶表 + 喂食回报（D5 平台硬编码）
- `shared/petSpecies.js` — 物种图鉴（16 个）— DEPRECATED
- `shared/petItems.js` — 装饰图鉴（35 个）— DEPRECATED
- `shared/_petCatalogSeed.js` — seed 数据（从 deprecated 抽出来）
- `shared/enums.js` — PetTier / PetState / PetEventType / PetVisualType / PetItemUnlockType / PetConsumableKind / PetConsumableApplicableTier / PetItemSlot

**Service**：
- `packages/server/src/modules/pet/pet.service.js` — 核心（adopt/hatch/feed/swap/tierdown/getMine/decoratePet/listEvents）
- `packages/server/src/modules/pet/petItems.service.js` — 装饰（listCatalog/equip/listAllCatalog）
- `packages/server/src/modules/pet/petPoints.helper.js` — 积分扣减
- `packages/server/src/modules/pet/petEvent.service.js` — 事件流
- `packages/server/src/modules/pet/petCatalog.service.js` — DB 读 + 缓存（v2-ext）
- `packages/server/src/modules/pet/petCatalog.admin.service.js` — admin CRUD（v2-ext）
- `packages/server/src/modules/pet/petCatalog.admin.controller.js` / `.routes.js`
- `packages/server/src/modules/pet/petCron.js` — 饥饿衰减 cron
- `packages/server/src/modules/petAdmin/petAdmin.service.js` — admin 业务（list/get/update/listEvents + 6 代操作 + getByStudent）
- `packages/server/src/modules/petAdmin/petAdmin.controller.js` / `.routes.js`

**中间件**：
- `packages/server/src/middlewares/requireEnrolledStudent.js`

**前端**：
- 客户端：`packages/client/src/{api/pet.js, stores/pet.js, pages/tabbar/pet.vue, pages/pet/equip.vue, pages/pet/hatch.vue, utils/constants.js}`
- Admin：`packages/admin/src/{api/pet.js, api/petCatalog.js, views/pet/PetAdmin.vue, views/pet/PetSpeciesAdmin.vue, views/pet/PetItemAdmin.vue, views/pet/PetConsumableAdmin.vue, views/pet/PetDetailDialog.vue, components/Pet/PetPanelDialog.vue, components/Pet/FeedOnBehalfDialog.vue, composables/useUserPerms.js, layouts/ClassroomLayout.vue, views/classroom/PetClassroomDisplay.vue}`

**启动**：
- `packages/server/src/utils/startupMigrations.js` — `seedPetCatalog`（migration #10）

**API 文档**：
- `packages/server/src/modules/pet/api.desc.md`
