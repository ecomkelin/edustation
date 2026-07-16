# 数据模型 - 积分 / 宠物 / 喂养

> **何时读这个文件**：改积分账户、积分流水、宠物养成（多宠 / 领养 / 破壳 / 喂食 / 饿死 / 等级配置）、宠物 catalog（species / consumables）、积分发放 trigger 时读。
> **一行摘要**：积分 MVP（PointsAccount + PointsTransaction ledger） + Pet v3（多宠 + 无等阶 + 无装饰 + video-only + per-org 等级配置，2026-07-15 重构）。

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
| `operator` | ObjectId ref User | manual_* / admin 代喂食 时记录操作人；其他 trigger 可空 |
| `remark` | String | 自由文本 |
| `meta` | Mixed | 扩展位（trigger='pet' 时含 action='feed' + consumableKey） |

**关键设计**：
- 所有积分变动都走 ledger 条目，账户余额 = Σ amount。**不直接更新 PointsAccount.balance**
- `balanceAfter` 由 service 写入时原子计算，避免并发读到旧值

## 触发点（trigger）表

| trigger | direction | 状态 | 用途 |
|---------|-----------|------|------|
| `manual_earn` | +1 | **已落地** | 员工手动加 |
| `manual_deduct` | -1 | **已落地** | 员工手动扣 |
| `pet` | -1 | **已落地** | 喂食扣分（meta.action='feed'；2026-07-15 重构后仅 feed，删 swap） |
| `order_earn` / `attendance_earn` / `streak_earn` / `share_earn` / `birthday_earn` | +1 | stub | 待接 |
| `redemption` | -1 | stub | 商城兑换 |
| `refund` | 0 | stub | 冲正 |

> 详见 `shared/enums.js` 的 `PointsTrigger` / `POINTS_TRIGGER_DIRECTION`。

## 字典：PointsReason

`Category.model='PointsReason'` — 积分变动原因字典，per-org 隔离。

---

# 第二部分：宠物子系统（Pet v3，2026-07-15 重构）

> **2026-07-15 重构（从 Pet v2 → v3）**：删等阶 C/B/A/S、删装饰系统、宠物本体收敛为 video、
> 一个学生可领养多只宠物（**≤5**，2026-07-16 由 10 调为 5；首只为默认）、等级曲线改 per-org 后台可配置。
> 历史 v2（4 阶 + 6 槽装饰 + 1 学生 1 宠）设计已废弃，本文只描述 v3。

## 一、设计总览

### 1.1 model 概览

| model | 角色 | collection | 关系 |
|-------|------|------------|------|
| `PetAccount` | 业务实体：1 学生 = N 宠物（≤5） | `pet_accounts` | ref Student (1:N), org；`isDefault` partial-unique |
| `PetEvent` | 事件流：状态变更 / 代操作全审计 | `pet_events` | ref Student, PetAccount |
| `PetSpecies` | catalog：物种图鉴（video-only，无 tier） | `pet_species` | 平台级共享 |
| `PetConsumable` | catalog：食物 + 玩具（扁平数值，无 tier） | `pet_consumables` | 平台级共享 |
| `PetLevelConfig` | per-org 等级曲线配置 | `pet_level_configs` | ref Org (1:1) |

> **PetItem（装饰图鉴）已整体删除**。

### 1.2 核心抽象

- **1 学生 = N 宠物**（≤ `MAX_PETS_PER_STUDENT`=10）；恰好一只 `isDefault=true`
- **默认宠物**展示在：admin 课堂展示主图 / client 首页宠物卡 / client 详情页主图
- **其他宠物**展示在：admin 课堂展示「其他领养的宠物」网格 / client 详情页「其他宠物」区
- **状态机**：`egg → alive → (death→rebirth=egg 同 tick)`（去 tier 后无 tierup/swap/tierdown 回蛋）
- **无等阶**：所有宠物用同一套等级 / 经验 / 喂养数值
- **等级曲线 per-org**：`PetLevelConfig`（maxLevel 默认 12、expBase 100、expIncrement 50）；无记录时用 `shared/petConfig.DEFAULT_LEVEL_CONFIG` 兜底
- **species video-only**：`visualType` 固定 `video`（前端 9:16 裁成 1:1 展示）；`image`/`svg` 仅兜底渲染保留
- **PetAccount 存 species key 字符串**，不存 ObjectId
- **C 端 vs Admin**：C 端 `/api/v1/pet/*`（auth + activeStudent + requireEnrolledStudent）；Admin `/api/v1/admin/pet/*`（pet.read / pet.write）

---

## 二、数据结构

