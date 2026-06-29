<!--
  SliderCaptcha - 滑块验证组件 (R-0110/R-0111)
  - 显示 challenge SVG 背景 + 拼图块
  - 滑动成功后调 /captcha/verify 拿 pass
  - H5 平台兼容:同时绑定 mouse + touch 事件,desktop 浏览器也能拖
-->
<template>
  <view class="captcha-mask" @tap="onClose">
    <view class="captcha" @tap.stop>
      <view class="captcha__header">
        <text class="captcha__title">拖动滑块完成拼图</text>
        <text class="captcha__close" @tap="onClose">×</text>
      </view>

      <view class="captcha__body" v-if="challenge">
        <view class="captcha__canvas-wrap" ref="canvasWrap">
          <!-- 背景 SVG (内联): 内含后端画的目标槽虚线, 用户视觉对齐它 -->
          <view class="captcha__bg" v-html="challenge.backgroundSvg" />
          <!-- 拼图块 (跟随指针, 拖到背景虚线槽处对齐) -->
          <view
            class="captcha__piece"
            :style="pieceStyle"
            @mousedown="onDragStart"
            @touchstart="onDragStart"
          />
        </view>

        <view class="captcha__track">
          <view class="captcha__track-line" />
          <view
            class="captcha__track-fill"
            :style="{ width: pieceLeft + 'px' }"
          />
          <view
            class="captcha__track-slider"
            :class="{ 'captcha__track-slider--dragging': dragging, 'captcha__track-slider--success': success }"
            :style="sliderStyle"
            @mousedown="onDragStart"
            @touchstart="onDragStart"
          >
            <text class="captcha__track-arrow">→</text>
          </view>
          <text class="captcha__track-text" v-if="!success">拖动滑块完成拼图</text>
          <text class="captcha__track-text captcha__track-text--success" v-else>验证成功 ✓</text>
        </view>
      </view>

      <view class="captcha__loading" v-else>
        <text>加载中...</text>
      </view>

      <view v-if="errorText" class="captcha__error">{{ errorText }}</view>

      <view class="captcha__footer">
        <text class="captcha__footer-text" @tap="onRefresh">看不清?换一张</text>
      </view>
    </view>
  </view>
</template>

<script>
import { captchaApi } from '@/api/captcha'
import { haptic } from '@/utils/haptic'

