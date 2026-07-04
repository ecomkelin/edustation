<!--
  PetDetail - C 端宠物详情页 (2026-07-03 立项)
  设计思路:
    - 顶部: 孩子名 + Lv + 阶位徽章 + 状态 tag
    - 主区: 宠物展示 (蛋态 / 已破壳)
      - 蛋态: 🥚 + "点击破壳" CTA
      - 已破壳: SVG 渲染(species.svgContent) + 装备叠加
    - 数据条: 经验 / 饱腹 (含衰减倒计时)
    - 操作面板 (根据状态切换):
      - 蛋态: 破壳
      - 存活: 置换 / 升阶 (满级时显)
    - 装饰 + 食物 chip 区
  接口:
    - GET /pet/me
    - GET /pet/species, items, consumables (catalog)
    - GET /points/me (积分余额, 显示+食物灰化判定)
    - POST /pet/hatch, feed, equip, swap-egg, tier-down
-->
<template>
  <view class="pet-detail">
    <view v-if="loading && !pet" class="pet-detail__loading">
      <text>召唤中…</text>
    </view>

    <view v-else-if="petBlockReason === 'notEnrolled'" class="pet-detail__empty press" @tap="goEnroll">
      <text class="pet-detail__empty-emoji">🌱</text>
      <text class="pet-detail__empty-title">先报名一门课程吧</text>
      <text class="pet-detail__empty-desc">报名后孩子就能领养宠物伙伴 ›</text>
    </view>

    <view v-else-if="!pet" class="pet-detail__empty press" @tap="goAdopt">
      <text class="pet-detail__empty-emoji">🥚</text>
      <text class="pet-detail__empty-title">领养孩子的第一位小伙伴</text>
      <text class="pet-detail__empty-desc">选一个蛋,让它陪伴孩子一起成长 ›</text>
    </view>

    <template v-else>
      <!-- ───── 顶部条 (返回 ‹ 在左上 + 标题中央) ───── -->
      <view class="pet-detail__top">
        <view class="pet-detail__back" @tap="goBack">
          <text>‹</text>
        </view>
        <view class="pet-detail__title-wrap">
          <text class="pet-detail__title-name">{{ pet.studentName || '我的宠物' }}</text>
          <text class="pet-detail__title-sep">·</text>
          <text class="pet-detail__title-species">{{ speciesName || pet.species || '' }}</text>
        </view>
        <view class="pet-detail__title-spacer" />
      </view>

      <!-- 副信息条: 阶位徽章 + 等级 + 状态 + 积分(右上小) -->
      <view class="pet-detail__subbar">
        <view class="pet-detail__tier" :style="{ background: tierColor }">{{ pet.tier || pet.eggTier || '—' }} 阶</view>
        <text class="pet-detail__lv">Lv.{{ pet.level || 1 }}</text>
        <text v-if="pet.state === 'egg'" class="pet-detail__state pet-detail__state--egg">🥚 待破壳</text>
        <text v-else class="pet-detail__state pet-detail__state--alive">✨ 存活</text>
        <view class="pet-detail__points" v-if="points != null">💰 {{ points }}</view>
      </view>

      <!-- ───── 主图区 ───── -->
      <view class="pet-detail__stage">
        <!-- 2026-07-04 重做: 与 admin PetClassroomDisplay 严格对齐
             - background slot 铺满整个 stage (跟 admin .pet-display-bg 同款)
             - species + 装备叠加层 用 svg-wrap v-html 走 :deep(svg) CSS 缩放
             之前用 base64 data URI + <image> 走不通 (image 在 SVG defs/linearGradient 渲染丢失) -->

        <!-- 背景层: 独立铺满 stage,与宠物图同框 -->
        <view
          v-if="backgroundItem && backgroundItem.svgContent"
          class="pet-detail__stage-bg"
          :class="`bg-${backgroundItem.key}`"
        >
          <view class="pet-detail__svg-wrap" v-html="backgroundItem.svgContent" />
        </view>

        <!-- 蛋态 (含破壳特效, 参考 admin PetClassroomDisplay 的 5 阶段) -->
        <view v-if="pet.state === 'egg' || hatchActive" class="pet-detail__egg-stage" :class="`hatch-${hatchPhase}`">
          <!-- 蛋 emoji (在 gold 阶段渐隐) -->
          <view class="pet-detail__egg-frame" :class="{ fading: hatchPhase === 'gold' }" @tap="onHatch">
            <text class="pet-detail__egg-emoji">🥚</text>
            <!-- 裂痕 SVG (cracks/shake/gold 阶段显示) -->
            <svg
              v-if="['cracks','shake','gold'].includes(hatchPhase)"
              class="pet-detail__egg-cracks"
              :class="{ deep: hatchPhase === 'gold' }"
              viewBox="0 0 200 240"
              preserveAspectRatio="xMidYMid meet"
            >
              <path d="M 100 60 L 95 90 L 110 110 L 95 140 L 115 165 L 100 200" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" />
              <path d="M 70 90 L 80 115 L 65 145" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" />
              <path d="M 130 90 L 125 120 L 140 150" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" />
              <path d="M 80 180 L 100 200 L 120 180" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
            </svg>
          </view>
          <!-- 锤子 (T+0s ~ T+0.4s 砸下) -->
          <view class="pet-detail__hatch-hammer" :class="{ active: hatchPhase === 'hammer' }">🔨</view>
          <!-- 金光 (T+2s 起扩散, 蛋在金光中渐隐) -->
          <view class="pet-detail__hatch-gold" :class="{ active: hatchPhase === 'gold' }"></view>
          <!-- 闲置时的 CTA 提示 -->
          <text v-if="hatchPhase === 'idle'" class="pet-detail__egg-cta">✨ 点击破壳看看 ›</text>
        </view>

        <!-- 已破壳 + 装饰 -->
        <view v-else class="pet-detail__pet press" @tap="goEquip">
          <!-- 主图: species.svgContent 走 svg-wrap + v-html (跟 admin PetEquipmentOverlay 同款) -->
          <view v-if="species && species.visualType === 'svg' && species.svgContent" class="pet-detail__svg-wrap" v-html="species.svgContent" />
          <image v-else-if="species && species.imageFile && species.imageFile.url" :src="species.imageFile.url" class="pet-detail__pet-svg" mode="aspectFit" />
          <text v-else class="pet-detail__pet-emoji">{{ speciesEmoji }}</text>

          <!-- 已装备装饰叠加层(absolute, 跟宠物图同框) -->
          <view class="pet-detail__equips">
            <view
              v-for="layer in equipmentLayers"
              :key="layer.slot + ':' + layer.key"
              class="pet-detail__equip-layer"
              :class="`pet-detail__equip-layer--${layer.slot}`"
            >
              <!-- 跟 admin PetEquipmentOverlay .svg-wrap 一致走 v-html -->
              <view v-if="layer.svgContent" class="pet-detail__svg-wrap" v-html="layer.svgContent" />
            </view>
          </view>
        </view>
      </view>

      <!-- ───── 数据条 ───── -->
      <!-- (顺序: 主图 → 经验饱腹 → 装饰 → 食物 → 底部置换按钮) -->
      <view class="pet-detail__stats">

        <view class="pet-detail__stat">
          <view class="pet-detail__stat-head">
            <text class="pet-detail__stat-label">⭐ 经验</text>
            <text class="pet-detail__stat-val">{{ pet.experience || 0 }}/{{ pet.nextExpToLevel || pet.tierUpThreshold || '?' }}</text>
          </view>
          <view class="pet-detail__bar">
            <view class="pet-detail__bar-fill pet-detail__bar-fill--exp" :style="{ width: expPercent + '%' }" />
          </view>
          <text v-if="canTierUpNow" class="pet-detail__hint pet-detail__hint--gold">
            🎉 满级 + 经验达标,可升阶！
          </text>
        </view>

        <view class="pet-detail__stat">
          <view class="pet-detail__stat-head">
            <text class="pet-detail__stat-label">🍖 饱腹</text>
            <text class="pet-detail__stat-val">{{ pet.currentHunger || 0 }}/{{ pet.maxHunger || 1000 }}</text>
          </view>
          <view class="pet-detail__bar">
            <view class="pet-detail__bar-fill pet-detail__bar-fill--hunger" :style="{ width: hungerPercent + '%' }" />
          </view>
          <text v-if="pet.state === 'alive'" class="pet-detail__hint">
            每 {{ hungerDecayMinutes }} 分钟 -1 · 剩 {{ formatTimeLeft(hungerMinutesLeft) }} 归零
          </text>
          <text v-else class="pet-detail__hint">蛋态不减</text>
        </view>
      </view>

      <!-- ───── 食物 chip 区 (积分 + 喂食) ───── -->
      <!-- 2026-07-03: 顺序调整为 经验饱腹 → 食物 → 装饰 → 底部置换 -->
      <view v-if="pet.state === 'alive' && consumableEntries.length" class="pet-detail__section">
        <view class="pet-detail__section-title">
          <text>🍖 食物 · 点 SVG 喂食</text>
          <text class="pet-detail__section-more pet-detail__section-more--points">
            💰 {{ points != null ? points : '?' }} 积分
          </text>
        </view>
        <scroll-view scroll-x class="pet-detail__food-scroller" show-scrollbar="false">
          <view class="pet-detail__food-row">
            <view
              v-for="c in consumableEntries"
              :key="c.key"
              class="pet-detail__food-chip"
              :class="{ unaffordable: points != null && c.priceForTier != null && points < c.priceForTier }"
              @tap="onFeed(c.key)"
            >
              <view v-if="c.svgContent" class="pet-detail__food-thumb">
                <view class="pet-detail__svg-wrap" v-html="c.svgContent" />
              </view>
              <text v-else class="pet-detail__food-emoji">🍖</text>
              <view class="pet-detail__food-name">{{ c.name }}</view>
              <view class="pet-detail__food-meta">
                <text class="pet-detail__food-price">{{ c.priceForTier }} 积</text>
                <text class="pet-detail__food-eff">+{{ c.expGain }}exp +{{ c.hungerRestore }}饱</text>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- ───── 装饰 chip 区 (存活态才显示) ───── -->
      <view v-if="pet.state === 'alive'" class="pet-detail__section">
        <view class="pet-detail__section-title">
          <text>🎀 装饰 · 点 SVG 切换装备</text>
          <text class="pet-detail__section-more" @tap="goEquip">全部 ›</text>
        </view>
        <view v-for="slot in PET_ITEM_SLOTS" :key="slot" class="pet-detail__slot-row">
          <text class="pet-detail__slot-label">{{ PET_ITEM_SLOT_LABELS[slot] }}</text>
          <scroll-view scroll-x class="pet-detail__slot-scroller" show-scrollbar="false">
            <view class="pet-detail__chips">
              <view
                v-for="entry in unlockedEntriesBySlot[slot]"
                :key="slot + ':' + entry.key"
                class="pet-detail__chip"
                :class="{ framed: pet.equipped?.[slot] === entry.key }"
                @tap="onToggleEquip(slot, entry.key)"
              >
                <!-- 2026-07-04 重做: 走 v-html (跟 admin chip-svg 同款),之前 data URI + image 不稳定 -->
                <view v-if="entry.svgContent" class="pet-detail__svg-wrap" v-html="entry.svgContent" />
                <text v-else class="pet-detail__chip-emoji">▢</text>
              </view>
              <text v-if="!unlockedEntriesBySlot[slot] || unlockedEntriesBySlot[slot].length === 0" class="pet-detail__slot-empty">未解锁</text>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- 2026-07-04 改: 蛋态不用重复破壳按钮 (蛋本身点击就触发 onHatch, 见上方 .pet-detail__egg-frame @tap)
           存活: 主置换按钮 + 满级时升阶副按钮 (或隐藏) -->
      <view class="pet-detail__bottom-cta">
        <view v-if="pet.state !== 'egg'" class="pet-detail__btn pet-detail__btn--primary pet-detail__btn--block press" @tap="onSwap">
          <text>🔄 置换（再摇一个新蛋）</text>
        </view>
        <view v-if="canTierUpNow" class="pet-detail__btn pet-detail__btn--danger pet-detail__btn--block press" @tap="onTierUp">
          <text>升 {{ nextTierLabel }} 阶 ⬆</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script>
