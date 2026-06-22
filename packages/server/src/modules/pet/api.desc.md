# Pet 模块 API 文档（pet-system-v2，2026-06-21）

> 基础路径：`/api/v1/pet`（C 端家长）· `/api/v1/admin/pet`（管理端）
>
> 家长端"宠物乐园"完整实现。覆盖领蛋 → 破壳 → 喂养 → 升级 → 升阶 → 置换 → 主动降阶 → 换装 → 死亡回蛋 全生命周期。
>
> **与旧 Pet.model stub 的关键差异**：
> - 状态机：`egg` / `alive` / `dead`（不再是单一 `level/exp` 线性养成）
> - 4 阶 `C/B/A/S`：平衡"学习频率低 → 积分少"学生的养宠经济
> - 饥饿系统：每天衰减（高阶衰减快），hunger=0 持续 N 天 → 死亡 → 同阶回蛋
> - 装饰系统：升 Lv 解锁 hat/scarf/clothes/accessory；升阶解锁 halo/background
> - PetEvent 独立审计流（不与 PointsTransaction 混）

---

## 一、通用约定

### C 端（家长）
- 请求头：`Authorization: Bearer <access>`、`x-org-id`、`x-active-student-id`
- 中间件链：`authenticate` → `requireOrg` → `activeStudent` → (写操作)`requireEnrolledStudent`
- 不需要业务权限码（仅 auth + activeStudent 校验监护关系）
- GET 端点不要求 enrolled（懒创建兜底）；POST 端点要求已报班

### Admin 端
- 请求头：`Authorization: Bearer <access>`、`x-org-id`
- 列表/详情/事件：`pet.read` 权限
- 调整（`PUT /accounts/:id`）：`pet.write` 权限

---

## 二、C 端 API（家长）

### 1. 当前孩子的宠物

- **GET** `/api/v1/pet/me`
- **响应**：
```json
{
  "data": {
    "id": "...",
    "student": "...",
    "state": "alive",
    "species": "cat_orange",
    "speciesRecord": { "key": "cat_orange", "name": "橘猫", "image": "...", "tier": "C", "weight": 100 },
    "tier": "C",
    "level": 3,
    "experience": 45,
    "nextExpToLevel": 110,
    "tierUpThreshold": 250,
    "currentHunger": 80,
    "maxHunger": 100,
    "lastFedAt": "...",
    "currentFoodCost": { "normal": 5, "premium": 15, "super": 40 },
    "currentSwapCost": 80,
    "possibleTierDowns": [],
    "nickname": "小白",
    "unlocked": { "hat": ["hat_party"], "scarf": [], ... },
    "equipped": { "hat": "hat_party", ... }
  }
}
```

### 2. 种类图鉴

- **GET** `/api/v1/pet/species`
- **响应**：`{ byTier: { C: [...], B: [...], A: [...], S: [...] }, all: [...] }`

### 3. 装饰图鉴 + 解锁/装备状态

- **GET** `/api/v1/pet/items`
- **响应**：
```json
{
  "data": {
    "items": {
      "hat": { "slot": "hat", "slotLabel": "帽子", "items": [{ "key": "hat_party", "name": "派对帽", "unlocked": true, "equipped": true, ... }] },
      "scarf": { ... },
      ...
    },
    "pet": { ... } // 完整 pet 文档
  }
}
```

### 4. 事件流

- **GET** `/api/v1/pet/events?page=1&pageSize=20`
- **响应**：`{ items: [{ type: 'feed', payload: {...}, createdAt: ... }], total, page, pageSize }`

### 5. 领养（懒创建兜底；幂等）

- **POST** `/api/v1/pet/adopt`
- 0 积分；已存在 PetAccount 时返回现有（不重复写 adopt 事件）
- **响应**：`{ data: { ...pet } }`

### 6. 破壳

- **POST** `/api/v1/pet/hatch`
- 0 积分；要求 `state='egg'`
- 行为：随机当前 eggTier 池中 species（若 species 已锁定则保留 D2 决策），state→alive，hunger→max
- **响应**：`{ data: { petAccount, leveledUp: false, tieredUp: false, event } }`

### 7. 喂食

- **POST** `/api/v1/pet/feed`
- **Body**：`{ consumableKey: 'food_normal_c' | 'toy_ball' | ... }`（PetConsumable.key 任意）
- 扣积分（按当前 tier 定价），加经验/饱腹度，可能触发 levelup / tierup
- 满级时若经验达到 `tierUpThreshold` 触发升阶：state→egg, eggTier→nextTier, level=1, exp=0, species 保留
- **响应**：`{ data: { petAccount, levelUp, tierUp, pointsCost, pointsAfter, events: [...] } }`

