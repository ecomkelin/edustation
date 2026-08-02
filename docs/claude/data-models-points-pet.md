# 数据模型 - 积分 / 宠物 / 喂养

> **何时读这个文件**：改积分账户、积分流水、宠物养成（多宠 / 领养 / 破壳 / 喂食 / 饿死 / 等级配置）、宠物 catalog（species / consumables）、积分发放 trigger 时读。
> **一行摘要**：积分 MVP（PointsAccount + PointsTransaction ledger） + Pet v3（多宠 + 无等阶 + 无装饰 + svg/video + per-org 经验曲线含逐级覆盖 + 增量锁定 300 + per-species 最高等级由 levelVisuals 列表派生 + per-level 升级特效（瞬时事件 video/svg） + 蛋态视觉复用 species 本体字段 2026-07-15 重构 / 2026-07-16 删 image + maxLevel 迁 species + 经验曲线逐级手填 + expIncrement 锁常量 / 2026-07-18 删 PetSpecies.maxLevel 字段 / 2026-07-18 DEFAULT_SPECIES_MAX_LEVEL 从 12 改为 1 / 2026-07-18 第四期 加 levelUpEffect 升级特效 + pet.service.feed 返 levelUpEffects[] + C 端/admin 课堂展示串行播放 / 2026-07-18 第五期 蛋态底层 = species 本体视觉字段 + emoji 缩左上角半透明 overlay)。

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
- **最高等级 per-species**（2026-07-16 → 2026-07-18 字段删除 → 2026-07-18 第三期）：由 `PetSpecies.levelVisuals[]` 数组派生（`max(levelVisuals[].level)`），空数组时 fallback `shared/petConfig.DEFAULT_SPECIES_MAX_LEVEL=1`（**蛋态默认**：没配任何 levelVisuals → 物种最高 1 级，不能升级；必须显式配置 ≥2 条才能让宠物升到 ≥2 级）；经验曲线 per-org 统一管理（`PetLevelConfig` expBase/expIncrement）
- **等级曲线 per-org**：`PetLevelConfig`（expBase 100、expIncrement 50）；无记录时用 `shared/petConfig.DEFAULT_LEVEL_CONFIG` 兜底
- **species svg/video**（2026-07-16 删 image）：`visualType` 默认 `video`（前端 9:16 裁成 1:1 展示）；`svg` 保留兜底渲染
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

`key`(unique) / `name` / `visualType`(enum **svg/video**，默认 video；2026-07-16 删 image) / `videoFile`(ref File) / `svgContent`(兜底) / **`levelVisuals`(逐级形象覆盖，最高等级 = `max(levelVisuals[].level)`，空数组 → 1 兜底即"蛋态默认"；详见 §3.5)** / `weight`(破壳加权) / `hungerDecayMinutes`(default60) / `isActive` / 审计。

- **删 `tier` 字段** + `{tier,isActive}` 索引。
- **2026-07-16 删 `image` 视觉类型 + `imageFile` 字段**（宠物图鉴/消耗品不再支持上传图片，svg 保留）。
- **2026-07-16 新增 `levelVisuals[]`**：per-species 逐级形象覆盖（详见 §3.5）。fallback 链 `levelVisuals[level] → levelVisuals[level-1] → ... → 物种视觉字段`。
- **2026-07-18 删 `maxLevel` 字段**：最高等级完全由 `levelVisuals[].max(level)` 派生（`shared/petConfig.resolveMaxLevel`），字段冗余；空数组 fallback `DEFAULT_SPECIES_MAX_LEVEL=1`（**蛋态默认**，2026-07-18 第三期由 12 改 1）。原 per-org PetLevelConfig 已迁出后再删字段 — 保持数据一致。
- **2026-07-18 第四期 新增 `levelVisuals[L].levelUpEffect`**：per-level **升级特效**（瞬时事件 video/svg），与形象（持续循环）严格区分；详见 §3.5。
- `rollSpecies()` 在全部 `isActive` 池里加权随机（无 tier 分池）。