### 2.1 PetAccount

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, required, index | 多租户 |
| `student` | ObjectId ref Student, required, index | **不再 unique**（多宠） |
| `isDefault` | Boolean, default false | 默认宠物；每 student 恰好一只 true |
| `state` | enum egg/alive/dead, default egg | 状态机 |
| `stateChangedAt` | Date | |
| `eggAdoptedAt` / `eggHatchedAt` | Date | 蛋态时间戳 |
| `species` | String, nullable | 破壳锁定；死亡回蛋清空→重随机 |
| `level` | Number min1 default1 | |
| `experience` | Number min0 default0 | |
| `hatchedAt` | Date | |
| `adoptedAt` | Date | admin 列表展示 |
| `currentHunger` | Number 0-1000 default100 | 饱腹度 source of truth |
| `maxHunger` | Number default1000 | |
| `lastFedAt` / `lastHungerDecayAt` | Date | 死亡判定 / cron CAS |
| `deathThresholdDays` | Number default30 | hunger=0 后多少天未喂死亡 |
| `nickname` | String max32 | |
| `meta` | Mixed | |

**删除字段（相对 v2）**：`tier` / `eggTier` / `unlocked` / `equipped`。

**索引**：
- `{org, student}`（普通复合，非 unique）
- `{org, student, isDefault}` **partial unique** `where isDefault=true`（保证唯一默认）
- `{org, student, species}` **partial unique** `where species={$type:'string'}`（**2026-07-16 新增**：1 学生 + 1 species ≤ 1 只；蛋态 species=null 不参与）
- `{org, state, lastHungerDecayAt}`（cron 扫表）
- `{org, state}`（admin 列表）

### 2.2 PetEvent

`type` enum（v3）：`adopt` / `hatch` / `feed` / `levelup` / `death` / `rebirth` / `set_default` / `admin_override` / `admin_adopt` / `admin_feed` / `admin_hatch` / `admin_set_default` / `purchase_consumable` / **`abandon`** / **`admin_abandon`**（2026-07-16 新增：家长弃养 / admin 代弃养，物理删除 PetAccount 前写一条审计）。

> 删除：`tierup` / `tierdown` / `swap` / `equip` / `unequip` / `admin_swap` / `admin_tierdown` / `admin_tierup` / `admin_equip` / `purchase_item`。

`eventKey`（nullable, sparse unique）用于 death/rebirth 幂等；cursor 分页排序键 `{createdAt:-1, _id:-1}`。

### 2.3 PetSpecies（物种图鉴，平台级）

`key`(unique) / `name` / `visualType`(enum image/svg/video，**默认 video**) / `videoFile`(ref File) / `imageFile` / `svgContent`(兜底) / `weight`(破壳加权) / `hungerDecayMinutes`(default60) / `isActive` / 审计。

- **删 `tier` 字段** + `{tier,isActive}` 索引。
- `rollSpecies()` 在全部 `isActive` 池里加权随机（无 tier 分池）。

### 2.4 PetConsumable（食物 + 玩具，平台级）

`key`(unique) / `name` / `kind`(food/toy) / **`pointCost` / `hungerRestore` / `expGain`（扁平三字段）** / `visualType`(image/svg/video) / `imageFile` / `svgContent` / `videoFile` / `isActive` / 审计。

> 删 `applicableTier` + `perTier`（{C,B,A,S,all}）子文档。

### 2.5 PetLevelConfig（per-org 等级曲线，新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, unique | per-org 单例 |
| `maxLevel` | Number default 12 | 满级后经验封顶 |
| `expBase` | Number default 100 | 1→2 级所需经验 |
| `expIncrement` | Number default 50 | 每级增量 |
| `updatedBy` | ObjectId ref User | |

`expToNext(L) = expBase + expIncrement * (L-1)`（shared/petConfig.js）。无记录用 `DEFAULT_LEVEL_CONFIG` 兜底。

---

## 三、宠物规则

### 3.1 状态机（去 tier）

```
[adopt] → state=egg, level=1, exp=0, hunger=100
   │ hatch (0 积分, rollSpecies 全池随机)
   ▼
state=alive, species=locked, level=1, exp=0, hunger=INIT(300)
   │
   ├─ feed (扣积分 + exp+hunger; 升级到 maxLevel 封顶; 无升阶)
   └─ cron: hunger=0 且 daysSince(lastFedAt) ≥ deathThresholdDays
        → state=dead → 同 tick rebirth (state=egg, level=1, exp=0, hunger=max, species=null 重随机)
```

