<!--
  PetShop - C 端宠物商店 (2026-07-21 实装：列出消耗品 + 归属标签 + 立即喂食)

  设计：
    - 顶部：当前孩子 + 积分
    - 中部：消耗品 grid（图标 + 名称 + 价格 + 归属 chip）
    - 归属 owner=null → "通用"（灰底）
    - 归属 owner=X → "🐾 仅 [宠物名]"（橙底）
    - 点击 → 后端 buyConsumable 自动 resolve pet（owner pet 优先）→ 立即喂食

  接口：
    - GET /pet/shop（consumables 列表）
    - GET /points/me（积分）
    - POST /pet/shop/buy-consumable { consumableKey } → 自动喂食
-->
<template>
  <view class="pet-shop">
    <view v-if="loading && items.length === 0" class="pet-shop__loading">
      <text>召唤中…</text>
    </view>

    <template v-else>
      <!-- 顶部余额 -->
      <view class="pet-shop__header">
        <text class="pet-shop__title">🛍️ 宠物商店</text>
        <text class="pet-shop__points">💰 {{ points != null ? points : '?' }} 积分</text>
      </view>

      <!-- 空状态 -->
      <view v-if="items.length === 0" class="pet-shop__empty">
        <text class="pet-shop__empty-emoji">🪙</text>
        <text class="pet-shop__empty-title">商店暂无消耗品</text>
        <text class="pet-shop__empty-desc">请等待管理员上架</text>
      </view>

      <!-- 消耗品 grid -->
      <view v-else class="pet-shop__grid">
        <view
          v-for="c in items"
          :key="c.key"
          class="pet-shop__card"
          @tap="onBuy(c)"
        >
          <view class="pet-shop__card-media">
            <view v-if="c.svgContent" class="pet-shop__svg-wrap" v-html="c.svgContent" />
            <video
              v-else-if="c.visualType === 'video' && c.videoUrl"
              :src="c.videoUrl"
              :key="c.key"
              muted preload="metadata"
              :controls="false" :show-play-btn="false" :show-fullscreen-btn="false"
              class="pet-shop__video"
            />
            <text v-else class="pet-shop__emoji-emoji">🍖</text>
            <!-- 归属 chip (2026-07-21 v4: ownerSpecies 多选) -->
            <view v-if="Array.isArray(c.ownerSpecies) && c.ownerSpecies.length > 0" class="pet-shop__owner pet-shop__owner--specific">
              <text>🔒 仅 {{ ownerSpeciesLabel(c.ownerSpecies) }}</text>
            </view>
            <view v-else class="pet-shop__owner pet-shop__owner--universal">
              <text>通用</text>
            </view>
          </view>
          <text class="pet-shop__card-name">{{ c.name }}</text>
          <view class="pet-shop__card-meta">
            <text class="pet-shop__card-price">{{ c.pointCost }} 积</text>
            <text class="pet-shop__card-eff">+{{ c.expGain }}exp +{{ c.hungerRestore }}饱</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script>
import { petShopApi } from '@/api/petShop'
import { pointsApi } from '@/api/points'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'

