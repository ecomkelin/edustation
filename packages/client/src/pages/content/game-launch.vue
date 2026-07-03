<!--
  小游戏启动页 (R-3701 + R-3702 play)
  - 顶部信息 (名称 + 简介 + 标签)
  - 中间 web-view 嵌 H5 游戏 (domain 白名单由后端 launchUrl 控制)
  - onShow 时 POST /games/:id/play +1 启动计数
-->
<template>
  <view class="game-launch">
    <view v-if="loading && !game" class="game-launch__loading">
      <text>召唤中…</text>
    </view>

    <view v-else-if="!game" class="game-launch__empty">
      <text class="game-launch__empty-emoji">🎮</text>
      <text class="game-launch__empty-title">游戏不存在或已下架</text>
    </view>

    <template v-else>
      <view class="game-launch__head">
        <view
          class="game-launch__emoji-box"
          :style="{ background: emojiBg(game.meta?.coverEmoji) }"
        >
          <text class="game-launch__emoji">{{ game.meta?.coverEmoji || '🎮' }}</text>
          <view
            v-if="game.difficulty"
            class="game-launch__difficulty"
            :style="{ background: difficultyColor(game.difficulty) }"
          >
            <text>{{ difficultyLabel(game.difficulty) }}</text>
          </view>
        </view>
        <view class="game-launch__head-info">
          <text class="game-launch__name">{{ game.name }}</text>
          <text class="game-launch__intro">{{ game.intro }}</text>
          <view class="game-launch__tags">
            <text
              v-for="t in game.tags || []"
              :key="t"
              class="game-launch__tag"
            >
              {{ t }}
            </text>
          </view>
          <view class="game-launch__playcount">
            <text>👾 已玩 {{ game.playCount || 0 }} 次</text>
          </view>
        </view>
      </view>

      <!-- web-view 嵌游戏 (H5) -->
      <view class="game-launch__webview-box">
        <web-view
          v-if="game.launchUrl"
          :src="game.launchUrl"
          class="game-launch__webview"
        />
        <view v-else class="game-launch__nostub">
          <text>暂无游戏地址</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script>
import { gameApi } from '@/api/game'
import { haptic } from '@/utils/haptic'

const DIFFICULTY_LABELS = { easy: '简单', medium: '中等', hard: '困难' }
const DIFFICULTY_COLORS = { easy: '#7CD9B7', medium: '#F5C148', hard: '#FF8A65' }
const EMOJI_BG = {
  '💻': 'linear-gradient(135deg, #5B9EE6, #4F46E5)',
  '🎨': 'linear-gradient(135deg, #F5C148, #FF8A65)',
  '🛡️': 'linear-gradient(135deg, #7CD9B7, #5B9EE6)',
  '🔢': 'linear-gradient(135deg, #B197FC, #FF8A65)',
  '🈚': 'linear-gradient(135deg, #FF8A65, #F5C148)',
  '🌍': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)'
}

export default {
  data() {
    return {
      loading: true,
      game: null,
      played: false
    }
  },
  onLoad(query) {
    if (query && query.id) {
      this.id = query.id
      this.load()
    }
  },
  // onShow 时 (含首次进入) +1 启动; 用 played 标记防止重复计入 (uni-app 路由栈回退也会触发)
  onShow() {
    if (this.game && this.game._id && !this.played) {
      this.bumpPlay()
    }
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await gameApi.detail(this.id)
        const data = res?.data || res || {}
        this.game = data
      } catch (e) {
        console.warn('[gameLaunch.load]', e)
        this.game = null
      } finally {
        this.loading = false
      }
    },

    // 启动计数: 失败不影响用户开玩
    async bumpPlay() {
      try {
        const r = await gameApi.play(this.id)
        const data = r?.data || r || {}
        // 后端 play 返回 playCount 同步更新本地展示
        if (this.game && data.playCount) this.game.playCount = data.playCount
        this.played = true
      } catch (e) {
        // 兜底也认为已尝试
        this.played = true
      }
    },

    difficultyLabel(d) { return DIFFICULTY_LABELS[d] || '' },
    difficultyColor(d) { return DIFFICULTY_COLORS[d] || 'rgba(0,0,0,0.3)' },
    emojiBg(e) { return EMOJI_BG[e] || 'linear-gradient(135deg, #FFB088, #FF8A65)' },
    onLaunch() { haptic.success() }
  }
}
</script>

<style lang="scss" scoped>
.game-launch {
  min-height: 100vh;
  background: $bg-page;

  &__loading {
    padding: 240rpx $spacing-md;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: 240rpx $spacing-md;
    text-align: center;
  }
  &__empty-emoji {
    font-size: 96rpx;
    margin-bottom: $spacing-md;
  }
  &__empty-title {
    font-size: $font-lg;
    color: $text-secondary;
  }

  &__head {
    display: flex;
    padding: $spacing-md;
    background: $bg-card;
    gap: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-sm;
  }
  &__emoji-box {
    width: 160rpx;
    height: 160rpx;
    border-radius: 32rpx;
    @include flex-center;
    flex-shrink: 0;
    position: relative;
    box-shadow: 0 8rpx 16rpx rgba(0, 0, 0, 0.12);
  }
  &__emoji {
    font-size: 80rpx;
  }
  &__difficulty {
    position: absolute;
    bottom: -8rpx;
    right: -8rpx;
    padding: 4rpx 12rpx;
    border-radius: $radius-pill;
    & > text { color: #fff; font-size: $font-xs; font-weight: $font-weight-medium; }
  }
  &__head-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  &__name {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }
  &__intro {
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.5;
    margin-bottom: $spacing-xs;
  }
  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4rpx;
    margin-bottom: $spacing-xs;
  }
  &__tag {
    padding: 2rpx 12rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }
  &__playcount {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__webview-box {
    width: 100%;
    // 减去 head 高度 (160 + 32 padding ≈ 200)
    height: calc(100vh - 240rpx);
    background: #fff;
  }
  &__webview {
    width: 100%;
    height: 100%;
  }
  &__nostub {
    @include flex-center;
    width: 100%;
    height: 100%;
    color: $text-tertiary;
    font-size: $font-base;
  }
}
</style>