**关键不变量**：
- feed / hatch 都是 CAS（read → 计算 → findOneAndUpdate 带状态守卫）
- 升级 loop 到 `maxLevel` 封顶，满级 exp 清 0（进度条显示已满）；**无 tierup 回蛋**
- 死亡回蛋清 species，下次 hatch 全池重随机
- 多宠：每只独立，cron 按 alive 游标天然支持

### 3.2 喂食 + 积分

仅 `feed` 触发扣分（`petPoints.chargeForFeed`，`trigger='pet'`, `meta.action='feed'`）。破壳 / 升级 / 死亡 / 设默认 0 积分。
`buyConsumable` 委托 `pet.service.feed`（避免双重扣分）。

### 3.3 饥饿衰减 cron

`petCron.js`：1h tick + leaderElect；`resolveHungerDecayMinutes`（PetSpecies.hungerDecayMinutes 优先，默认 60）；CAS 衰减 + 单 tick 补偿；`dieAndRebirth` 去 `PET_TIER_CONFIG` 依赖，回蛋清 species。

### 3.4 同种唯一 + 弃养（2026-07-16）

**不变量**：1 学生 + 1 species ≤ 1 只（同种不能养两只）。强制通过 `PetAccount` 的 partial unique index `{org, student, species}` where `species={$type:'string'}`。

**破壳**：`pet.service.hatch` 在调用 `petCatalog.rollSpecies()` 时循环重抽，跳过该学员已养 species，最多 `MAX_PETS_PER_STUDENT` 次（5 次，2026-07-16 由 10 调为 5），仍冲突 → 422「运气太差，N 种都已养，请先弃养或换蛋」。

**弃养**（物理删除 PetAccount）：
- C 端 `POST /pet/:petId/abandon`（家长，2 道守门：activeStudent 监护人 + loadOwnedPet 三元组；无密码，前端走两步 modal 确认）
- admin 端 `DELETE /admin/pet/accounts/:id`（**§8.1 三重防护**：平台超管 + pet.write + requirePlatformPassword 二次密码 + removable-check 预检；写 PetEvent `admin_abandon` 审计）
- **最后一只挡板**：该学员总数 ≤ 1 → 422「最后一只不能弃养，请先领养新宠物」
- **isDefault 转移**：若弃养的是默认宠物，自动把剩余 `adoptedAt` 最早的一只提升为默认；没有剩余 → 该 student 退化为 0 只状态，下次 `ensureFirstPet` 重建
- **不退积分**（与 feed 扣分对称，弃养为用户主动放弃；保持积分账本纯净）
- 上 partial unique index 前必须先 dedupe：`pnpm db:seed:dedupe-pet-species`（干跑加 `--dry-run`）按 (org, student, species) 分组保留最早领养，其余 deleteOne + 写 `admin_abandon` reason='seed-dedupe' 审计

---

## 四、管理规则

### 4.1 权限码
`pet.read` / `pet.write`（不变）。C 端家长不需业务权限码。

### 4.2 Catalog + 配置 CRUD（`/admin/pet`）
- Species 6 端点（list/get/create/update/remove/removable-check）—— create/update/remove 需平台超管；remove 加密码。
- Consumables 6 端点 —— 同上。
- **PetLevelConfig**：`GET /admin/pet/level-config`（pet.read）/ `PUT /admin/pet/level-config`（pet.write，机构管理员即可改本机构）。
- **删除**：PetItem 全部 CRUD（R-2486~2491 DEPRECATED）。

删除互锁：Species → `PetAccount.species===key`；Consumable → 无。

### 4.3 PetAccount admin（`/admin/pet/accounts`）
- `list`（filter state / keyword；去 tier）
- `get` / `update`（白名单 nickname/currentHunger(0-1000)/lastFedAt/deathThresholdDays/state/level/experience/maxHunger；isDefault 走 set-default）
- `getByStudent`（课堂展示轮询）：返回 `{ pet:默认宠物, pets:[全部], recentEvents }`
- **`DELETE /admin/pet/accounts/:id`**（2026-07-16 弃养，§8.1 三重防护）
- **`GET /admin/pet/accounts/:id/removable-check`**（2026-07-16 弃养预检，pet.read 即可调）

### 4.4 老师 / admin 代操作
| 端点 | 行为 | 积分 |
|------|------|------|
| `POST /admin/pet/accounts` `{studentId}` | 代领养（可多只 ≤5） | 0 |
| `POST /admin/pet/accounts/:id/feed` `{consumableKey}` | 代喂食 | 扣学员积分（operator 记录） |
| `POST /admin/pet/accounts/:id/hatch` | 代破壳 | 0 |
| `POST /admin/pet/accounts/:id/set-default` | 代设默认 | 0 |
| `POST /admin/pet/grant-consumable` | 代买消耗品（立即喂） | 扣学员积分 |