export default {
  data() {
    return {
      loading: true,
      items: [],          // consumables list
      speciesList: [],    // PetSpecies 列表（用于 speciesKey → name 翻译）
      points: null,
      busy: false
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const r = await petShopApi.shop()
        const list = r?.consumables || r?.items || r?.data?.items || []
        this.items = list.map((c) => ({
          key: c.key,
          name: c.name,
          kind: c.kind,
          pointCost: c.pointCost || 0,
          hungerRestore: c.hungerRestore || 0,
          expGain: c.expGain || 0,
          visualType: c.visualType || '',
          svgContent: c.svgContent || '',
          videoUrl: c.videoFile?.url || '',
          // 2026-07-21 v4: ownerSpecies 是 PetSpecies.key 数组（多选）
          ownerSpecies: Array.isArray(c.ownerSpecies) ? c.ownerSpecies : []
        }))
      } catch (e) {
        console.warn('[petShop.load]', e)
        this.items = []
      } finally {
        this.loading = false
      }
      // 拉积分（不阻塞）
      // 2026-07-21 v3: 拉物种图鉴（用于 ownerSpecies key → name 翻译）
      this.loadSpecies()
      pointsApi.me().then((rp) => {
        this.points = rp?.balance ?? null
      }).catch(() => { this.points = null })
    },

    async loadSpecies() {
      try {
        const r = await petApi.species()
        this.speciesList = r?.items || r?.data?.items || []
      } catch (e) {
        this.speciesList = []
      }
    },

    // 2026-07-21 v4: 把 species key 数组翻译成中文名列表
    ownerSpeciesLabel(keys) {
      if (!Array.isArray(keys) || keys.length === 0) return ''
      return keys.map((k) => {
        const sp = (this.speciesList || []).find((s) => s.key === k)
        return sp?.name || k
      }).join('、')
    },

    async onBuy(c) {
      if (!c?.key || this.busy) return
      const cost = Number(c.pointCost) || 0
      if (this.points != null && this.points < cost) {
        toast.warn(`积分不足: 当前 ${this.points}, 需要 ${cost}`)
        return
      }
      haptic.tap()
      // 2026-07-21 v4: 确认弹窗（含 ownerSpecies 列表提示）
      const owners = c.ownerSpecies || []
      const ownerText = Array.isArray(owners) && owners.length > 0
        ? `该消耗品仅限「${this.ownerSpeciesLabel(owners)}」使用，确认购买并立即喂食？`
        : '确认购买并立即喂食？'
      let res
      try {
        res = await uni.showModal({
          title: `购买「${c.name}」`,
          content: ownerText,
          confirmText: '确认购买',
          cancelText: '再想想'
        })
      } catch (_) { return }
      if (!res.confirm) return

      this.busy = true
      try {
        const r = await petShopApi.buyConsumable({ consumableKey: c.key })
        const pet = r?.petAccount || r?.data?.petAccount
        const levelUp = r?.levelUp || r?.data?.levelUp
        const pointsAfter = r?.pointsAfter ?? r?.data?.pointsAfter
        if (typeof pointsAfter === 'number') this.points = pointsAfter
        if (levelUp) {
          toast.success(`喂食成功 · 升级啦！`)
        } else {
          toast.success('喂食成功')
        }
        if (pet?.nickname || pet?.species) {
          // 极简反馈 — 详细特效在 detail.vue 喂食时已经演示
          const name = pet.nickname || pet.species || '宠物'
          console.info('[petShop] 已喂食', name)
        }
      } catch (e) {
        toast.error(e?.message || '购买失败')
      } finally {
        this.busy = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.pet-shop {
  min-height: 100vh;
  padding: 16px;
  background: #fafafa;
}
.pet-shop__loading {
  text-align: center;
  padding: 80px 0;
  color: #999;
}
.pet-shop__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px 16px;
}
.pet-shop__title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}
.pet-shop__points {
  font-size: 15px;
  color: #f56700;
  font-weight: 600;
}
.pet-shop__empty {
  text-align: center;
  padding: 80px 0;
}
.pet-shop__empty-emoji {
  display: block;
  font-size: 56px;
  margin-bottom: 12px;
  opacity: 0.7;
}
.pet-shop__empty-title {
  display: block;
  font-size: 16px;
  color: #303133;
  margin-bottom: 6px;
}
.pet-shop__empty-desc {
  display: block;
  font-size: 13px;
  color: #909399;
}

.pet-shop__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.pet-shop__card {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  transition: transform 0.15s ease;
}
.pet-shop__card:active {
  transform: scale(0.97);
  background: #f5f7fa;
}
.pet-shop__card-media {
  position: relative;
  width: 100%;
  height: 110px;
  background: #f5f7fa;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 8px;
}
.pet-shop__svg-wrap {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pet-shop__svg-wrap >>> svg {
  width: 100%;
  height: 100%;
}
.pet-shop__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}
.pet-shop__emoji-emoji {
  font-size: 48px;
}
.pet-shop__owner {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}
.pet-shop__owner--universal {
  background: #f0f9ff;
  color: #909399;
  border: 1px solid #e4e7ed;
}
.pet-shop__owner--specific {
  background: #fff7e6;
  color: #fa8c16;
  border: 1px solid #ffd591;
}
.pet-shop__card-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pet-shop__card-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.pet-shop__card-price {
  font-size: 13px;
  color: #f56700;
  font-weight: 600;
}
.pet-shop__card-eff {
  font-size: 11px;
  color: #909399;
}
</style>