import { petApi } from '@/api/pet'
import { pointsApi } from '@/api/points'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'

// 与 admin /shared/constants 对齐的 slot 常量
const PET_ITEM_SLOTS = ['background', 'hat', 'scarf', 'clothes', 'accessory', 'halo']
const PET_ITEM_SLOT_LABELS = {
  background: '背景', hat: '帽子', scarf: '围巾', clothes: '衣服', accessory: '配饰', halo: '光环'
}
const TIER_COLOR = { C: '#909399', B: '#67C23A', A: '#E6A23C', S: '#F56C6C' }
const SPECIES_EMOJI = {
  cat_orange: '🐱', dog_puppy: '🐶', rabbit_white: '🐰', hamster_gold: '🐹',
  fox_red: '🦊', panda_baby: '🐼', penguin_baby: '🐧', owl_horned: '🦉',
  wolf_arctic: '🐺', deer_white: '🦌', hawk_red: '🦅', dolphin_blue: '🐬',
  dragon_emperor: '🐉', phoenix_fire: '🔥', unicorn_rainbow: '🦄', griffin_gold: '🦅'
}

export default {
  data() {
    return {
      loading: true,
      pet: null,
      petBlockReason: '',
      species: null,
      itemMap: {},
      consumableMap: {},
      points: null,
      speciesSvgSrc: '',  // 保留兼容;新版主图走 species record 的 v-html
      // 2026-07-04 改: backgroundItem 从 computed 改 data + watch
      // 原因: Vue 3 dev mode 报 "Property backgroundItem was accessed during render but is not defined on instance",
      //   即使是 computed 也会触发;猜测与 line 53 `:style="{ background: tierColor }"` 的 'background' 简写冲突解析路径
      // 改为 data + watch,绕开 Vue 编译器对 computed 在模板字符串里的特殊处理
      backgroundItem: null,
      // 2026-07-03 破壳特效 (参考 admin PetClassroomDisplay)
      // 阶段: idle → hammer → cracks → shake → gold → reveal (后端 alive 切换)
      hatchPhase: 'idle',
      hatchActive: false,
      hatchTimers: []
    }
  },
  computed: {
    PET_ITEM_SLOTS() { return PET_ITEM_SLOTS },
    PET_ITEM_SLOT_LABELS() { return PET_ITEM_SLOT_LABELS },

    tierColor() {
      const t = (this.pet?.tier || this.pet?.eggTier || 'C').toUpperCase()
      return TIER_COLOR[t] || TIER_COLOR.C
    },

    speciesEmoji() {
      return SPECIES_EMOJI[this.pet?.species] || '🐾'
    },

    speciesName() {
      // 优先 speciesRecord.name (例如 "橘猫"), fallback 到 emoji 名字
      return this.species?.name || ''
    },

    expPercent() {
      if (!this.pet) return 0
      const next = this.pet.nextExpToLevel
      if (!next) return 100
      return Math.min(100, Math.round((this.pet.experience / next) * 100))
    },

    hungerPercent() {
      if (!this.pet) return 0
      return Math.min(100, Math.round((this.pet.currentHunger / this.pet.maxHunger) * 100))
    },

    hungerDecayMinutes() {
      // 与 admin 对齐: 默认 60 分钟 -1; 若 species 有声明则覆盖
      const v = this.pet?.speciesRecord?.hungerDecayMinutes || this.species?.hungerDecayMinutes || 60
      return Number(v) || 60
    },

    hungerMinutesLeft() {
      if (!this.pet || this.pet.state !== 'alive') return null
      return Math.max(0, (this.pet.currentHunger || 0) * this.hungerDecayMinutes)
    },

    canTierUpNow() {
      if (!this.pet || this.pet.state !== 'alive') return false
      if (this.pet.level < 10) return false  // 简化为 Lv.10
      if ((this.pet.experience || 0) < (this.pet.tierUpThreshold || 0)) return false
      if ((this.pet.tier || '').toUpperCase() === 'S') return false
      return true
    },

    nextTierLabel() {
      const order = ['C', 'B', 'A', 'S']
      const idx = order.indexOf((this.pet?.tier || '').toUpperCase())
      return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : ''
    },

    unlockedEntriesBySlot() {
      const out = {}
      for (const slot of PET_ITEM_SLOTS) out[slot] = []
      const unlocked = this.pet?.unlocked || {}
      for (const slot of PET_ITEM_SLOTS) {
        const arr = Array.isArray(unlocked[slot]) ? unlocked[slot] : []
        out[slot] = arr.map((key) => {
          const meta = this.itemMap[key] || {}
          return {
            key,
            name: meta.name || key,
            url: (meta.imageFile && meta.imageFile.url) || '',
            // 2026-07-04: 统一走 svgContent + <view class="pet-detail__svg-wrap" v-html>,
            //   跟 admin PetEquipmentOverlay 同源 (admin 已验证 work)
            svgContent: meta.svgContent || ''
          }
        })
      }
      return out
    },

    // 装备叠加层视觉: 已装备项的 url + slot + svg (background slot 在模板里独立铺满 stage)
    equipmentLayers() {
      const equipped = this.pet?.equipped || {}
      return PET_ITEM_SLOTS
        .filter((slot) => slot !== 'background')  // 2026-07-04 background 走专门 stage-bg 容器,不叠在宠物上
        .filter((slot) => equipped[slot])
        .map((slot) => {
          const key = equipped[slot]
          const meta = this.itemMap[key] || {}
          return {
            slot,
            key,
            url: (meta.imageFile && meta.imageFile.url) || '',
            // 2026-07-04: 走 v-html 渲染 svg (跟 admin PetEquipmentOverlay 同款),
            //   之前试 base64 data URI + <image> 在 SVG defs/linearGradient 渲染丢失,
            //   改回 v-html + :deep(svg) CSS 缩放, admin 已验证 work
            svgContent: meta.svgContent || ''
          }
        })
    },

    // background slot 独立 — 铺满整个 stage (跟 admin .pet-display-bg 同款坐标)
    // 2026-07-04: 移到 data + watch (上方); Vue 3 dev mode 偶尔对 computed 报 not defined,改写更稳

    consumableEntries() {
      const tier = (this.pet?.tier || this.pet?.eggTier || '').toUpperCase()
      const out = []
      for (const [key, c] of Object.entries(this.consumableMap)) {
        if (c.isActive === false) continue
        if (c.applicableTier && c.applicableTier !== 'all' && c.applicableTier !== tier) continue
        const cfg = (c.perTier && (c.perTier[tier] || c.perTier.all)) || null
        const priceForTier = cfg ? cfg.pointCost : null
        const hungerRestore = cfg ? cfg.hungerRestore : 0
        const expGain = cfg ? cfg.expGain : 0
        if (priceForTier == null) continue
        out.push({
          key,
          name: c.name,
          // 2026-07-04 重做: 直接 svgContent + v-html (跟 admin chip-svg 同款)
          svgContent: c.svgContent || '',
          url: c.imageFile?.url || '',
          priceForTier,
          hungerRestore,
          expGain
        })
      }
      return out
    }
  },
  watch: {
    pet: {
      immediate: true,
      handler() { this._recomputeBackground() }
    },
    itemMap: {
      deep: true,
      handler() { this._recomputeBackground() }
    }
  },
  onShow() {
    this.load()
  },
  onUnload() {
    clearInterval(this._pollTimer)
    this.clearHatchTimers()
  },
  methods: {
    // 2026-07-04: backgroundItem 重新计算 (data + watch 模式)
    _recomputeBackground() {
      const equipped = (this.pet && this.pet.equipped) || {}
      const key = equipped.background
      if (!key) {
        this.backgroundItem = null
        return
      }
      const meta = this.itemMap[key] || {}
      if (!meta.svgContent) {
        this.backgroundItem = null
        return
      }
      this.backgroundItem = { key, svgContent: meta.svgContent }
    },

    formatTimeLeft(minutes) {
      if (minutes == null) return '—'
      if (minutes < 60) return `${minutes} 分钟`
      if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} 小时`
      return `${(minutes / 60 / 24).toFixed(1)} 天`
    },

    // 2026-07-04: SVG → data URI (base64), 用 <image :src> 渲染更稳定
    // v-html 在 uni-app H5 偶尔丢内容 (Vue 把内联 SVG 当字符串, 不注入 <svg> 元素)
    _svgDataUri(svg) {
      if (!svg) return ''
      try {
        if (typeof btoa === 'function') {
          return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
        }
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
      } catch (e) {
        return ''
      }
    },

    async load() {
      this.loading = true
      try {
        const r = await petApi.me()
        const data = r?.pet || r?.data?.pet || null
        if (data && data.noEnrollment) {
          this.pet = null
          this.petBlockReason = 'notEnrolled'
        } else {
          this.pet = data
          this.petBlockReason = ''
        }
        // 独立积分拉取, 不阻塞主流程
        pointsApi.me().then((rp) => { this.points = rp?.balance ?? null }).catch(() => { this.points = null })
        // 物种信息 (用于 svgContent)
        if (this.pet?.species) {
          try {
            const sr = await petApi.species()
            const list = sr?.items || sr || []
            this.species = list.find((x) => x.key === this.pet.species) || null
            if (this.species?.svgContent) {
              // 2026-07-04: 走 helper, base64 比 utf8 更稳
              this.speciesSvgSrc = this._svgDataUri(this.species.svgContent)
            }
            this.pet.speciesRecord = this.species  // 给 hungerDecayMinutes 用
          } catch (_) {}
        }
        // catalog: items + consumables
        await this.loadCatalog()
      } catch (e) {
        console.warn('[petDetail.load]', e)
        this.pet = null
      } finally {
        this.loading = false
      }
    },

    async loadCatalog() {
      // 拉一次 catalog, 缓存到本地
      // 2026-07-03 修: 后端 /pet/items 返回 {items: {hat:{items:[]}, scarf:{items:[]}, ...}, pet}
      //   这是按 slot 分组的字典, 不是直接的数组. 适配一下:
      // 2026-07-04 修: 之前 `if (it.unlocked !== true) continue` 把所有该 slot 的 item 都挡掉,
      //   因为后端 listCatalog 给所有 isActive 的 item 都打 unlocked 标志, 但凡有一项解锁条件失败
      //   (如 unlockLevel>pet.level) 该 item 不入 unlocked 数组. 这导致 pet.equipped[slot] / unlocked[slot]
      //   数组里的 key 完全找不到对应 meta, chip + 装备叠加层全部 svgDataUri="" → 走 🎁 emoji fallback.
      // 现在全部入库, 让 chip + 装备叠加层走自身 equipped/unlocked 数组过滤渲染:
      try {
        const ir = await petApi.items({ pageSize: 100 })
        const bySlot = ir?.items || {}
        const map = {}
        for (const slotKey of Object.keys(bySlot)) {
          const group = bySlot[slotKey]
          const list = Array.isArray(group?.items) ? group.items : []
          for (const it of list) {
            map[it.key] = {
              name: it.name,
              slot: it.slot || slotKey,
              svgContent: it.svgContent || '',
              imageFile: it.imageFile || null
            }
          }
        }
        this.itemMap = map
      } catch (e) {
        this.itemMap = {}
      }
      // 2026-07-04: itemMap 填完后立即计算 backgroundItem (避免等 watch)
      this._recomputeBackground()
      try {
        const cr = await petApi.consumables({ pageSize: 100 }).catch(() => null)
        // 注意: C 端 pet routes 没有 consumables 列表, 仅 admin 有
        // 兜底: consumableMap 留空, 食物区直接隐藏
        const items = (cr && (cr.items || cr)) || []
        const map = {}
        for (const c of items) {
          map[c.key] = {
            name: c.name,
            applicableTier: c.applicableTier,
            perTier: c.perTier || {},
            isActive: c.isActive,
            svgContent: c.svgContent || '',
            imageFile: c.imageFile || null
          }
        }
        this.consumableMap = map
      } catch (e) {
        this.consumableMap = {}
      }
    },

    async onHatch() {
      if (this.hatchActive) return
      this.hatchActive = true
      haptic.tap()
      // 5 阶段动画 (参考 admin PetClassroomDisplay):
      // 0s 锤子砸下 → 0.4s 裂痕 → 1s 晃动 → 2s 金光 (蛋渐隐) → 3s reveal + 复位
      const setP = (phase, ms) => this.hatchTimers.push(setTimeout(() => { this.hatchPhase = phase }, ms))
      setP('hammer', 0)
      setP('cracks', 400)
      setP('shake',  1000)
      setP('gold',   2000)
      // API 并行调用 (通常 < 1s 已回), UI 数据更新在 gold 阶段结束
      try {
        const r = await petApi.hatch({})
        // hatch 后通常 pet.state='alive', 也可能仍在 egg (如失败), 让 fetch 兜底
        const newPet = r?.pet || r?.data?.pet
        if (newPet) this.pet = newPet
      } catch (e) {
        toast.error(e?.message || '破壳失败,请重试')
        this.clearHatchTimers()
        this.hatchPhase = 'idle'
        this.hatchActive = false
        return
      }
      this.hatchTimers.push(setTimeout(() => {
        this.load()  // 兜底刷新: 拿最新数据
        this.hatchPhase = 'idle'
        this.hatchActive = false
      }, 3000))
    },

    clearHatchTimers() {
      this.hatchTimers.forEach((t) => clearTimeout(t))
      this.hatchTimers = []
    },

    async onFeed(key) {
      const c = this.consumableMap[key]
      const cost = c?.perTier?.[(this.pet?.tier || '').toUpperCase()]?.pointCost ?? 0
      if (this.points != null && this.points < cost) {
        toast.warn(`积分不足: 当前 ${this.points}, 需要 ${cost}`)
        return
      }
      haptic.tap()
      try {
        await petApi.feed({ consumableKey: key })
        toast.success('喂食成功')
        await this.load()
      } catch (e) {
        toast.error(e?.message || '喂食失败')
      }
    },

    async onToggleEquip(slot, key) {
      if (!this.pet?._id) return
      const equipped = this.pet.equipped || {}
      const next = equipped[slot] === key ? null : key
      haptic.tap()
      try {
        await petApi.equip({ slot, itemKey: next })
        toast.success(next ? '已装备' : '已卸下')
        await this.load()
      } catch (e) {
        toast.error(e?.message || '装备失败')
      }
    },

    async onSwap() {
      // 2026-07-03: 加弹框确认 — 置换会扣积分并出新蛋
      const tier = (this.pet?.tier || this.pet?.eggTier || 'C').toUpperCase()
      const res = await uni.showModal({
        title: '置换确认',
        content: `当前 ${tier} 阶宠物将转换为新蛋（仍保持 ${tier} 阶），需要扣一定积分。\n确定要置换吗？`,
        confirmText: '确认置换',
        cancelText: '取消',
        confirmColor: '#FF8A65'
      })
      if (!res.confirm) return
      haptic.tap()
      try {
        await petApi.swapEgg({})
        toast.success('已置换')
        await this.load()
      } catch (e) {
        toast.error(e?.message || '置换失败')
      }
    },

    async onTierUp() {
      if (!this.canTierUpNow) return
      const tier = this.nextTierLabel
      const res = await uni.showModal({
        title: '升阶确认',
        content: `确认将宠物升到 ${tier} 阶？升阶后当前种类保留，变为新阶蛋。`,
        confirmText: `升 ${tier} 阶`,
        cancelText: '取消',
        confirmColor: '#FF6B6B'
      })
      if (!res.confirm) return
      haptic.tap()
      try {
        await petApi.tierDown({})  // tier-up 走 tier-down 接口
        toast.success(`已升到 ${tier} 阶`)
        await this.load()
      } catch (e) {
        toast.error(e?.message || '升阶失败')
      }
    },

    goBack() { uni.navigateBack({ delta: 1 }) },
    goEnroll() { uni.switchTab({ url: '/pages/tabbar/explore' }) },
    goAdopt() { uni.navigateTo({ url: '/pages/pet/adopt' }) },
    goEquip() { uni.navigateTo({ url: '/pages/pet/equip' }) },
    goShop() { uni.navigateTo({ url: '/pages/pet/shop' }) }
  }
}
</script>

<style lang="scss" scoped>
.pet-detail {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFE4D3 0%, #FFFAF5 60%);
  padding-bottom: $spacing-xl;
  padding-top: env(safe-area-inset-top, 0);

  &__loading,
  &__empty {
    padding: $spacing-2xl $spacing-lg;
    text-align: center;
    color: $text-secondary;
  }
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: $spacing-md;
    min-height: 60vh;
  }
  &__empty-emoji { font-size: 96rpx; }
  &__empty-title { font-size: $font-xl; font-weight: $font-weight-bold; color: $text-primary; }
  &__empty-desc { font-size: $font-sm; color: $text-secondary; }

  &__top {
    display: flex;
    align-items: center;
    padding: $spacing-md $spacing-lg;
    gap: $spacing-sm;
  }
  &__back {
    width: 64rpx; height: 64rpx;
    flex-shrink: 0;
    background: $bg-card;
    border-radius: 50%;
    @include flex-center;
    box-shadow: $shadow-card;
    font-size: 48rpx;
    color: $text-secondary;
    cursor: pointer;
  }
  &__title-wrap {
    flex: 1;
    @include flex-center;
    gap: $spacing-xs;
    min-width: 0;
  }
  &__title-name {
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $text-primary;
    max-width: 50%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__title-sep {
    font-size: $font-md;
    color: $text-tertiary;
  }
  &__title-species {
    font-size: $font-lg;
    color: $primary;
    font-weight: $font-weight-semibold;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__title-spacer {
    width: 64rpx; height: 64rpx;
    flex-shrink: 0;
  }

  &__subbar {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    padding: 0 $spacing-lg $spacing-md;
    flex-wrap: wrap;
  }
  &__tier {
    padding: 4rpx 16rpx;
    border-radius: $radius-pill;
    color: #fff;
    font-size: $font-sm;
    font-weight: $font-weight-semibold;
  }
  &__lv {
    font-size: $font-md;
    color: $primary;
    font-weight: $font-weight-semibold;
  }
  &__state {
    font-size: $font-sm;
    padding: 2rpx 12rpx;
    border-radius: $radius-pill;
    &--egg { background: $warning-light; color: $warning; }
    &--alive { background: rgba(124, 217, 183, 0.15); color: $accent; }
  }
  &__points {
    margin-left: auto;
    font-size: $font-sm;
    color: $gold;
    font-weight: $font-weight-semibold;
  }

  &__stage {
    margin: $spacing-lg $spacing-lg;
    background: $bg-card;
    border-radius: $radius-lg;
    box-shadow: $shadow-card;
    height: 520rpx;
    overflow: hidden;
    position: relative;
    @include flex-center;
  }
  &__egg {
    width: 100%;
    height: 100%;
    @include flex-center;
    flex-direction: column;
    gap: $spacing-md;
    cursor: pointer;
  }
  &__egg-emoji {
    font-size: 240rpx;
    filter: drop-shadow(0 12rpx 24rpx rgba(255, 138, 101, 0.25));
    animation: float 3s ease-in-out infinite;
  }
  &__egg-cta {
    color: $primary;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
  }

  // 2026-07-03 破壳特效 (参考 admin PetClassroomDisplay 5 阶段)
  &__egg-stage {
    position: relative;
    width: 100%;
    height: 100%;
    @include flex-center;
    flex-direction: column;
    cursor: pointer;
    overflow: visible;
  }
  &__egg-frame {
    position: relative;
    width: 320rpx;
    height: 320rpx;
    @include flex-center;
    flex-direction: column;
  }
  &__egg-frame .pet-detail__egg-emoji {
    font-size: 240rpx;
  }
  // 蛋在 gold 阶段渐隐 + 微放大
  &__egg-frame.fading {
    animation: egg-fade-in-gold 1s ease-out forwards;
  }
  @keyframes egg-fade-in-gold {
    0%   { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.15); }
  }
  // 裂痕 SVG (绝对覆盖在蛋上)
  &__egg-cracks {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    animation: crack-appear 0.3s ease-out;
  }
  &__egg-cracks.deep { filter: drop-shadow(0 0 8rpx rgba(255, 255, 200, 0.8)); }
  @keyframes crack-appear {
    from { opacity: 0; transform: scale(0.85); }
    to   { opacity: 1; transform: scale(1); }
  }
  // shake 阶段: 蛋晃动
  &__egg-stage.hatch-shake .pet-detail__egg-frame {
    animation: hatch-shake 0.12s ease-in-out infinite;
  }
  @keyframes hatch-shake {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    20% { transform: translate(-4rpx, -2rpx) rotate(-2deg); }
    40% { transform: translate(5rpx, 1rpx)  rotate(2deg); }
    60% { transform: translate(-3rpx, 3rpx) rotate(-1deg); }
    80% { transform: translate(3rpx, -2rpx) rotate(1deg); }
  }
  // hammer 锤子: T+0s 砸下
  &__hatch-hammer {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translate(-50%, -300rpx) rotate(-30deg);
    font-size: 80rpx;
    opacity: 0;
    pointer-events: none;
    z-index: 10;
    filter: drop-shadow(0 4rpx 8rpx rgba(0, 0, 0, 0.5));
  }
  &__hatch-hammer.active {
    animation: hammer-fall 0.4s ease-in forwards;
  }
  @keyframes hammer-fall {
    0%   { transform: translate(-50%, -300rpx) rotate(-30deg); opacity: 0; }
    20%  { transform: translate(-50%, -200rpx) rotate(-25deg); opacity: 1; }
    60%  { transform: translate(-50%, 0rpx) rotate(0deg); opacity: 1; }
    80%  { transform: translate(-50%, 0rpx) rotate(0deg); opacity: 1; }
    100% { transform: translate(-50%, 200rpx) rotate(15deg); opacity: 0; }
  }
  // gold 金光: T+2s 扩散
  &__hatch-gold {
    position: absolute;
    inset: -20%;
    pointer-events: none;
    background: radial-gradient(circle at 50% 50%,
      rgba(255, 240, 130, 0.95) 0%,
      rgba(255, 200, 60, 0.7) 20%,
      rgba(255, 180, 40, 0.4) 45%,
      transparent 70%);
    opacity: 0;
    mix-blend-mode: screen;
    border-radius: 50%;
    z-index: 5;
  }
  &__hatch-gold.active {
    animation: gold-flash 1s ease-out forwards;
  }
  @keyframes gold-flash {
    0%   { opacity: 0; transform: scale(0.4); }
    30%  { opacity: 1; transform: scale(1.0); }
    100% { opacity: 0; transform: scale(1.8); }
  }

  &__pet {
    width: 100%;
    height: 100%;
    position: relative;
    @include flex-center;
    overflow: hidden;
    cursor: pointer;
  }
  &__pet-svg {
    width: 90%;
    height: 90%;
    object-fit: contain;
  }
  &__pet-emoji {
    font-size: 240rpx;
  }
  &__equips {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  &__equip-layer {
    position: absolute;
    pointer-events: none;
  }
  &__equip-layer--hat       { top: -2%;  left: 50%; transform: translateX(-50%); width: 50%; height: 32%; z-index: 3; }
  &__equip-layer--scarf     { top: 38%;  left: 50%; transform: translateX(-50%); width: 55%; height: 16%; z-index: 4; }
  &__equip-layer--clothes   { top: 50%;  left: 50%; transform: translateX(-50%); width: 70%; height: 36%; z-index: 2; }
  &__equip-layer--accessory { top: 36%;  left: 50%; transform: translateX(-50%); width: 45%; height: 18%; z-index: 4; }
  &__equip-layer--halo      { top: -4%;  left: 50%; transform: translateX(-50%); width: 75%; height: 30%; opacity: 0.85; z-index: 2; }
  // 2026-07-04 重做: SVG-wrap 容器 + :deep(svg) (uni-app H5 走 v-html)
  &__svg-wrap { width: 100%; height: 100%; display: block; }
  &__svg-wrap :deep(svg) { width: 100%; height: 100%; display: block; object-fit: contain; filter: drop-shadow(0 2rpx 4rpx rgba(0,0,0,0.25)); }
  // 2026-07-04: 背景层独立铺满整个 stage (跟 admin .pet-display-bg 同款)
  &__stage-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    opacity: 0.95;
  }
  &__stage-bg .pet-detail__svg-wrap,
  &__stage-bg :deep(svg) { width: 100%; height: 100%; display: block; object-fit: cover; }

  &__stats {
    margin: 0 $spacing-lg $spacing-lg;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-lg;
    box-shadow: $shadow-card;
  }
  &__stat { margin-bottom: $spacing-md; }
  &__stat:last-child { margin-bottom: 0; }
  &__stat-head {
    @include flex-between;
    margin-bottom: 6rpx;
  }
  &__stat-label { font-size: $font-sm; color: $text-secondary; }
  &__stat-val { font-size: $font-sm; color: $text-primary; font-weight: $font-weight-semibold; }
  &__bar {
    height: 16rpx;
    background: $divider-light;
    border-radius: $radius-pill;
    overflow: hidden;
  }
  &__bar-fill {
    height: 100%;
    border-radius: $radius-pill;
    transition: width $transition-base;
  }
  &__bar-fill--exp {
    background: linear-gradient(90deg, #FFD04B, #F5C148);
  }
  &__bar-fill--hunger {
    background: linear-gradient(90deg, $primary-light, $primary);
  }
  &__hint {
    margin-top: 6rpx;
    font-size: $font-xs;
    color: $text-tertiary;
    display: block;
    &--gold { color: $gold; font-weight: $font-weight-semibold; }
  }

  &__actions {
    @include flex-between;
    margin: 0 $spacing-lg $spacing-lg;
    gap: $spacing-sm;
  }
  // 2026-07-03 底部 CTA 区 (置底 sticky, 主按钮宽度 100%)
  // 2026-07-04 修: 加 box-sizing:border-box 避免 padding 把按钮推出右边
  &__bottom-cta {
    margin: $spacing-lg $spacing-lg ($spacing-lg + env(safe-area-inset-bottom, 0));
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    box-sizing: border-box;
    max-width: 100%;
  }
  &__btn {
    box-sizing: border-box;
    max-width: 100%;
    padding: $spacing-md;
    border-radius: $radius-pill;
    text-align: center;
    font-weight: $font-weight-semibold;
    cursor: pointer;
    transition: all $transition-fast;
    &--block {
      display: block;
      width: 100%;
      font-size: $font-lg;
      padding: $spacing-md $spacing-lg;
    }
  }
  &__btn--primary {
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    box-shadow: $shadow-button;
  }
  &__btn--danger {
    background: linear-gradient(135deg, $warning, #FF9B7E);
    color: #fff;
    box-shadow: 0 6rpx 16rpx rgba(255, 107, 107, 0.32);
    animation: pulse-glow 1.5s ease-in-out infinite;
  }
  &__btn--ghost {
    background: $bg-page;
    color: $text-secondary;
    border: 1rpx solid $divider;
  }

  &__section {
    margin: 0 $spacing-lg $spacing-lg;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-lg;
    box-shadow: $shadow-card;
  }
  &__section-title {
    @include flex-between;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }
  &__section-more {
    font-size: $font-sm;
    color: $primary;
    cursor: pointer;
    &--points { color: $gold; }
  }
  &__slot-row {
    @include flex-between;
    margin-bottom: $spacing-xs;
  }
  &__slot-label {
    width: 80rpx;
    font-size: $font-sm;
    color: $text-secondary;
    flex-shrink: 0;
  }
  &__slot-scroller {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
  }
  &__chips {
    display: inline-flex;
    align-items: center;
    gap: $spacing-xs;
    padding: 0 $spacing-xs;
  }
  &__chip {
    width: 64rpx;
    height: 64rpx;
    border-radius: $radius-sm;
    background: $bg-page;
    border: 2rpx solid transparent;
    @include flex-center;
    cursor: pointer;
    transition: all $transition-fast;
    flex-shrink: 0;
    overflow: hidden;
    &.framed {
      border-color: $accent;
      background: rgba(124, 217, 183, 0.12);
    }
  }
  // 2026-07-04: chip 用 svg-wrap + :deep(svg) 缩放 (替代 __chip-img)
  &__chip .pet-detail__svg-wrap,
  &__chip :deep(svg) { width: 56rpx; height: 56rpx; object-fit: contain; }
  &__chip-emoji { font-size: 32rpx; }
  &__slot-empty { font-size: $font-xs; color: $text-tertiary; padding-left: $spacing-xs; }

  &__food-scroller {
    overflow: hidden;
    white-space: nowrap;
  }
  &__food-row {
    display: inline-flex;
    align-items: center;
    gap: $spacing-sm;
    padding: 0 $spacing-xs;
  }
  &__food-chip {
    width: 160rpx;
    background: $bg-page;
    border-radius: $radius-md;
    padding: $spacing-sm $spacing-xs;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    cursor: pointer;
    flex-shrink: 0;
    transition: all $transition-fast;
    &.unaffordable { opacity: 0.4; cursor: not-allowed; }
  }
  &__food-thumb {
    width: 80rpx;
    height: 80rpx;
    @include flex-center;
    background: $bg-card;
    border-radius: $radius-sm;
    overflow: hidden;
  }
  // 2026-07-04: 食物 thumb 内嵌 svg-wrap 缩放 (跟 admin chip-svg 同款)
  &__food-thumb .pet-detail__svg-wrap,
  &__food-thumb :deep(svg) { width: 64rpx; height: 64rpx; object-fit: contain; }
  &__food-emoji { font-size: 48rpx; }
  &__food-name { font-size: $font-sm; font-weight: $font-weight-semibold; color: $text-primary; }
  &__food-meta { font-size: $font-xs; color: $text-tertiary; text-align: center; }
  &__food-price { color: $gold; font-weight: $font-weight-semibold; margin-right: 4rpx; }
  &__food-eff { color: $text-secondary; }
}
</style>