**索引**：
- `{'levelVisuals.level'}` **partial unique** `where 'levelVisuals.0'={$exists:true}`（**2026-07-16 新增**：同物种内每条 `levelVisuals[].level` 必须唯一；空数组物种不参与索引）

### 2.4 PetConsumable（食物 + 玩具，平台级）

`key`(unique) / `name` / `kind`(food/toy) / **`pointCost` / `hungerRestore` / `expGain`（扁平三字段）** / `visualType`(**svg/video**，默认 svg；2026-07-16 删 image) / `svgContent` / `videoFile` / `isActive` / **`ownerSpecies`（2026-07-21 v4 新增，[] 数组）** / 审计。

**ownerSpecies 字段**（2026-07-21 v4）：
- 类型：`[String]`（PetSpecies.key 数组），默认 `[]`, `indexed`
- `[]` = **通用**（任意宠物可喂，现状）
- `["cat_orange", "cat_grey"]` = **多物种专属**：只要宠物 species 在列表内即可喂；其他物种宠物喂食 `pet.service.feed` 校验失败 → 422「该消耗品仅限「猫、灰猫」使用」
- **跟图鉴直接相关**：ownerSpecies 是 PetSpecies.key 数组，**不**指向具体宠物实例
- 同一物种的所有学员宠物都受限制（"猫薄荷"只对猫生效，无论该猫属于哪个学员）
- 索引：`{ownerSpecies: 1}`（mongoose 多键索引，命中任一元素）
- 配 admin catalog `PetConsumableTab.vue` 表单「归属」radio：通用 / 专属某物种（**多选** PetSpecies picker）
- 配 client `shop.vue` 卡片「🔒 仅 XX、YY」徽章 + `detail.vue` 食物 chip `?petId=X` 服务端按 pet.species 过滤
- **不需要弃养级联清理**：species key 不会因宠物实例弃养而消失
- **限制**：admin 设定的 ownerSpecies 买完后**完全固定**（2026-07-21 产品决策），C 端不能改；admin 端可改

> 删 `applicableTier` + `perTier`（{C,B,A,S,all}）子文档；2026-07-16 删 `image` 视觉类型 + `imageFile` 字段。

### 2.5 PetLevelConfig（per-org 经验曲线，新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| `org` | ObjectId ref Org, unique | per-org 单例 |
| `expBase` | Number default 100 | 1→2 级所需经验（公式兜底） |
| `expIncrement` | Number **锁定 300**（2026-07-16） | 每级增量——**机构不可改**；逐级差异走 `levelExpOverrides` |
| `levelExpOverrides` | `[{level:Number 1-100, exp:Number}]`，default `[]` | 逐级覆盖；命中时优先于公式 |
| `updatedBy` | ObjectId ref User | |

**升级判定（2026-07-16 第二期：逐级覆盖 + 锁增量）**：
- 公式： `expToNext(L) = expBase + LOCKED_EXP_INCREMENT * (L-1)`，常量 = 300
- 覆盖：`levelExpOverrides` 中显式列出的等级走覆盖值；未列出的等级仍走公式（含基础 + 固定 300 增量）
- 兜底：无 `PetLevelConfig` 记录时用 `DEFAULT_LEVEL_CONFIG`（`{expBase:100, expIncrement:300, levelExpOverrides:{}}`）
- **锁定语义**：后端 `updateLevelConfig` 与 `normalizeLevelConfig` 都会**强制把 `expIncrement` 写回 300**，忽略入参 + 抹 DB 旧值。
- **删某条覆盖条目** → 该等级自动退回公式（基础 100 + 增量 300），不会破坏升级

**2026-07-16：`maxLevel` 已迁到 PetSpecies → 2026-07-18：PetSpecies.maxLevel 字段已删除**（最高等级完全由 `levelVisuals[].max` 派生）。本表只**统一管理**经验曲线。满级判定 = `resolveMaxLevel(species)` = `max(species.levelVisuals[].level)`（缺省兜底 `DEFAULT_SPECIES_MAX_LEVEL=1`，2026-07-18 第三期从 12 改 1。**蛋态默认**：没配任何 levelVisuals → 物种最高 1 级，不能升级）。