### 8. 置换蛋

- **POST** `/api/v1/pet/swap-egg`
- 扣积分（按当前 tier `swapCost`）；要求 `state='alive'`
- 行为：state→egg, eggTier 保留（再破壳 species 重新随机）
- **响应**：`{ data: { petAccount, pointsCost, pointsAfter, event } }`

### 9. 主动降阶

- **POST** `/api/v1/pet/tier-down`
- **Body**：`{ targetTier: 'C'|'B'|'A' }`（必须低于当前 tier）
- 0 积分；species 保留；equipped 超新阶 cap 自动卸下
- **响应**：`{ data: { petAccount, event, autoUnequipped: [{ slot, itemKey }] } }`

### 10. 换装

- **POST** `/api/v1/pet/equip`
- **Body**：`{ slot: 'hat'|'scarf'|...|'background', itemKey: 'hat_party'|null }`
- 卸下传 `itemKey: null`；itemKey 必须存在且 `unlocked[slot]` 包含之
- 0 积分
- **响应**：`{ data: { petAccount, event, changed, fromItemKey } }`

---

## 三、Admin 端 API

### 1. 列表 PetAccount

- **GET** `/api/v1/admin/pet/accounts?state=&tier=&keyword=&page=1&pageSize=20`
- **权限**：`pet.read`
- **响应**：`{ items: [...], total, page, pageSize }`

### 2. 详情

- **GET** `/api/v1/admin/pet/accounts/:id`
- **权限**：`pet.read`
- **响应**：`{ data: { pet, recentEvents: [...] } }`

### 3. 调整（白名单字段）

- **PUT** `/api/v1/admin/pet/accounts/:id`
- **权限**：`pet.write`
- **Body**（可只传需要改的字段）：
```json
{
  "nickname": "新昵称",
  "currentHunger": 100,
  "lastFedAt": "2026-06-21T10:00:00Z",
  "deathThresholdDays": 30,
  "state": "alive",
  "level": 5,
  "experience": 0,
  "maxHunger": 100,
  "reason": "客服补偿"
}
```
- **白名单**：`nickname / currentHunger / lastFedAt / deathThresholdDays / state / level / experience / maxHunger`
- **写 `admin_override` PetEvent**：每次调整都会写一条审计事件
- **响应**：`{ data: { pet, changes: [{ field, oldValue, newValue }] } }`

### 4. 事件流

- **GET** `/api/v1/admin/pet/events?petAccountId=&studentId=&type=&page=1&pageSize=30`
- **权限**：`pet.read`
- **响应**：`{ items: [...], total, page, pageSize }`
- type 可多选：`type=feed,levelup,tierup` 或 `type=death`

---

## 四、状态机（参考）

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
                │       → [state=egg, eggTier=B, level=1, exp=0, species=同前, 0 积分]
                │       │ hatch → [state=alive, tier=B, species=同前, ...]
                │
                ├─ tier-down (玩家主动, 0 积分; unlocked 保留, equipped 超 cap 卸下)
                │   → [state=egg, eggTier=target, level=1, exp=0, species=同前, unlocked 保留]
                │
                ├─ swap-egg (扣积分)
                │   → [state=egg, eggTier=current, level=1, exp=0, species=null]
                │   │ hatch → [state=alive, tier=current, species=重新随机]
                │
                └─ cron: currentHunger=0 + daysSince(lastFedAt) ≥ deathThresholdDays
                    → [state=dead] → 同一 tick rebirth → [state=egg, eggTier=current, level=1, exp=0, hunger=100]