export default {
  name: 'SliderCaptcha',
  emits: ['success', 'close'],
  data() {
    return {
      challenge: null,
      pieceLeft: 0,
      dragging: false,
      success: false,
      errorText: '',
      startX: 0,
      // 缓存 pointer 坐标,避免 e.touches[0] 在鼠标环境为空数组
      currentClientX: 0,
      // 拖动轨迹 [{ t, x }],提交后端做行为分析(MVP 仅做长度校验)
      track: []
    }
  },
  computed: {
    /**
     * 拼图块样式 (在 canvas-wrap 内绝对定位)
     * 用 computed 避免 :style="{}" 对象语法在 uni-app H5 下的绑定失效问题
     */
    pieceStyle() {
      if (!this.challenge) return {}
      const svg = this.challenge.pieceSvg || ''
      const bg = svg
        ? `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
        : 'none'
      return {
        left: this.pieceLeft + 'px',
        top: '0',  // 拼图块顶到画布顶部,跟 SVG 背景里目标槽的 Y 区域对齐(用户主要做横向对齐)
        backgroundImage: bg,
        display: 'block'
      }
    },
    /** 滑块按钮样式 (在 track 内居中,translate(-50%) 让圆心对齐 left) */
    sliderStyle() {
      return {
        left: this.pieceLeft + 'px'
      }
    },
    /**
     * 拼图块在 X 轴的可拖动上限:
     * = 画布宽度 - 拼图块宽度 (否则拼图块会超出画布)
     * 默认画布 320px / piece 50px → 上限 270px
     */
    maxPieceLeft() {
      const canvasW = (this.challenge && this.challenge.width) || 320
      const pieceW = (this.challenge && this.challenge.pieceWidth) || 50
      return Math.max(0, canvasW - pieceW)
    }
  },
  mounted() {
    this.load()
  },
  beforeUnmount() {
    this.detachGlobalListeners()
  },
  methods: {
    async load() {
      this.errorText = ''
      this.success = false
      this.pieceLeft = 0
      try {
        const res = await captchaApi.challenge()
        // 后端只返回 backgroundSvg + pieceSvg + width/height/pieceWidth,
        // 目标位置隐藏在 SVG 背景的虚线轮廓里(防 OCR 绕过),前端不做 pieceX/pieceY 解析
        this.challenge = res
      } catch (e) {
        this.errorText = '加载失败,请重试'
      }
    },

    /**
     * 统一处理 pointer (mouse + touch) 起点
     * 优先取 touch (移动 H5), 否则取 mouse (桌面 H5 / PC Chrome)
     */
    getClientX(e) {
      if (e.touches && e.touches.length) return e.touches[0].clientX
      if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX
      if (typeof e.clientX === 'number') return e.clientX
      return 0
    },

    onDragStart(e) {
      if (this.success) return
      // H5 下 mouse + touch 可能都触发,只处理一次
      if (this.dragging) return
      // 阻止默认行为 (避免 H5 下页面文本选中 / 图片拖动)
      if (e.cancelable) e.preventDefault()
      this.startX = this.getClientX(e)
      this.currentClientX = this.startX
      this.dragging = true
      // 重置拖动轨迹
      this.track = [{ t: Date.now(), x: this.startX }]
      haptic.tap()

      // 全局监听 move + up,即使拖出元素也持续跟踪
      this.attachGlobalListeners()
    },

    attachGlobalListeners() {
      // 防止重复绑定
      this.detachGlobalListeners()
      this._onDragMove = (e) => this.onDragMove(e)
      this._onDragEnd = (e) => this.onDragEnd(e)
      window.addEventListener('mousemove', this._onDragMove)
      window.addEventListener('mouseup', this._onDragEnd)
      window.addEventListener('touchmove', this._onDragMove, { passive: false })
      window.addEventListener('touchend', this._onDragEnd)
    },

    detachGlobalListeners() {
      if (this._onDragMove) {
        window.removeEventListener('mousemove', this._onDragMove)
        window.removeEventListener('touchmove', this._onDragMove)
      }
      if (this._onDragEnd) {
        window.removeEventListener('mouseup', this._onDragEnd)
        window.removeEventListener('touchend', this._onDragEnd)
      }
    },

    onDragMove(e) {
      if (!this.dragging) return
      if (e.cancelable) e.preventDefault() // 阻止页面跟随滚动
      this.currentClientX = this.getClientX(e)
      const dx = this.currentClientX - this.startX
      // 限制 pieceLeft 在画布内可拖范围 (0 ~ 画布宽-拼图块宽)
      this.pieceLeft = Math.max(0, Math.min(this.maxPieceLeft, dx))
      // 节流记录轨迹:每 50ms 一个点,防止 payload 爆炸
      const now = Date.now()
      const last = this.track[this.track.length - 1]
      if (!last || now - last.t >= 50) {
        this.track.push({ t: now, x: this.currentClientX })
      }
    },

    async onDragEnd() {
      if (!this.dragging) return
      this.dragging = false
      this.detachGlobalListeners()
      if (!this.challenge) return

      // 注意: 后端故意不返回 pieceX/correctX(防止脚本绕过),
      // 前端无法做早期位置校验,统一交给后端 verify 判定.
      // 后端容差 CAPTCHA_TOLERANCE 默认 10px (H5 拖动精度有限).
      try {
        const res = await captchaApi.verify({
          token: this.challenge.token,
          x: this.pieceLeft,
          track: this.track.length >= 3 ? this.track : null
        })
        this.success = true
        haptic.success()
        this.$emit('success', res.pass, res.expiresAt)
        setTimeout(() => this.$emit('close'), 600)
      } catch (e) {
        haptic.error()
        this.errorText = e.message || '验证失败'
        setTimeout(() => {
          this.pieceLeft = 0
          this.errorText = ''
          this.load()
        }, 800)
      }
    },

    onClose() {
      this.detachGlobalListeners()
      this.$emit('close')
    },

    onRefresh() {
      haptic.tap()
      this.load()
    }
  }
}
</script>

<style lang="scss" scoped>
.captcha-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: $bg-mask;
  z-index: $z-modal;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $spacing-lg;
  backdrop-filter: blur(4rpx);
}

.captcha {
  width: 100%;
  max-width: 560rpx;
  background: $bg-card;
  border-radius: $radius-md;
  overflow: hidden;
  animation: scaleIn $transition-spring;

  &__header {
    @include flex-between;
    padding: $spacing-md;
    border-bottom: 1rpx solid $divider-light;
  }

  &__title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  &__close {
    font-size: 40rpx;
    color: $text-tertiary;
    line-height: 1;
    padding: 0 8rpx;
    cursor: pointer;
  }

  &__body {
    padding: $spacing-md;
  }

  &__canvas-wrap {
    position: relative;
    width: 100%;
    height: 320rpx;
    background: $bg-page;
    border-radius: $radius-sm;
    overflow: hidden;
    margin-bottom: $spacing-md;
    user-select: none;
    -webkit-user-select: none;
  }

  &__bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  &__piece {
    position: absolute;
    width: 50px;
    height: 50px;
    background-size: cover;
    background-repeat: no-repeat;
    cursor: grab;
    transition: transform 0.1s;
    z-index: 3;
    user-select: none;
    -webkit-user-select: none;

    &:active {
      cursor: grabbing;
    }
  }

  &__track {
    position: relative;
    height: 56rpx;
    background: $divider-light;
    border-radius: $radius-pill;
    user-select: none;
    -webkit-user-select: none;
  }

  &__track-line {
    position: absolute;
    top: 50%;
    left: 24rpx;
    right: 24rpx;
    height: 2rpx;
    background: $text-disabled;
    transform: translateY(-50%);
  }

  &__track-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, $primary-light, $primary);
    border-radius: $radius-pill;
    transition: width 0.1s;
  }

  &__track-slider {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 64rpx;
    height: 64rpx;
    background: $bg-card;
    border-radius: 50%;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    transition: box-shadow $transition-fast;
    z-index: 2;
    user-select: none;
    -webkit-user-select: none;

    &--dragging {
      cursor: grabbing;
      box-shadow: 0 6rpx 16rpx rgba(255, 138, 101, 0.32);
    }

    &--success {
      background: $accent;
    }

    &:active {
      cursor: grabbing;
    }
  }

  &__track-arrow {
    color: $primary;
    font-size: 32rpx;
    font-weight: bold;
    pointer-events: none;
  }

  &__track-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: $font-sm;
    color: $text-tertiary;
    pointer-events: none;

    &--success {
      color: $accent;
      font-weight: $font-weight-semibold;
    }
  }

  &__loading {
    padding: $spacing-xl;
    text-align: center;
    color: $text-secondary;
  }

  &__error {
    padding: $spacing-sm $spacing-md;
    background: $warning-light;
    color: $warning;
    font-size: $font-sm;
    text-align: center;
    margin: 0 $spacing-md;
    border-radius: $radius-sm;
  }

  &__footer {
    padding: $spacing-sm $spacing-md $spacing-md;
    text-align: center;
  }

  &__footer-text {
    font-size: $font-sm;
    color: $primary;
    text-decoration: underline;
    cursor: pointer;
  }
}
</style>