### 3.0 per-species 逐级形象（2026-07-16 新增）

详见 `PetSpecies.levelVisuals` 字段。完整 fallback 链与编辑流程见 §3.5。

---

## 三、宠物规则

### 3.1 状态机（去 tier）

```
[adopt] → state=egg, level=1, exp=0, hunger=100
   │ hatch (0 积分, rollSpecies 全池随机)
   ▼
state=alive, species=locked, level=1, exp=0, hunger=INIT(300)
   │
   ├─ feed (扣积分 + exp+hunger; 升级到 species resolveMaxLevel 封顶; 无升阶)
   └─ cron: hunger=0 且 daysSince(lastFedAt) ≥ deathThresholdDays
        → state=dead → 同 tick rebirth (state=egg, level=1, exp=0, hunger=max, species=null 重随机)
```

**关键不变量**：
- feed / hatch 都是 CAS（read → 计算 → findOneAndUpdate 带状态守卫）
- 升级 loop 到 `resolveMaxLevel(species)` = `max(species.levelVisuals[].level)` 封顶（缺省 1 = 蛋态默认），满级 exp 清 0（进度条显示已满）；**无 tierup 回蛋**
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

### 3.5 消耗品归属（ownerSpecies，2026-07-21 v4 多选）

**设计动机**：平台超管 / 机构想限定某消耗品只能喂给某几个物种的所有宠物（例："猫薄荷"只对猫喂，可指定多猫品种）。**与具体宠物实例无关**——消耗品 owner 跟图鉴是直接关系，跟学员宠物实例是间接关系。

**v4 设计决策**（相对 v3 的升级）：
- v1：ownerPetAccountId（绑定具体宠物实例）→ 需要弃养级联清理
- v3：ownerSpecies（PetSpecies.key 单值）→ 单物种限制
- **v4（当前）**：ownerSpecies（PetSpecies.key 数组，多选）→ 一份消耗品可指定多个物种

**不变量**（写在 `pet.service.feed`）：
- `consumable.ownerSpecies == []` → 任意宠物可喂（通用）
- `consumable.ownerSpecies.length > 0` → 仅 `pet.species ∈ ownerSpecies` 可喂；不包含 → 422「该消耗品仅限「猫、灰猫」使用」（列出全部 ownerSpecies 中文名）

**PetConsumable 字段**：`ownerSpecies: [String], default: [], indexed`。详见 §2.4。

**pet shop controller 自动 resolve pet**（`petShop.controller.resolvePetId`，2026-07-21 v4）：
1. `body.petId` 显式指定
2. `PetConsumable.ownerSpecies`（v4）：若 consumable 有 ownerSpecies 数组，强制找该学员 `species ∈ ownerSpecies, state: 'alive'` 的宠物
3. 默认宠物 fallback

**为什么 admin 端不 resolve**：admin 端所有"代喂食 / 代买"端点已显式传 `petAccountId`，由 `pet.service.feed` 校验 ownerSpecies 一致性。

**C 端 `GET /pet/consumables?petId=X`**（2026-07-21 v4）：
- `petId` 存在 → 查 `pet.species`，仅返 `ownerSpecies.includes(pet.species) || ownerSpecies.length === 0` 的消耗品
- `petId` 缺省 → 返所有（如 shop.vue）

**不需要弃养级联清理**（v4 优势）：
- species key 不随宠物实例变化
- 同一物种下的所有学员宠物都受限制（或放行）

**前端**：
- admin `PetConsumableTab.vue`：表单「归属」radio + PetSpecies **多选** picker（共享图鉴）；列表加「归属」列（通用 / 🔒 仅 [物种1、物种2]）
- client `shop.vue`：卡片显示「通用」/「🔒 仅 [物种1、物种2]」徽章（species key 通过 species 图鉴翻译为中文名）
- client `detail.vue`：食物 chip `loadConsumables` 传 `petId`（`pet.controller.consumables` 端点按 pet.species 过滤）

### 3.5 per-species 逐级形象 fallback 链（2026-07-16 新增）