> 删除：equip / swap-egg / tier-down / tier-up / grant-item 代操作。

### 4.5 课堂展示（`/class/pet-display?studentId=xxx`）
- 独立 `ClassroomLayout`，3s 轮询 `getByStudent`。
- 左主图 = 默认宠物 video（`PetEquipmentOverlay` 现仅渲染 species）；蛋态破壳动画保留。
- 右侧：exp / hunger 卡 + 食物 chip（扁平价格）+ **「其他领养的宠物」网格**（9:16 视频卡，设为默认 / 代破壳 / 领养）。
- 删：tier-badge、升阶 / 置换按钮、装饰 6 槽网格、背景槽。

---

## 五、前端

### Admin（packages/admin）
- `views/pet/PetAdmin.vue`（去 tier，加 默认列 + 设为默认）
- `views/pet/PetCatalogAdmin.vue`（**2026-07-15 合并**：3 个 catalog 页 → 单页 3 标签，菜单入口「系统管理→宠物管理」，icon `Notebook`）
  - `tabs/PetSpeciesTab.vue`（从原 PetSpeciesAdmin 平移，visualType 默认 video）
  - `tabs/PetConsumableTab.vue`（从原 PetConsumableAdmin 平移，扁平数值）
  - `tabs/PetLevelConfigTab.vue`（从原 PetLevelConfigAdmin 平移，去掉 h2 与容器页重复）
  - 旧路由 `/pet/species` `/pet/consumables` `/pet/level-config` 改为 `redirect: '/pet/catalog?tab=...'`，兼容历史书签
- `views/classroom/PetClassroomDisplay.vue`（其他宠物网格 **+ 弃养按钮 2026-07-16**）
- `components/Pet/PetEquipmentOverlay.vue`（退化为 species 渲染）、`GrantOnBehalfDialog.vue`（仅消耗品）
- **删**：`PetItemAdmin.vue` / `EquipOnBehalfDialog.vue` / `FeedOnBehalfDialog.vue` / `PetSpeciesAdmin.vue` / `PetConsumableAdmin.vue` / `PetLevelConfigAdmin.vue`（2026-07-15 合并到 PetCatalogAdmin）
- 菜单：拍平「系统管理→宠物管理」为单 leaf（icon `Notebook`）；学员组下「宠物等级配置」已删除（合并到 catalog 的 level-config tab）

### Client（packages/client, uni-app）
- `api/pet.js`：`me` / `list` / `adopt` / `:petId/hatch` / `:petId/feed` / `:petId/set-default` / `species` / `consumables`（删 items/equip/swapEgg/tierDown）
- `pages/pet/detail.vue`：默认宠物主图（9:16 裁 1:1 video）+ exp/hunger + 食物 chip + **其他宠物区（视频卡 + 领养）** + **弃养按钮 (2026-07-16, 副信息条 + 其他宠物卡都可见)**
- `pages/tabbar/index.vue`：首页宠物卡渲染默认宠物 video（去 tier-badge / 装备层 / 背景层）
- `utils/constants.js`：仅留 `PetState`/`PetStateLabel`/`PET_SPECIES_EMOJI`（删 PetTier*/PetSlot*）
- **删**：`pages/pet/equip.vue` / `pages/pet/hatch.vue`（占位页）

**9:16 视频裁 1:1 范式**（复用）：父 `aspect-ratio:1/1 + overflow:hidden`；video `position:absolute; top:50%; height:177.78%; transform:translateY(-50%); object-fit`（H5 加 `!important` 兜底）。

---

## 六、关键文件路径

**模型**：`models/PetAccount|PetSpecies|PetConsumable|PetEvent|PetLevelConfig.model.js`（PetItem 已删）
**Shared**：`shared/petConfig.js`（DEFAULT_LEVEL_CONFIG / MAX_PETS_PER_STUDENT / expToNext）、`shared/petSpecies.js`、`shared/enums.js`（Pet* enums）；`shared/petItems.js` 已删
**Service**：`modules/pet/{pet.service, petCatalog.service, petCatalog.admin.service, petCatalog.admin.controller/.routes, petCron, petShop.service/.controller/.routes, petPoints.helper, petEvent.service}`；`modules/petAdmin/{petAdmin.service/.controller/.routes}`；`petItems.service.js` 已删
**Seed**：`utils/petCatalogSeed.js`、`utils/_petCatalog/{index,species,consumables}.js`（items.js 已删）；`scripts/db/_seed-dedupe-pet-species.js`（2026-07-16 上同种唯一 index 前必跑；`pnpm db:seed:dedupe-pet-species`，支持 `--dry-run`）
