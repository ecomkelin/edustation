<!--
  PetDetail - C 端宠物详情页（2026-07-15 重构：多宠 + 无等阶 + 无装饰）
  设计：
    - 顶部：孩子名 + 默认宠物种类
    - 副信息：Lv + 状态
    - 主区：默认宠物展示（蛋态破壳动画 / 已破壳 species 视频，9:16 裁 1:1）
    - 数据条：经验 / 饱腹（含衰减倒计时）
    - 食物 chip 区（点击喂食，扣积分）
    - 其他领养的宠物区（视频卡；点「设为默认」切主图 / 蛋可破壳）+ 领养按钮
  接口：
    - GET /pet/list（含 speciesRecord / nextExpToLevel / maxLevel）
    - GET /pet/consumables
    - GET /points/me
    - POST /pet/:petId/hatch, /pet/:petId/feed, /pet/:petId/set-default, /pet/adopt
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

    <view v-else-if="!pet" class="pet-detail__empty press" @tap="onAdopt">
      <text class="pet-detail__empty-emoji">🥚</text>
      <text class="pet-detail__empty-title">领养孩子的第一位小伙伴</text>
      <text class="pet-detail__empty-desc">点击领养一个蛋 ›</text>
    </view>

    <template v-else>
      <!-- 顶部条 -->
      <view class="pet-detail__top">
        <view class="pet-detail__back" @tap="goBack"><text>‹</text></view>
        <view class="pet-detail__title-wrap">
          <text class="pet-detail__title-name">{{ pet.studentName || '我的宠物' }}</text>
          <text class="pet-detail__title-sep">·</text>
          <text class="pet-detail__title-species">{{ speciesName || pet.species || '待破壳' }}</text>
        </view>
        <view class="pet-detail__title-spacer" />
      </view>

      <!-- 副信息条 -->
      <view class="pet-detail__subbar">
        <text class="pet-detail__lv">Lv.{{ pet.level || 1 }}</text>
        <text v-if="pet.state === 'egg'" class="pet-detail__state pet-detail__state--egg">🥚 待破壳</text>
        <text v-else class="pet-detail__state pet-detail__state--alive">✨ 存活</text>
        <view class="pet-detail__points" v-if="points != null">💰 {{ points }}</view>
        <!-- 2026-07-18 移除: C 端主区顶「弃养」按钮 (用户在其它宠物卡上仍可弃养非默认宠物, 主区默认宠物的弃养由 admin 在管理端处理) -->
      </view>

      <!-- 主图区（默认宠物） -->
      <view class="pet-detail__stage">
        <!-- 蛋态 + 破壳特效
             2026-07-18 第五期: 蛋态底层 = eggVisual (species 本体视频/svg, server 端解析)
             emoji 缩小到左上角半透明 overlay, 破壳动画保留 -->
        <view v-if="pet.state === 'egg' || hatchActive" class="pet-detail__egg-stage" :class="`hatch-${hatchPhase}`">
          <view class="pet-detail__egg-frame" :class="{ fading: hatchPhase === 'gold' }" @tap="onHatch">
            <!-- 底层: species 本体视频/svg (egG 不用 levelVisuals fallback) -->
            <view v-if="currentEggVisual && currentEggVisual.visualType === 'svg' && currentEggVisual.svgContent" class="pet-detail__svg-wrap pet-detail__egg-base" v-html="currentEggVisual.svgContent" />
            <video
              v-else-if="currentEggVisual && currentEggVisual.visualType === 'video' && currentEggVisual.videoFile && currentEggVisual.videoFile.url"
              :src="currentEggVisual.videoFile.url"
              :key="`egg-base-${currentEggVisual.videoFile._id || currentEggVisual.videoFile.id || ''}`"
              autoplay loop muted playsinline
              :controls="false"
              :show-play-btn="false"
              :show-fullscreen-btn="false"
              class="pet-detail__pet-video pet-detail__egg-base"
            />
            <!-- emoji 缩到左上角半透明, 保留"未破壳"状态标识 -->
            <text class="pet-detail__egg-emoji pet-detail__egg-emoji--overlay">🥚</text>
            <!-- 裂纹 overlay (破壳动画过程中才显示) -->
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
          <view class="pet-detail__hatch-hammer" :class="{ active: hatchPhase === 'hammer' }">🔨</view>
          <view class="pet-detail__hatch-gold" :class="{ active: hatchPhase === 'gold' }"></view>
          <text v-if="hatchPhase === 'idle'" class="pet-detail__egg-cta">✨ 点击破壳看看 ›</text>
        </view>

        <!-- 已破壳：默认宠物本体（per-level override currentVisual → speciesRecord fallback → emoji）
             2026-07-16: server 端 decoratePet 已解析 currentVisual，前端读这一个字段即可 -->
        <view v-else class="pet-detail__pet">
          <view v-if="currentVisual && currentVisual.visualType === 'svg' && currentVisual.svgContent" class="pet-detail__svg-wrap" v-html="currentVisual.svgContent" />
          <video
            v-else-if="currentVisual && currentVisual.visualType === 'video' && currentVisual.videoFile && currentVisual.videoFile.url"
            :src="currentVisual.videoFile.url"
            :key="`${currentVisual.source}-${currentVisual.level}-${pet.level}`"
            autoplay loop muted playsinline
            :controls="false"
            :show-play-btn="false"
            :show-fullscreen-btn="false"
            class="pet-detail__pet-video"
          />
          <text v-else class="pet-detail__pet-emoji">{{ speciesEmoji }}</text>
        </view>

        <!-- 2026-07-18 第四期: 升级特效全屏遮罩 (一次性, 跨级时串行播放 Lv.X→Lv.X+1→...)
             暂停主图 currentVisual, 避免动画/视频互相抢声画 -->
        <view v-if="levelUpActive && currentLevelUpEffect" class="pet-detail__levelup" @tap.stop>
          <view class="pet-detail__levelup-backdrop" :class="{ fade: levelUpFading }" />
          <view class="pet-detail__levelup-content">
            <view v-if="currentLevelUpEffect.visualType === 'svg' && currentLevelUpEffect.svgContent"
                  class="pet-detail__levelup-svg"
                  :class="{ fade: levelUpFading }"
                  v-html="currentLevelUpEffect.svgContent" />
            <video
              v-else-if="currentLevelUpEffect.visualType === 'video' && currentLevelUpEffect.videoFile && currentLevelUpEffect.videoFile.url"
              :src="currentLevelUpEffect.videoFile.url"
              :key="`levelup-${levelUpIndex}-${currentLevelUpEffect.videoFile._id || currentLevelUpEffect.videoFile.id || ''}`"
              autoplay muted playsinline
              :controls="false"
              :show-play-btn="false"
              :show-fullscreen-btn="false"
              class="pet-detail__levelup-video"
              @ended="onLevelUpEffectEnded"
            />
            <view class="pet-detail__levelup-tip">
              <text class="pet-detail__levelup-lv">Lv.{{ currentLevelUpEffect.level }}</text>
              <text v-if="levelUpQueue.length > 1" class="pet-detail__levelup-progress">
                {{ levelUpIndex + 1 }}/{{ levelUpQueue.length }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 数据条 -->
      <view class="pet-detail__stats">
        <view class="pet-detail__stat">
          <view class="pet-detail__stat-head">
            <text class="pet-detail__stat-label">⭐ 经验</text>
            <text class="pet-detail__stat-val">{{ pet.nextExpToLevel != null ? `${pet.experience || 0}/${pet.nextExpToLevel}` : `满级 Lv.${pet.level}` }}</text>
          </view>
          <view class="pet-detail__bar">
            <view class="pet-detail__bar-fill pet-detail__bar-fill--exp" :style="{ width: expPercent + '%' }" />
          </view>
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

      <!-- 食物 chip 区 -->
      <view v-if="pet.state === 'alive' && consumableEntries.length" class="pet-detail__section">
        <view class="pet-detail__section-title">
          <text>🍖 食物 · 点击喂食</text>
          <text class="pet-detail__section-more pet-detail__section-more--points">💰 {{ points != null ? points : '?' }} 积分</text>
        </view>
        <scroll-view scroll-x class="pet-detail__food-scroller" show-scrollbar="false">
          <view class="pet-detail__food-row">
            <view
              v-for="c in consumableEntries"
              :key="c.key"
              class="pet-detail__food-chip"
              :class="{ unaffordable: points != null && points < c.pointCost }"
              @tap="onFeed(c.key)"
            >
              <view v-if="c.svgContent" class="pet-detail__food-thumb">
                <view class="pet-detail__svg-wrap" v-html="c.svgContent" />
              </view>
              <video
                v-else-if="c.visualType === 'video' && c.videoUrl"
                :src="c.videoUrl"
                :key="c.key"
                muted preload="metadata"
                :controls="false" :show-play-btn="false" :show-fullscreen-btn="false"
                class="pet-detail__food-video"
              />
              <text v-else class="pet-detail__food-emoji">🍖</text>
              <view class="pet-detail__food-name">{{ c.name }}</view>
              <view class="pet-detail__food-meta">
                <text class="pet-detail__food-price">{{ c.pointCost }} 积</text>
                <text class="pet-detail__food-eff">+{{ c.expGain }}exp +{{ c.hungerRestore }}饱</text>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- 其他领养的宠物区 -->
      <view class="pet-detail__section">
        <view class="pet-detail__section-title">
          <text>🐾 其他宠物（{{ pets.length }}/{{ MAX_PETS }}）</text>
          <text v-if="pets.length < MAX_PETS" class="pet-detail__section-more" @tap="onAdopt">+ 领养</text>
        </view>
        <view class="pet-detail__others">
          <view v-for="p in otherPets" :key="p._id" class="pet-detail__other-card">
            <view class="pet-detail__other-media">
              <!-- 2026-07-16: 读 currentVisual（per-level override 命中或 species fallback），server 端已解析 -->
              <video
                v-if="p.state === 'alive' && p.currentVisual && p.currentVisual.visualType === 'video' && p.currentVisual.videoFile && p.currentVisual.videoFile.url"
                :src="p.currentVisual.videoFile.url"
                :key="`other-${p._id}-${p.level}-${p.currentVisual.source}-${p.currentVisual.level}`"
                autoplay loop muted playsinline
                :controls="false" :show-play-btn="false" :show-fullscreen-btn="false"
                class="pet-detail__other-video"
              />
              <view v-else-if="p.state === 'alive' && p.currentVisual && p.currentVisual.svgContent" class="pet-detail__svg-wrap" v-html="p.currentVisual.svgContent" />
              <text v-else class="pet-detail__other-emoji">{{ p.state === 'egg' ? '🥚' : '🐾' }}</text>
            </view>
            <text class="pet-detail__other-name">{{ (p.speciesRecord && p.speciesRecord.name) || (p.state === 'egg' ? '待破壳' : p.species || '—') }} · Lv.{{ p.level }}</text>
            <view class="pet-detail__other-actions">
              <view class="pet-detail__other-btn" @tap="onSetDefault(p)">设为默认</view>
              <!-- 2026-07-16 学生端: 蛋必须先「设为默认」(主区顶蛋 @tap 破壳), 不在其它卡直接破壳 -->
              <!-- 2026-07-16 弃养 (C 端家长无密码, 走两步 modal 确认) -->
              <view v-if="pets.length > 1" class="pet-detail__other-btn pet-detail__other-btn--danger" @tap="onAbandon(p)">弃养</view>
            </view>
          </view>
          <!-- 2026-07-18 移除: 「+ 领养」入口卡 (admin 代领养已覆盖场景, C 端不再重复暴露入口) -->
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

const MAX_PETS = 5  // 2026-07-16: 与 shared/petConfig.MAX_PETS_PER_STUDENT 同步
// 2026-07-18 第四期: 升级特效播放常量
// - SVG 无 @ended, 用固定时长兜底 (实际生产 SVG 内可内嵌 SMIL/CSS 动画, 时长由 admin 控制)
// - FADE_MS: 单个 effect 离场淡出, 接下一个或关闭
const LEVEL_UP_SVG_DEFAULT_MS = 1800
const LEVEL_UP_FADE_MS = 250
const SPECIES_EMOJI = {
  cat_orange: '🐱', dog_puppy: '🐶', rabbit_white: '🐰', hamster_gold: '🐹',
  fox_red: '🦊', panda_baby: '🐼', penguin_baby: '🐧', owl_horned: '🦉',
  dragon_emperor: '🐉', phoenix_fire: '🔥', unicorn_rainbow: '🦄', griffin_gold: '🦅'
}

export default {
  data() {
    return {
      MAX_PETS,
      loading: true,
      pet: null,          // 默认宠物
      pets: [],           // 全部宠物
      petBlockReason: '',
      consumableMap: {},
      points: null,
      adopting: false,
      hatchPhase: 'idle',
      hatchActive: false,
      hatchTimers: [],
      // 2026-07-18 第四期: 升级特效队列
      // - levelUpActive: 是否处于升级播放状态 (暂停 currentVisual)
      // - levelUpQueue: server 返回的 levelUpEffects[] (按 fromLevel 升序, 已过滤 null)
      // - levelUpIndex: 当前播放的 effect 在队列中的位置
      // - levelUpFading: 离场淡出 (视频 ended / svg 定时器 到期后短暂淡出再切下一个或关闭)
      levelUpActive: false,
      levelUpQueue: [],
      levelUpIndex: 0,
      levelUpFading: false,
      levelUpTimers: []  // setTimeout 列表 (svg 兜底时长 + 队列衔接淡出)
    }
  },
  computed: {
    species() { return this.pet?.speciesRecord || null },
    // 2026-07-16: 当前等级形象（per-level override 命中或 species fallback），server 端 decoratePet 解析
    currentVisual() { return this.pet?.currentVisual || null },
    // 2026-07-18 第五期: 蛋态底层视觉 (species 本体视频/svg, 不走 fallback 链)
    currentEggVisual() { return this.pet?.eggVisual || null },
    // 2026-07-18 第四期: 当前正在播放的升级特效
    currentLevelUpEffect() {
      if (!this.levelUpActive) return null
      return this.levelUpQueue[this.levelUpIndex] || null
    },
    speciesEmoji() { return SPECIES_EMOJI[this.pet?.species] || '🐾' },
    speciesName() { return this.pet?.speciesRecord?.name || '' },
    otherPets() {
      return this.pets.filter(p => !this.pet || String(p._id) !== String(this.pet._id))
    },
    expPercent() {
      if (!this.pet) return 0
      const next = this.pet.nextExpToLevel
      if (next == null) return 100
      return Math.min(100, Math.round((this.pet.experience / next) * 100))
    },
    hungerPercent() {
      if (!this.pet) return 0
      return Math.min(100, Math.round((this.pet.currentHunger / this.pet.maxHunger) * 100))
    },
    hungerDecayMinutes() {
      const v = this.pet?.speciesRecord?.hungerDecayMinutes || 60
      return Number(v) || 60
    },
    hungerMinutesLeft() {
      if (!this.pet || this.pet.state !== 'alive') return null
      return Math.max(0, (this.pet.currentHunger || 0) * this.hungerDecayMinutes)
    },
    consumableEntries() {
      const out = []
      for (const [key, c] of Object.entries(this.consumableMap)) {
        if (c.isActive === false) continue
        out.push({
          key,
          name: c.name,
          visualType: c.visualType || '',
          svgContent: c.svgContent || '',
          videoUrl: c.videoFile?.url || '',
          pointCost: c.pointCost || 0,
          hungerRestore: c.hungerRestore || 0,
          expGain: c.expGain || 0
        })
      }
      return out
    }
  },
  onShow() {
    this.load()
  },
  onUnload() {
    this.clearHatchTimers()
    this.clearLevelUpTimers()
  },
  methods: {
    formatTimeLeft(minutes) {
      if (minutes == null) return '—'
      if (minutes < 60) return `${minutes} 分钟`
      if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} 小时`
      return `${(minutes / 60 / 24).toFixed(1)} 天`
    },

    async load() {
      this.loading = true
      try {
        const r = await petApi.list()
        if (r && r.noEnrollment) {
          this.pet = null
          this.pets = []
          this.petBlockReason = 'notEnrolled'
        } else {
          this.pets = r?.pets || []
          this.pet = r?.defaultPet || this.pets[0] || null
          this.petBlockReason = ''
        }
        pointsApi.me().then((rp) => { this.points = rp?.balance ?? null }).catch(() => { this.points = null })
        await this.loadConsumables()
      } catch (e) {
        console.warn('[petDetail.load]', e)
        this.pet = null
        this.pets = []
      } finally {
        this.loading = false
      }
    },

    async loadConsumables() {
      try {
        const cr = await petApi.consumables({ pageSize: 100 }).catch(() => null)
        const items = (cr && (cr.items || cr)) || []
        const map = {}
        for (const c of items) {
          map[c.key] = {
            name: c.name,
            isActive: c.isActive,
            pointCost: c.pointCost,
            hungerRestore: c.hungerRestore,
            expGain: c.expGain,
            visualType: c.visualType || '',
            svgContent: c.svgContent || '',
            videoFile: c.videoFile || null
          }
        }
        this.consumableMap = map
      } catch (e) {
        this.consumableMap = {}
      }
    },

    async onHatch() {
      if (this.hatchActive || !this.pet?._id) return
      this.hatchActive = true
      haptic.tap()
      const setP = (phase, ms) => this.hatchTimers.push(setTimeout(() => { this.hatchPhase = phase }, ms))
      setP('hammer', 0)
      setP('cracks', 400)
      setP('shake', 1000)
      setP('gold', 2000)
      // 2026-07-19: 破壳 = 升到 Lv.1, server hatch 现在返回 levelUpEffects (Lv.1 特效)
      // 金光阶段(2000ms)调 hatch API + 播升级特效, 让 Lv.1 特效覆盖在破壳金光上
      this.hatchTimers.push(setTimeout(async () => {
        try {
          const r = await petApi.hatch(this.pet._id)
          const effects = (Array.isArray(r?.levelUpEffects) ? r.levelUpEffects : []).filter(Boolean).filter((e) =>
            (e.visualType === 'svg' && e.svgContent) ||
            (e.visualType === 'video' && e.videoFile && (e.videoFile.url || e.videoFile._id || typeof e.videoFile === 'string'))
          )
          if (effects.length > 0 && !this.levelUpActive) {
            // 不 await, 让升级特效和破壳收尾动画并行
            this.playLevelUpEffects(effects)
          }
        } catch (e) {
          toast.error(e?.message || '破壳失败,请重试')
          this.clearHatchTimers()
          this.hatchPhase = 'idle'
          this.hatchActive = false
          if (e && (e.statusCode === 422 || /未报班/.test(e?.message || ''))) this.load()
        }
      }, 2000))
      this.hatchTimers.push(setTimeout(() => {
        this.load()
        this.hatchPhase = 'idle'
        this.hatchActive = false
      }, 3000))
    },

    clearHatchTimers() {
      this.hatchTimers.forEach((t) => clearTimeout(t))
      this.hatchTimers = []
    },

    async onFeed(key) {
      if (!this.pet?._id) return
      const c = this.consumableMap[key]
      const cost = c?.pointCost ?? 0
      if (this.points != null && this.points < cost) {
        toast.warn(`积分不足: 当前 ${this.points}, 需要 ${cost}`)
        return
      }
      haptic.tap()
      let result
      try {
        result = await petApi.feed(this.pet._id, { consumableKey: key })
      } catch (e) {
        toast.error(e?.message || '喂食失败')
        return
      }
      // 喂食成功 → 如有升级特效队列则播放; 否则直接 load + toast
      // 2026-07-18 第四期: 跨级按 fromLevel 升序串行播放 (server 端已排序, 空数组 = 无特效)
      const effects = Array.isArray(result?.levelUpEffects) ? result.levelUpEffects : []
      const filtered = effects.filter(Boolean).filter((e) =>
        (e.visualType === 'svg' && e.svgContent) ||
        // 2026-07-19: 兼容 ObjectId 字符串 (server populate 漏了的兜底, 同 admin)
        (e.visualType === 'video' && e.videoFile && (e.videoFile.url || e.videoFile._id || typeof e.videoFile === 'string'))
      )
      if (result?.levelUp && filtered.length > 0) {
        await this.playLevelUpEffects(filtered)
      } else {
        toast.success('喂食成功')
      }
      await this.load()
    },

    // 2026-07-18 第四期: 串行播放升级特效队列
    // - 视频: 监听 @ended 自然结束
    // - SVG: 固定 LEVEL_UP_SVG_DEFAULT_MS 后推进 (uni-app SVG 无 ended 事件)
    // - 每个 effect 结束淡出 250ms 后进入下一个; 最后一个结束后关遮罩
    async playLevelUpEffects(effects) {
      if (!effects || effects.length === 0) return
      this.clearLevelUpTimers()
      this.levelUpQueue = effects
      this.levelUpIndex = 0
      this.levelUpActive = true
      this.levelUpFading = false
      // 给每个 svg effect 兜底定时器 (避免某些 SVG 无动画导致不结束)
      for (let i = 0; i < effects.length; i++) {
        const e = effects[i]
        if (e && e.visualType === 'svg') {
          this.levelUpTimers.push(setTimeout(() => this.onLevelUpEffectEnded(), LEVEL_UP_SVG_DEFAULT_MS))
        }
      }
      // resolve 当所有 effect 播放完毕 (最后一个 effect ended + 淡出时长)
      return new Promise((resolve) => {
        this._levelUpResolve = resolve
      })
    },
    onLevelUpEffectEnded() {
      if (!this.levelUpActive) return
      this.clearLevelUpTimers()  // 清掉 svg 兜底定时器 (防止重复推进)
      this.levelUpFading = true
      // 淡出 250ms 后: 推进 index 或关闭遮罩
      this.levelUpTimers.push(setTimeout(() => {
        const next = this.levelUpIndex + 1
        if (next < this.levelUpQueue.length) {
          this.levelUpIndex = next
          this.levelUpFading = false
          // 下一个 effect 是 svg 时启动兜底定时器
          const e = this.levelUpQueue[next]
          if (e && e.visualType === 'svg') {
            this.levelUpTimers.push(setTimeout(() => this.onLevelUpEffectEnded(), LEVEL_UP_SVG_DEFAULT_MS))
          }
        } else {
          // 队列全部播放完毕
          this.levelUpActive = false
          this.levelUpQueue = []
          this.levelUpIndex = 0
          this.levelUpFading = false
          toast.success('升级成功')
          const r = this._levelUpResolve
          this._levelUpResolve = null
          if (r) r()
        }
      }, LEVEL_UP_FADE_MS))
    },
    clearLevelUpTimers() {
      this.levelUpTimers.forEach((t) => clearTimeout(t))
      this.levelUpTimers = []
    },

    async onSetDefault(p) {
      if (!p?._id) return
      haptic.tap()
      try {
        await petApi.setDefault(p._id)
        toast.success('已设为默认宠物')
        await this.load()
      } catch (e) {
        toast.error(e?.message || '设置失败')
      }
    },

    async onAdopt() {
      if (this.adopting) return
      if (this.pets.length >= MAX_PETS) {
        toast.warn(`最多领养 ${MAX_PETS} 只`)
        return
      }
      this.adopting = true
      haptic.tap()
      try {
        await petApi.adopt({})
        toast.success('已领养一个蛋')
        await this.load()
      } catch (e) {
        toast.error(e?.message || '领养失败')
      } finally {
        this.adopting = false
      }
    },

    // 2026-07-16 弃养: 走两步 modal 确认 (无密码, 因操作者已通过 activeStudent 监护人校验)
    async onAbandon(p) {
      if (!p || !p._id) return
      if (this.pets.length <= 1) {
        toast.warn('最后一只不能弃养，请先领养新宠物')
        return
      }
      haptic.tap()
      const name = (p.speciesRecord && p.speciesRecord.name) || (p.state === 'egg' ? '待破壳蛋' : (p.species || '宠物'))
      const isDefaultTip = p.isDefault ? '（弃养的是默认宠物, 弃养后会自动切换到剩余最早领养的宠物）' : ''
      let res
      try {
        res = await uni.showModal({
          title: '确认弃养?',
          content: `「${name}」将永久删除, 等级经验一起消失${isDefaultTip}`,
          confirmText: '确认弃养',
          cancelText: '再想想',
          confirmColor: '#F56C6C'
        })
      } catch (_) {
        return
      }
      if (!res || !res.confirm) return
      try {
        await petApi.abandon(p._id)
        toast.success('已弃养')
        await this.load()
      } catch (e) {
        toast.error(e?.message || '弃养失败')
      }
    },

    goBack() { uni.navigateBack({ delta: 1 }) },
    goEnroll() { uni.switchTab({ url: '/pages/tabbar/explore' }) }
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
  &__title-sep { font-size: $font-md; color: $text-tertiary; }
  &__title-species {
    font-size: $font-lg;
    color: $primary;
    font-weight: $font-weight-semibold;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__title-spacer { width: 64rpx; height: 64rpx; flex-shrink: 0; }

  &__subbar {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    padding: 0 $spacing-lg $spacing-md;
    flex-wrap: wrap;
  }
  &__lv { font-size: $font-md; color: $primary; font-weight: $font-weight-semibold; }
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

  // 2026-07-18 移除: &__abandon-main 弃养默认宠物的 subbar 按钮 (死代码, 主区不再展示)

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
  &__egg-emoji {
    font-size: 240rpx;
    filter: drop-shadow(0 12rpx 24rpx rgba(255, 138, 101, 0.25));
  }
  // 2026-07-18 第五期: emoji 缩到左上角半透明 overlay (蛋态视觉与物种视觉融合)
  &__egg-emoji--overlay {
    position: absolute;
    top: $spacing-sm;
    left: $spacing-sm;
    font-size: 96rpx;
    opacity: 0.75;
    filter: drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.35));
    z-index: 2;
    pointer-events: none;
  }
  // 2026-07-18 第五期: 蛋态底层视频/svg 渲染 (与存活态 currentVisual 共用 9:16 裁 1:1 范式)
  &__egg-base {
    width: 100%;
    aspect-ratio: 1 / 1;
    position: relative;
    overflow: hidden;
    border-radius: $radius-md;
  }
  &__egg-base :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }
  &__egg-cta {
    color: $primary;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
  }

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
  &__egg-frame.fading { animation: egg-fade-in-gold 1s ease-out forwards; }
  @keyframes egg-fade-in-gold {
    0%   { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.15); }
  }
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
  &__hatch-hammer.active { animation: hammer-fall 0.4s ease-in forwards; }
  @keyframes hammer-fall {
    0%   { transform: translate(-50%, -300rpx) rotate(-30deg); opacity: 0; }
    20%  { transform: translate(-50%, -200rpx) rotate(-25deg); opacity: 1; }
    60%  { transform: translate(-50%, 0rpx) rotate(0deg); opacity: 1; }
    80%  { transform: translate(-50%, 0rpx) rotate(0deg); opacity: 1; }
    100% { transform: translate(-50%, 200rpx) rotate(15deg); opacity: 0; }
  }
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
  &__hatch-gold.active { animation: gold-flash 1s ease-out forwards; }
  @keyframes gold-flash {
    0%   { opacity: 0; transform: scale(0.4); }
    30%  { opacity: 1; transform: scale(1.0); }
    100% { opacity: 0; transform: scale(1.8); }
  }

  // 9:16 视频裁 1:1
  &__pet {
    width: 100%;
    aspect-ratio: 1 / 1;
    position: relative;
    @include flex-center;
    overflow: hidden;
  }
  &__pet-svg { width: 90%; height: 90%; object-fit: contain; }
  &__pet-video {
    position: absolute !important;
    top: 50% !important;
    left: 0 !important;
    width: 100% !important;
    height: 177.78% !important;
    display: block !important;
    transform: translateY(-50%) !important;
    object-fit: fill !important;
    z-index: 1;
  }
  &__pet-emoji { font-size: 240rpx; }

  // 2026-07-18 第四期: 升级特效全屏遮罩
  // 覆盖在 __stage 之上 (不走全屏, 沿用主区 520rpx 高度) — 与课堂展示主图一致
  &__levelup {
    position: absolute;
    inset: 0;
    z-index: 50;
    @include flex-center;
    overflow: hidden;
  }
  &__levelup-backdrop {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 50%,
      rgba(255, 240, 130, 0.85) 0%,
      rgba(255, 200, 60, 0.5) 30%,
      rgba(255, 180, 40, 0.25) 60%,
      transparent 85%);
    opacity: 1;
    transition: opacity $transition-base;
  }
  &__levelup-backdrop.fade { opacity: 0; }
  &__levelup-content {
    position: relative;
    width: 100%;
    height: 100%;
    @include flex-center;
  }
  &__levelup-svg {
    width: 90%;
    height: 90%;
    transition: opacity $transition-base;
    & :deep(svg) { width: 100%; height: 100%; display: block; object-fit: contain; }
  }
  &__levelup-svg.fade { opacity: 0; }
  &__levelup-video {
    position: absolute !important;
    top: 50% !important;
    left: 0 !important;
    width: 100% !important;
    height: 177.78% !important;
    display: block !important;
    transform: translateY(-50%) !important;
    object-fit: fill !important;
    z-index: 1;
  }
  &__levelup-tip {
    position: absolute;
    bottom: $spacing-md;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    z-index: 2;
    pointer-events: none;
  }
  &__levelup-lv {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: #fff;
    text-shadow: 0 2rpx 8rpx rgba(255, 138, 101, 0.8);
  }
  &__levelup-progress {
    font-size: $font-sm;
    color: #fff;
    background: rgba(0, 0, 0, 0.35);
    padding: 4rpx 14rpx;
    border-radius: $radius-pill;
    backdrop-filter: blur(4rpx);
  }

  &__svg-wrap { width: 100%; height: 100%; display: block; }
  &__svg-wrap :deep(svg) { width: 100%; height: 100%; display: block; object-fit: contain; }

  &__stats {
    margin: 0 $spacing-lg $spacing-lg;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-lg;
    box-shadow: $shadow-card;
  }
  &__stat { margin-bottom: $spacing-md; }
  &__stat:last-child { margin-bottom: 0; }
  &__stat-head { @include flex-between; margin-bottom: 6rpx; }
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
  &__bar-fill--exp { background: linear-gradient(90deg, #FFD04B, #F5C148); }
  &__bar-fill--hunger { background: linear-gradient(90deg, $primary-light, $primary); }
  &__hint {
    margin-top: 6rpx;
    font-size: $font-xs;
    color: $text-tertiary;
    display: block;
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

  &__food-scroller { overflow: hidden; white-space: nowrap; }
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
  &__food-thumb .pet-detail__svg-wrap,
  &__food-thumb :deep(svg) { width: 64rpx; height: 64rpx; object-fit: contain; }
  &__food-video,
  &__food-img { width: 80rpx; height: 80rpx; object-fit: contain; border-radius: $radius-sm; }
  &__food-emoji { font-size: 48rpx; }
  &__food-name { font-size: $font-sm; font-weight: $font-weight-semibold; color: $text-primary; }
  &__food-meta { font-size: $font-xs; color: $text-tertiary; text-align: center; }
  &__food-price { color: $gold; font-weight: $font-weight-semibold; margin-right: 4rpx; }
  &__food-eff { color: $text-secondary; }

  // 其他宠物 grid
  &__others {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
  }
  &__other-card {
    width: 200rpx;
    background: $bg-page;
    border-radius: $radius-md;
    padding: $spacing-sm;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
  }
  &__other-media {
    width: 100%;
    aspect-ratio: 1 / 1;
    position: relative;
    overflow: hidden;
    border-radius: $radius-sm;
    background: rgba(0,0,0,0.04);
    @include flex-center;
  }
  &__other-video {
    position: absolute !important;
    top: 50% !important;
    left: 0 !important;
    width: 100% !important;
    height: 177.78% !important;
    display: block !important;
    transform: translateY(-50%) !important;
    object-fit: fill !important;
  }
  &__other-img { width: 100%; height: 100%; object-fit: contain; }
  &__other-emoji { font-size: 72rpx; }
  &__other-name { font-size: $font-xs; color: $text-primary; text-align: center; }
  &__other-actions { display: flex; flex-direction: column; gap: 4rpx; width: 100%; }
  &__other-btn {
    font-size: $font-xs;
    text-align: center;
    padding: 6rpx 0;
    border-radius: $radius-pill;
    background: rgba(124, 217, 183, 0.15);
    color: $accent;
    cursor: pointer;
    // 2026-07-16 弃养按钮 (其他宠物卡片底部)
    &--danger { background: rgba(245, 108, 108, 0.10); color: $danger; }
  }
  // 2026-07-18 移除: &__adopt-card / &__adopt-plus 「+ 领养」卡片样式 (死代码, 已删入口)
}
</style>