**目标**：admin 可为某物种单独给每个等级配独立形象；未设置的等级自动 fallback 到上一级，直到物种自身视觉字段（`visualType/svgContent/videoFile`）。所有该物种的宠物共用这套配置。

#### a) 视觉 fallback 链：`resolveVisualAtLevel(species, level)`
```
species.levelVisuals[level] (per-level override, 命中且 visualType+内容合法)
  └─ species.levelVisuals[level-1] (向上递归)
       └─ ... species.levelVisuals[1]
            └─ species.{visualType, svgContent, videoFile} (物种兜底)
```
- 返回结构：`{visualType, svgContent, videoFile, source:'override'|'species', level}`
- `source='override'` 时 `level` 为命中条目的 level；`source='species'` 时 `level=0`
- 1 级兜底：fallback 链必然落到 species 自身视觉字段（**PetSpecies 必须总有视觉**，seed 保证 16 条 species 都有 `visualType='svg'` + 内联 svgContent；PetSpeciesTab 编辑时强制 visualType+内容二选一）
- server 端 `pet.service.decoratePet` 一次性走完链 → 写入 `pet.currentVisual`，前端只读这一个字段渲染

#### a.bis) 升级特效：`resolveLevelUpEffectAtLevel(species, level)`（2026-07-18 第四期）

**关键区别**：形象 = 持续循环状态（**有 fallback 链**）；特效 = 升级瞬时事件（**无 fallback**）。语义对齐：

| 维度 | 形象 (visual) | 升级特效 (effect) |
|---|---|---|
| 时序 | 持续循环（破壳后一直在） | 一次性（升级到该等级播一次，播完即消失） |
| 触发 | 进入等级即生效 | 仅在 fromLevel → toLevel 跨越瞬间触发 |
| Fallback | levelVisuals[L] → L-1 → ... → species | 无；未配 = 无特效 |
| 业务 | 展示「宠物长什么样」 | 展示「升级的仪式感」 |
| 解析函数 | `resolveVisualAtLevel(species, level)` | `resolveLevelUpEffectAtLevel(species, level)` |
| decoratePet 字段 | `pet.currentVisual` | `pet.levelUpEffect`（null = 当前等级无特效） |

**为什么没有 fallback**：升级是单次事件，若目标等级 L 没配，回退到 L-1 的特效会让用户看到「上一段动画的尾巴」而不是「升到 L 的庆典」—— 语义混乱。**未配 = 静默升级**（直接换形象）是更干净的取舍。

**触发链路**：
1. 玩家喂食 → `pet.service.feed` 计算升级（loop），每升一级调一次 `resolveLevelUpEffectAtLevel(species, newLevel)`
2. 非空 effect 按 fromLevel 升序拼成 `levelUpEffects[]`，随 `feed` 返回：`{ ..., levelUp: true, levelUpCount, levelUpToLevel, levelUpEffects }`
3. 前端（C 端 detail.vue / admin PetClassroomDisplay.vue）拿到 `levelUpEffects[]` → 串行播放（视频 `@ended`、SVG 固定 1.8s 兜底 + 队列衔接 250ms 淡出）
4. 队列全部播完才关遮罩 → 后续 currentVisual（已升级到新等级的形象）继续循环

#### a.ter) 蛋态视觉：`resolveEggVisual(species)`（2026-07-18 第五期）

**设计动机**：蛋态用纯 🥚 emoji 占位，视觉风格与破壳后完全割裂，玩家感受不到"这只蛋里是什么物种"。改用 species 本体视觉作为底层，破壳前后视觉一致，提前感受物种风格。

**与 resolveVisualAtLevel 的关键区别**：

| 维度 | 存活态 (currentVisual) | 蛋态 (eggVisual) |
|---|---|---|
| 解析来源 | `species.levelVisuals[L] → L-1 → ... → species 自身`（**有 fallback 链**） | `species.{visualType, svgContent, videoFile}`（**直接取 species 自身**，不走 fallback） |
| 为什么没 fallback | 蛋没"等级"概念，一直展示物种本体风格 | — |
| 视觉 UI | 持续循环 + 进度条/数据条 | 底层 species 视觉 + 🥚 emoji 缩左上角半透明 overlay + 破壳动画（锤击+裂纹+金光） |
| 解析函数 | `resolveVisualAtLevel(species, level)` | `resolveEggVisual(species)` |
| decoratePet 字段 | `pet.currentVisual` | `pet.eggVisual`（state==='egg' 时填充） |