```

### 关键不变量
- `(state='alive') ⇒ (experience < expToNext(level, tier))`
- 满级升阶在 `feed` 事务内级联完成（不存在"满级但未升阶"窗口）
- `tierdown` 是原子的单次 `$set`
- `species` 在 `state=egg` 仍存在时 `hatch` 不再随机（D2：升阶保留 species）
- 死亡→rebirth 在同一 cron tick（状态可观察点 = `egg`，不是 `dead`）

---

## 五、PetEvent 类型与 payload

| type | payload | 写时机 |
|------|---------|--------|
| `adopt` | `{ initialTier, by }` | ensurePetAccount 创建时 |
| `hatch` | `{ tier, species, level, unlocked }` | 破壳成功 |
| `feed` | `{ consumableKey, expGain, hungerBefore, hungerAfter, expBefore, expAfter, tier, level }` | 每次喂食 |
| `levelup` | `{ fromLevel, toLevel, tier }` | 喂食触发的升级（feed 内部循环，可能多条） |
| `tierup` | `{ fromTier, toTier, species }` | 满级升阶 |
| `tierdown` | `{ fromTier, toTier, reason, autoUnequipped }` | 玩家主动降阶 |
| `swap` | `{ tier, cost, fromSpecies }` | 置换蛋 |
| `death` | `{ tier, hunger, daysAtZero, reason: 'hunger' }` | cron 判定死亡 |
| `rebirth` | `{ tier, fromDeath }` | 死→蛋 |
| `equip` | `{ slot, itemKey, fromItemKey }` | petItems.equip |
| `unequip` | `{ slot, itemKey, fromItemKey, reason? }` | petItems.equip(null) 或 tierdown 自动卸下 |
| `admin_override` | `{ changes, operator, reason }` | admin 调整 |
| `admin_adopt` | `{ operator, by, initialTier }` | admin 代领蛋 (2026-06-21 ext) |
| `admin_feed` | `{ operator, by, consumableKey, expGain, hungerGain, ... }` | admin 代喂食 |
| `admin_hatch` | `{ operator, by, tier, species }` | admin 代破壳 |
| `admin_swap` | `{ operator, by, tier, cost, fromSpecies }` | admin 代置换蛋 |
| `admin_tierdown` | `{ operator, by, fromTier, toTier, autoUnequipped }` | admin 代降阶 |
| `admin_equip` | `{ operator, by, slot, itemKey, fromItemKey }` | admin 代换装 |

---

## 六、扩展接口：Pet Catalog CRUD（2026-06-21 pet-system-v2-ext）

### 1. Species 物种图鉴

```
GET    /api/v1/admin/pet/species             pet.write   list (?tier=&isActive=&keyword=)
POST   /api/v1/admin/pet/species             pet.write   create
GET    /api/v1/admin/pet/species/:id         pet.read    detail
PUT    /api/v1/admin/pet/species/:id         pet.write   update
DELETE /api/v1/admin/pet/species/:id         pet.write   remove（requirePlatformPassword）
GET    /api/v1/admin/pet/species/:id/removable-check  pet.read  预检
```

**Body (POST/PUT)**：
```json
{
  "key": "cat_black",
  "name": "黑猫",
  "tier": "C",
  "visualType": "image",
  "imageFile": "65...",          // File ref id；visualType=image 时用
  "svgContent": "<svg>...</svg>", // visualType=svg 时用（自动 sanitize 去 script/on*）
  "weight": 100,
  "isActive": true,
  "description": "..."
}
```

### 2. Items 装饰图鉴

```
GET    /api/v1/admin/pet/items               pet.read    list (?slot=&isActive=&keyword=)
POST   /api/v1/admin/pet/items               pet.write   create
GET    /api/v1/admin/pet/items/:id           pet.read    detail
PUT    /api/v1/admin/pet/items/:id           pet.write   update
DELETE /api/v1/admin/pet/items/:id           pet.write   remove
GET    /api/v1/admin/pet/items/:id/removable-check   pet.read  预检
```

**Body (POST/PUT)**：
```json
{
  "key": "hat_party",
  "name": "派对帽",
  "slot": "hat",                 // hat/scarf/clothes/accessory/halo/background
  "unlockType": "level",          // level/tier
  "unlockTier": "C",             // unlockType=tier 时必填
  "unlockLevel": 1,              // unlockType=level 时必填
  "imageFile": "65...",
  "compatibleSpecies": ["cat_orange", "dog_puppy"],  // 宽松 UI 提示，equip 不强制
  "isActive": true,
  "description": "..."
}
```

### 3. Consumables 食物/玩具

```
GET    /api/v1/admin/pet/consumables         pet.read    list (?kind=&isActive=&keyword=)
POST   /api/v1/admin/pet/consumables         pet.write   create
GET    /api/v1/admin/pet/consumables/:id     pet.read    detail
PUT    /api/v1/admin/pet/consumables/:id     pet.write   update
DELETE /api/v1/admin/pet/consumables/:id     pet.write   remove
GET    /api/v1/admin/pet/consumables/:id/removable-check   pet.read  预检
```

**Body (POST/PUT)**：
```json
{
  "key": "food_normal",
  "name": "普通粮",
  "kind": "food",                       // food/toy
  "applicableTier": "all",              // C/B/A/S/all
  "perTier": {                          // applicableTier=all 时填 all 行；否则填对应阶行
    "C": { "pointCost": 5, "hungerRestore": 15, "expGain": 10 },
    "B": { "pointCost": 15, "hungerRestore": 12, "expGain": 20 },
    "A": { "pointCost": 40, "hungerRestore": 10, "expGain": 40 },
    "S": { "pointCost": 100, "hungerRestore": 8, "expGain": 80 }
  },
  "imageFile": "65...",
  "isActive": true,
  "description": "基础食物"
}
```

---

## 七、扩展接口：老师/admin 代操作 6 端点（2026-06-21 pet-system-v2-ext）

```
POST   /api/v1/admin/pet/accounts                          pet.write  代领蛋 (body: {studentId})
POST   /api/v1/admin/pet/accounts/:id/feed                 pet.write  代喂食 (body: {consumableKey})
POST   /api/v1/admin/pet/accounts/:id/hatch                pet.write  代破壳
POST   /api/v1/admin/pet/accounts/:id/swap-egg             pet.write  代置换蛋
POST   /api/v1/admin/pet/accounts/:id/tier-down            pet.write  代降阶 (body: {targetTier})
POST   /api/v1/admin/pet/accounts/:id/equip                pet.write  代换装 (body: {slot, itemKey})
GET    /api/v1/admin/pet/accounts-by-student               pet.read   按 studentId 查宠物 (课堂展示用)
```

**业务要点**：
- 代喂食 / 代置换会扣学员积分（走 points.recordTransaction，operatorId 记录 admin）
- 代领蛋 → state=egg; 代破壳 → state=alive; 代降阶/置换 → state=egg
- 代降阶 0 积分；代换装 0 积分
- 所有代操作写 PetEvent type='admin_*'（与业务 type 区分审计）

---

## 八、扩展接口：课堂展示（2026-06-21 pet-system-v2-ext）

### 路由

```
GET    /class/pet-display?studentId=xxx       独立 layout（ClassroomLayout）
```

- 全屏深色背景（适合投影）
- 3s 轮询 `GET /admin/pet/accounts-by-student` 同步状态
- 内置快捷按钮：喂食 / 破壳 / 置换 / 降阶
- 最近事件列表 + 经验/饱腹度进度条
- 关闭按钮：`window.close()` 或 `history.back()`

### 权限

- 课堂展示路由 `meta.auth = true`，登录即可访问
- 代操作按钮需 `pet.write` 权限

---

## 九、错误码（含扩展）

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 缺 `consumableKey` / `targetTier` / `slot` / `itemKey` / `visualType` 等参数；perTier 缺值 |
| 401 | 未登录 |
| 403 | admin 端权限码不足 / C 端家长非该学员监护人 |
| 404 | 宠物不存在 / consumable 不在该 tier 适用 / 物种/装饰/消耗品不存在 |
| 409 | CAS 冲突（状态并发变更）/ 重复 adopt |
| 422 | 当前状态不可执行（如 alive 时 hatch）；itemKey 未解锁；targetTier 不低于当前；积分不足；物种被 PetAccount 引用；装饰被 PetAccount.unlocked 引用 |

---

## 七、相关模块（2026-06-21 ext 更新）

- 积分扣减：`points.service.recordTransaction({ trigger: 'pet', amount: -cost, refType: 'PetAccount', refId, meta: { action: 'feed'\|'swap_egg', consumableKey } })`
- 升阶/降阶/破壳/死亡 0 积分，**不**走 `points.recordTransaction`
- 报告缓存失效：`points.recordTransaction` 已自动调 `invalidateReportCache(orgId)`
- **Catalog 缓存**（2026-06-21 ext）：`petCatalog.service` 通过 `reportCache.withCache(key, loader, 300_000)` 缓存 species/items/consumables 读；写操作（admin CRUD）调 `invalidateCatalogCache(orgId)`
- **Catalog fallback**（2026-06-21 ext）：DB 完全空时 fallback 到 `shared/petSpecies.js` / `shared/petItems.js` 静态记录（仅 dev 兜底；上线后必填）
- **File 上传**：admin 上传 image 走 `POST /storage/upload?scope=pet`，返回 File ref，写入 `PetSpecies.imageFile` / `PetItem.imageFile` / `PetConsumable.imageFile`（`fileBind.diffSingleById` 维护 refs）
- 文件存储：装饰图片走 `scope='pet'` + `entity='Pet'`（File 模型已预埋）

---

## 八、Cron 配置

`packages/server/src/modules/pet/petCron.js`：
- 间隔：1 小时
- 衰减：按 `petConfig[tier].decayPerDay / 24` per hour
- 死亡：`currentHunger=0 && (now - lastFedAt) ≥ deathThresholdDays`
- 死亡→重生：同 tick 内原子完成
- 调试用：`require('@modules/pet/petCron').sweepAll()`
