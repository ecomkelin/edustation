<!--
  notification-preferences.vue - 通知偏好设置 (v0.9 立项)
  - 数据源 R-4008 GET / R-4009 PUT /notifications/me/preferences
  - 总开关: globalEnabled
  - 7 个分类: lesson/task/order/evaluation/point/pet/access (system 类仅随总开关)
  - 渠道勾选: 每个分类下用户可勾选要接收的渠道 (MVP 仅 inbox 可选)
  - 安静时段 (P2 占位)
-->
<template>
  <view class="prefs">
    <view class="prefs__header">
      <text class="prefs__header-title">通知偏好</text>
      <text class="prefs__header-desc">关闭后该类通知仅在「消息 → 系统消息」查看，不再外发</text>
    </view>

    <view v-if="loading" class="prefs__loading">
      <text>加载中…</text>
    </view>

    <template v-else>
      <!-- 总开关 -->
      <view class="prefs__card prefs__card--global">
        <view class="prefs__row">
          <view class="prefs__row-info">
            <text class="prefs__row-title">接收通知</text>
            <text class="prefs__row-desc">{{ globalEnabled ? '已开启' : '已关闭（仅站内消息可见）' }}</text>
          </view>
          <switch :checked="globalEnabled" color="#FF8A65" @change="onGlobalToggle" />
        </view>
      </view>

      <!-- 分类列表 -->
      <view class="prefs__group">
        <view class="prefs__group-title">分类开关</view>
        <view
          v-for="cat in categoryList"
          :key="cat.key"
          :class="['prefs__card', { 'prefs__card--disabled': !globalEnabled }]"
        >
          <view class="prefs__row">
            <view class="prefs__row-info">
              <text class="prefs__row-emoji">{{ cat.emoji }}</text>
              <text class="prefs__row-title">{{ cat.label }}</text>
            </view>
            <switch
              :checked="getCategoryEnabled(cat.key)"
              :disabled="!globalEnabled"
              color="#FF8A65"
              @change="onCategoryToggle(cat.key, $event)"
            />
          </view>
          <view v-if="getCategoryEnabled(cat.key) && globalEnabled" class="prefs__channels">
            <text class="prefs__channels-label">接收渠道</text>
            <view class="prefs__chips">
              <view
                v-for="ch in channelList"
                :key="ch.key"
                :class="['prefs__chip', { 'prefs__chip--on': hasChannel(cat.key, ch.key), 'prefs__chip--locked': ch.locked }]"
                @tap="onChannelToggle(cat.key, ch.key)"
              >
                <text>{{ ch.label }}</text>
              </view>
            </view>
            <!--
              2026-07-18 bug fix: 原 v-if="ch.hint" 写在 v-for 外, ch 未定义 → TypeError.
              现在: 把 hint 挪到 chip 内, 仅在锁定且有 hint 时显示
            -->
            <view
              v-for="ch in channelList.filter((c) => c.locked && c.hint)"
              :key="'hint-' + ch.key"
              class="prefs__channels-hint-row"
            >
              <text class="prefs__channels-hint-emoji">🔒</text>
              <text class="prefs__channels-hint">{{ ch.label }}：{{ ch.hint }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 安静时段 (P2 占位) -->
      <view class="prefs__group">
        <view class="prefs__group-title">安静时段</view>
        <view class="prefs__card prefs__card--muted">
          <text class="prefs__muted-text">下一版本上线，敬请期待</text>
        </view>
      </view>

      <view class="prefs__footer">
        <button class="prefs__save" :disabled="saving" @tap="onSave">{{ saving ? '保存中…' : '保存设置' }}</button>
      </view>
    </template>
  </view>
</template>

<script>
import { notificationApi } from '@/api/notification'

const CATEGORY_LIST = [
  { key: 'lesson',     label: '上课提醒',  emoji: '📚' },
  { key: 'task',       label: '作业/任务',  emoji: '📝' },
  { key: 'order',      label: '订单通知',  emoji: '💰' },
  { key: 'evaluation', label: '课评发布',  emoji: '⭐' },
  { key: 'point',      label: '积分到账',  emoji: '🎁' },
  { key: 'pet',        label: '宠物动态',  emoji: '🐾' },
  { key: 'access',     label: '接送异常',  emoji: '⚠️' }
]

// MVP 仅 inbox 可用; 其他渠道 chip 显示但不响应点击
const CHANNEL_LIST = [
  { key: 'inbox',      label: '站内消息', locked: false },
  { key: 'wechatMini', label: '微信',     locked: true,  hint: '下一版本上线' },
  { key: 'sms',        label: '短信',     locked: true,  hint: '下一版本上线' }
]

export default {
  data() {
    return {
      loading: true,
      saving: false,
      globalEnabled: true,
      // categories: { lesson: { enabled, channels: ['inbox'] }, ... }
      categories: {},
      channels: {},
      categoryList: CATEGORY_LIST,
      channelList: CHANNEL_LIST
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await notificationApi.getPreferences()
        const data = res && res.data ? res.data : res
        if (data) {
          this.globalEnabled = data.globalEnabled !== false
          this.categories = data.categories || {}
          this.channels = data.channels || {}
        }
      } catch (e) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      } finally {
        this.loading = false
      }
    },
    getCategoryEnabled(key) {
      const c = this.categories[key]
      return c && c.enabled === true
    },
    hasChannel(catKey, chKey) {
      const c = this.categories[catKey]
      return c && Array.isArray(c.channels) && c.channels.includes(chKey)
    },
    onGlobalToggle(e) {
      this.globalEnabled = e.detail.value
    },
    onCategoryToggle(key, e) {
      const next = { ...(this.categories[key] || {}) }
      next.enabled = e.detail.value
      if (next.enabled && (!next.channels || !next.channels.length)) {
        next.channels = ['inbox']
      }
      this.$set(this.categories, key, next)
    },
    onChannelToggle(catKey, chKey) {
      const ch = this.channelList.find((x) => x.key === chKey)
      if (ch && ch.locked) {
        uni.showToast({ title: '下一版本上线', icon: 'none' })
        return
      }
      const cur = this.categories[catKey] || { enabled: true, channels: [] }
      const list = Array.isArray(cur.channels) ? cur.channels.slice() : []
      const idx = list.indexOf(chKey)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(chKey)
      // 至少保留一个渠道
      if (!list.length) list.push('inbox')
      this.$set(this.categories, catKey, { ...cur, channels: list })
    },
    async onSave() {
      this.saving = true
      try {
        const payload = {
          globalEnabled: this.globalEnabled,
          categories: this.categories
        }
        await notificationApi.updatePreferences(payload)
        uni.showToast({ title: '已保存', icon: 'success' })
        // 回到上一页
        setTimeout(() => uni.navigateBack(), 600)
      } catch (e) {
        uni.showToast({ title: e.message || '保存失败', icon: 'none' })
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.prefs {
  min-height: 100vh;
  background: $bg-page;
  padding-bottom: 160rpx;

  &__header {
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary-lighter, $accent-light);
  }
  &__header-title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    display: block;
  }
  &__header-desc {
    font-size: $font-sm;
    color: $text-secondary;
    margin-top: 8rpx;
    display: block;
  }

  &__loading {
    text-align: center;
    padding: $spacing-2xl;
    color: $text-tertiary;
  }

  &__card {
    background: $bg-card;
    border-radius: $radius-md;
    margin: $spacing-xs $spacing-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    &--global {
      border-left: 6rpx solid $primary;
    }
    &--disabled {
      opacity: .5;
    }
    &--muted {
      text-align: center;
      padding: $spacing-md;
    }
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__row-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    min-width: 0;
  }
  &__row-emoji {
    font-size: 36rpx;
    flex-shrink: 0;
  }
  &__row-title {
    font-size: $font-base;
    color: $text-primary;
    font-weight: $font-weight-medium;
  }
  &__row-desc {
    font-size: $font-sm;
    color: $text-tertiary;
    display: block;
    margin-top: 4rpx;
  }

  &__group {
    margin-top: $spacing-md;
  }
  &__group-title {
    padding: 0 $spacing-md $spacing-xs;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  &__channels {
    margin-top: $spacing-sm;
    padding-top: $spacing-sm;
    border-top: 1rpx solid $divider-light;
  }
  &__channels-label {
    font-size: $font-xs;
    color: $text-tertiary;
    display: block;
    margin-bottom: 6rpx;
  }
  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }
  &__chip {
    padding: 6rpx $spacing-sm;
    background: $bg-page;
    border: 1rpx solid $divider-light;
    border-radius: $radius-pill;
    font-size: $font-xs;
    color: $text-secondary;
    &--on {
      background: $primary-lighter;
      color: $primary;
      border-color: $primary;
    }
    &--locked {
      opacity: .6;
    }
  }
  &__chip > text { color: inherit; }
  &__channels-hint-row {
    display: flex;
    align-items: center;
    gap: 6rpx;
    margin-top: 6rpx;
  }
  &__channels-hint-emoji {
    font-size: $font-xs;
  }
  &__channels-hint {
    font-size: $font-xs;
    color: $text-tertiary;
    display: block;
    line-height: 1.4;
  }

  &__muted-text {
    color: $text-tertiary;
    font-size: $font-sm;
  }

  &__footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: $spacing-md;
    background: $bg-card;
    border-top: 1rpx solid $divider-light;
  }
  &__save {
    background: $primary;
    color: #fff;
    border-radius: $radius-md;
    font-size: $font-base;
    height: 88rpx;
    line-height: 88rpx;
    text-align: center;
    border: none;
    &[disabled] {
      opacity: .6;
    }
  }
}
</style>