**前端 UI 范式**：
- 蛋态主区底层 = `currentEggVisual`（eggVisual.svgContent / eggVisual.videoFile）
- 蛋态 emoji 缩到 96rpx / 48px 半透明左上角 overlay
- 破壳动画（锤击 + 裂纹 + 金光）保留
- 破壳成功 → currentVisual 接管（已有行为不变）

**产品决策 2026-07-18**：保留 emoji 作为 overlay（玩家能一眼识别"未破壳"状态；不要纯靠底部"点击破壳"文字）。

#### b) 编辑入口

`系统管理 → 宠物图鉴`（`/pet/catalog?tab=species`）→ 点任一物种的「编辑」→ 弹窗下半部分新增 **「各等级形象 (per-species 覆盖)」** section：

```
各等级形象 (per-species 覆盖)
[每级形象] ┌────────────────────────────────────────────────────────────┐
           │ 已配 N 级（最高支持 N 级）；未列出的等级自动继承上一级  │
           │ （1 级兜底走物种自身视觉字段）。                         │
           │ ┌────────┬──────────┬─────────────────────┬────────┐   │
           │ │ 等级   │ 视觉类型 │ 视频/SVG 内容        │ 操作   │   │
           │ │ Lv.1   │ video    │ [选择/上传视频]      │ 删除   │   │
           │ │ Lv.3   │ svg      │ [<svg>...</svg>]    │ 删除   │   │
           │ │ Lv.5   │ video    │ [选择/上传视频]      │ 删除   │   │
           │ └────────┴──────────┴─────────────────────┴────────┘   │
           │ [新增一级覆盖]  （最多 100 级，schema 防呆）             │
           └────────────────────────────────────────────────────────────┘
```

**2026-07-18 变更**：删除原"最高等级"输入框 + 列表列；最高等级完全由本数组 max(level) 派生，无任何覆盖时按 `DEFAULT_SPECIES_MAX_LEVEL=1` 兜底（**蛋态默认** = 只能保持 1 级，必须显式添加 ≥2 条 levelVisuals 才能让宠物升级）。

**2026-07-18 第四期变更**：每行内嵌「升级特效」inline 编辑区（radio + 内容），与形象同表 cell 编辑。规则：
- 类型 `无 / video / svg` 三选一（默认「无」= 该等级升级不播特效）
- 选了 video → FilePicker + el-upload（与形象同款）；选了 svg → textarea
- 「无」= 后端写入 `levelUpEffect: null`（显式清除）

每行可独立选 `video` 或 `svg` 二选一；video 走 `FilePicker` + `el-upload`（与物种主视觉同款）；svg 走 textarea。

#### c) API 端点

**复用现有** `POST /admin/pet/species` + `PUT /admin/pet/species/:id`（需平台超管），payload 增 `levelVisuals[]`：
```jsonc
{
  "key": "cat_orange",
  "name": "橘猫",
  "levelVisuals": [
    { "level": 1,  "visualType": "video", "videoFile": "<File ObjectId>", "levelUpEffect": null },
    { "level": 5,  "visualType": "svg",   "svgContent": "<svg>...</svg>",
      "levelUpEffect": { "visualType": "video", "videoFile": "<File ObjectId>" } },
    { "level": 10, "visualType": "video", "videoFile": "<File ObjectId>",
      "levelUpEffect": { "visualType": "svg", "svgContent": "<svg>...</svg>" } }
  ]
}
```
`levelVisuals` 字段含义：
- `undefined`（不传）= 不更新；`[]` = 清空（全部等级走 species 默认，最高等级 fallback 1 蛋态默认）；数组 = 全量覆盖
- `level` 必须在 `[1, 100]` 之间（schema + service 双重校验，2026-07-18 删 maxLevel cap）
- 每条 `visualType` 决定 `svgContent` 还是 `videoFile` 必填（XSS sanitize + fileBind 校验）
- 同一 species 内 `level` 必须唯一（schema partial unique 索引兜底）
- **2026-07-18**：payload 不再传 `maxLevel` 字段（后端字段已删）
- **2026-07-18 第四期**：每条可嵌 `levelUpEffect`（null=无特效；visualType+内容规则同 visual）

#### d) fileBind 维护

| 字段 | field 命名 | 维护方式 |
|---|---|---|
| `PetSpecies.videoFile` | `'videoFile'` | `diffSingleById`（既有） |
| `PetSpecies.levelVisuals[L].videoFile` | `'levelVisual.<L>'` | 业务侧循环 + `diffSingleById`（**2026-07-16 新增**；per-level 粒度，删 Lv.X 不触发其他级 churn） |
| `PetSpecies.levelVisuals[L].levelUpEffect.videoFile` | `'levelVisual.<L>.levelUpEffect'` | 业务侧循环 + `diffSingleById`（**2026-07-18 第四期新增**；与形象同 L 但 filed 命名空间分开，互不串扰） |
| 整体删除 PetSpecies | (不限 field) | `removeSpecies` 内部 `maintainLevelVisualsFileRefs({oldLevelVisuals: doc.levelVisuals, newLevelVisuals: []})` 一并解绑（**含 levelUpEffect 维护，2026-07-18 第四期**） |

`REF_ENTITY.PET_SPECIES` 在 `File.model.js:30` 已存在，无需新增。

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
- `views/classroom/PetClassroomDisplay.vue`（其他宠物网格 **+ 弃养按钮 2026-07-16**；**2026-07-18 第四期加 `levelUpOverlay` 全屏遮罩播放升级特效**：prevPetLevel 跟踪 + 轮询检测跨级 + 串行播放；onBuyConsumable 直接用 result.levelUpEffects 走快速通道，跳过轮询检测）
- `components/Pet/PetEquipmentOverlay.vue`（退化为 species 渲染；**2026-07-16 加 `currentVisual` prop**：渲染优先级 `currentVisual > speciesRecord > emoji`；`currentVisual` 来源现在是 `PetSpecies.levelVisuals` fallback 链 server 端解析结果）、`GrantOnBehalfDialog.vue`（仅消耗品）
- `views/pet/tabs/PetSpeciesTab.vue` 加 **「各等级形象」section**（2026-07-16）：每个物种在「编辑物种」弹窗下半部分配置 `levelVisuals[]`；每级独立选 video/svg；保存时校验 + fileBind 维护；**2026-07-18 第四期再加「升级特效」列**：每行内嵌 inline 编辑区（radio + 内容），未配 = 无特效
- **删**：`PetItemAdmin.vue` / `EquipOnBehalfDialog.vue` / `FeedOnBehalfDialog.vue` / `PetSpeciesAdmin.vue` / `PetConsumableAdmin.vue` / `PetLevelConfigAdmin.vue`（2026-07-15 合并到 PetCatalogAdmin）
- 菜单：拍平「系统管理→宠物管理」为单 leaf（icon `Notebook`）；学员组下「宠物等级配置」已删除（合并到 catalog 的 level-config tab）

### Client（packages/client, uni-app）
- `api/pet.js`：`me` / `list` / `adopt` / `:petId/hatch` / `:petId/feed` / `:petId/set-default` / `species` / `consumables`（删 items/equip/swapEgg/tierDown）
- `pages/pet/detail.vue`：默认宠物主图（9:16 裁 1:1 video）+ exp/hunger + 食物 chip + **其他宠物区（视频卡 + 领养）** + **弃养按钮 (2026-07-16, 副信息条 + 其他宠物卡都可见)**；**2026-07-16 主图 + 其他宠物卡都改读 `currentVisual`（per-level override → species fallback → emoji 三级），server 端 `decoratePet` 解析**
- `pages/tabbar/index.vue`：首页宠物卡渲染默认宠物 video（去 tier-badge / 装备层 / 背景层）
- `utils/constants.js`：仅留 `PetState`/`PetStateLabel`/`PET_SPECIES_EMOJI`（删 PetTier*/PetSlot*）
- **删**：`pages/pet/equip.vue` / `pages/pet/hatch.vue`（占位页）

**Client**（packages/client, uni-app）
- `api/pet.js`：`me` / `list` / `adopt` / `:petId/hatch` / `:petId/feed` / `:petId/set-default` / `species` / `consumables`（删 items/equip/swapEgg/tierDown）
- `pages/pet/detail.vue`：默认宠物主图（9:16 裁 1:1 video）+ exp/hunger + 食物 chip + **其他宠物区（视频卡 + 领养）** + **弃养按钮 (2026-07-16, 副信息条 + 其他宠物卡都可见)**；**2026-07-16 主图 + 其他宠物卡都改读 `currentVisual`（per-level override → species fallback → emoji 三级），server 端 `decoratePet` 解析**；**2026-07-18 第四期加 `levelUpOverlay` 全屏遮罩播放升级特效队列**：onFeed 拿到 result.levelUpEffects → 串行播放（视频 `@ended`、SVG 固定 1.8s 兜底 + 队列衔接 250ms 淡出）→ 播完才关遮罩 + load()；**2026-07-18 第五期蛋态视觉复用 species 本体**：底层 = `currentEggVisual`（species 视频/svg），emoji 缩到左上角半透明 overlay，破壳动画保留
- `pages/tabbar/index.vue`：首页宠物卡渲染默认宠物 video（去 tier-badge / 装备层 / 背景层）
- `utils/constants.js`：仅留 `PetState`/`PetStateLabel`/`PET_SPECIES_EMOJI`（删 PetTier*/PetSlot*）
- **删**：`pages/pet/equip.vue` / `pages/pet/hatch.vue`（占位页）

**9:16 视频裁 1:1 范式**（复用）：父 `aspect-ratio:1/1 + overflow:hidden`；video `position:absolute; top:50%; height:177.78%; transform:translateY(-50%); object-fit`（H5 加 `!important` 兜底）。

---

## 六、关键文件路径

**模型**：`models/PetAccount|PetSpecies|PetConsumable|PetEvent|PetLevelConfig.model.js`（PetItem 已删）
**Shared**：`shared/petConfig.js`（DEFAULT_LEVEL_CONFIG(expBase/expIncrement=300/levelExpOverrides) / LOCKED_EXP_INCREMENT / DEFAULT_SPECIES_MAX_LEVEL / MAX_PETS_PER_STUDENT / expToNext(支持 per-level 覆盖 + 锁增量) / normalizeLevelConfig / normalizeLevelOverrides / levelOverridesToRows / rowsToLevelOverrides / resolveMaxLevel(species) / **resolveVisualAtLevel(species, level)** (2026-07-16 新增；per-species fallback 链) / **getOverrideMap(levelVisuals)** (2026-07-16 新增) / **resolveLevelUpEffectAtLevel(species, level)** (2026-07-18 第四期新增；per-level 升级特效解析，无 fallback，未配返 null) / **resolveEggVisual(species)** (2026-07-18 第五期新增；蛋态视觉解析，直接取 species 自身，无 fallback)）、`shared/petSpecies.js`、`shared/enums.js`（Pet* enums；PET_VISUAL_TYPES 只剩 svg/video）；`shared/petItems.js` 已删
**Service**：`modules/pet/{pet.service, petCatalog.service, petCatalog.admin.service, petCatalog.admin.controller/.routes, petCron, petShop.service/.controller/.routes, petPoints.helper, petEvent.service}`；`modules/petAdmin/{petAdmin.service/.controller/.routes}`；`petItems.service.js` 已删
**Seed**：`utils/petCatalogSeed.js`、`utils/_petCatalog/{index,species,consumables}.js`（items.js 已删）；`scripts/db/_seed-dedupe-pet-species.js`（2026-07-16 上同种唯一 index 前必跑；`pnpm db:seed:dedupe-pet-species`，支持 `--dry-run`）
