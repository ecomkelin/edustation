<!--
  聊天详情 (2026-07-02 立项 C 端 4 tab 重构)
  - 入口 1: /pages/tabbar/chat-detail?type=support  → AI 客服模式
  - 入口 2: /pages/tabbar/chat-detail?id=xxx       → 普通会话模式
  - 模式识别: query.type === 'support' → 客服;否则按 id 查普通会话
  - 原 pages/agent/chat.vue 已被本文件取代 (本期会删)
-->
<template>
  <view class="cd">
    <!-- 顶部: 标题 + 副标题 + 右上"新对话" -->
    <!-- 2026-07-04: 加 safe-area-top 让顶部头避开刘海/状态栏 -->
    <view class="cd__top safe-area-top">
      <view class="cd__back press" @tap="goBack">
        <text>‹</text>
      </view>
      <view class="cd__title-wrap">
        <text class="cd__title">{{ title }}</text>
        <text class="cd__sub">{{ subtitle }}</text>
      </view>
      <view v-if="isSupport" class="cd__new-chat press" @tap="onNewChat">
        <text>新对话</text>
      </view>
    </view>

    <!-- 2026-07-04: 消息区改 flex:1 + min-height:0; 之前硬编码 height:calc(100vh - 280rpx) 在 iPhone safe-area 下挤压底部 -->
    <scroll-view scroll-y class="cd__body" :scroll-into-view="scrollInto" :scroll-with-animation="true">
      <view v-if="loading" class="cd__loading">
        <text>加载中…</text>
      </view>

      <view v-else-if="!messages.length && !isSupport" class="cd__empty">
        <text>还没有消息</text>
      </view>

      <view v-else>
        <!-- 客服欢迎语 (无历史消息时) -->
        <view v-if="isSupport && !messages.length" class="cd__welcome">
          <text class="cd__welcome-emoji">👋</text>
          <text class="cd__welcome-title">您好,我是客服助理</text>
          <text class="cd__welcome-desc">可以问我关于课程、报名、孩子学习等问题</text>
        </view>

        <!-- 消息列表 -->
        <view
          v-for="m in messages"
          :key="m._id || m.tmpId"
          :id="'m-' + (m._id || m.tmpId)"
          class="cd__msg"
          :class="m.role === 'user' ? 'cd__msg--user' : 'cd__msg--assistant'"
        >
          <view class="cd__msg-avatar">
            <text>{{ m.role === 'user' ? '🙂' : '🤖' }}</text>
          </view>
          <view class="cd__msg-bubble">
            <text class="cd__msg-text">{{ m.content }}</text>
            <text v-if="m.isStreaming" class="cd__msg-streaming">▍</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 底部输入框 -->
    <view class="cd__input-bar">
      <textarea
        v-model="input"
        class="cd__input"
        placeholder="输入消息…"
        :auto-height="true"
        :maxlength="2000"
        :disabled="sending"
        @confirm="onSend"
      />
      <view
        class="cd__send press"
        :class="{ 'cd__send--disabled': sending || !input.trim() }"
        @tap="onSend"
      >
        <text>{{ sending ? '发送中' : '发送' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { agentApi, conversationApi } from '@/api/agent'

export default {
  data() {
    return {
      loading: false,
      sending: false,
      isSupport: false,
      conversationId: '',
      title: '对话',
      subtitle: '',
      messages: [],
      input: '',
      scrollInto: '',
      streamingText: '',
      streamingMsgId: ''
    }
  },
  onLoad(opts) {
    this.isSupport = opts && opts.type === 'support'
    this.conversationId = (opts && opts.id) || ''
    // 2026-07-04: navigationStyle:custom 后无系统 nav bar, 不再调 setNavigationBarTitle
    if (this.isSupport) {
      this.title = '客服助理'
      this.subtitle = '人工智网 · 平台客服'
    }
    this.load()
  },
  methods: {
    goBack() {
      uni.navigateBack()
    },
    onNewChat() {
      // 仅 support 模式: 清空永久会话的消息
      uni.showModal({
        title: '新对话',
        content: '将清空当前对话的全部消息,确定继续?',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await agentApi.supportReset()
            this.messages = []
            this.scrollToBottom()
            uni.showToast({ title: '已清空', icon: 'success' })
          } catch (e) {
            uni.showToast({ title: '清空失败', icon: 'none' })
          }
        }
      })
    },
    async load() {
      this.loading = true
      try {
        if (this.isSupport) {
          const res = await agentApi.supportHistory()
          const data = res && res.data ? res.data : res
          this.messages = this._normalizeMessages(data && data.messages)
          if (data && data.conversation) this.conversationId = data.conversation._id
        } else if (this.conversationId) {
          const res = await conversationApi.detail(this.conversationId)
          const data = res && res.data ? res.data : res
          this.messages = this._normalizeMessages(data && data.messages)
          if (data && data.title) this.title = data.title
        }
      } catch (e) {
        this.messages = []
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    },
    _normalizeMessages(raw) {
      if (!Array.isArray(raw)) return []
      return raw
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => !m.isDeleted)
        .map((m, i) => {
          // 提取纯文本 (content 可能是 blocks 数组或字符串)
          let text = ''
          const c = m.content
          if (typeof c === 'string') {
            text = c
          } else if (Array.isArray(c)) {
            for (const blk of c) {
              if (blk && blk.type === 'text' && blk.content) text += blk.content
              else if (typeof blk === 'string') text += blk
            }
          }
          return {
            _id: m._id || m.seq || `hist-${i}`,
            role: m.role,
            content: text,
            createdAt: m.createdAt,
            isStreaming: false
          }
        })
        .filter((m) => m.content)
    },
    async onSend() {
      const text = String(this.input || '').trim()
      if (!text || this.sending) return
      this.sending = true
      this.input = ''

      // 1) 推 user 消息到本地 (立刻渲染)
      const userMsg = {
        _id: 'tmp-user-' + Date.now(),
        role: 'user',
        content: text,
        isStreaming: false
      }
      this.messages.push(userMsg)

      // 2) 推 assistant 占位消息 (流式追加)
      const assistantMsg = {
        _id: 'tmp-ai-' + Date.now(),
        role: 'assistant',
        content: '',
        isStreaming: true
      }
      this.streamingMsgId = assistantMsg._id
      this.messages.push(assistantMsg)
      this.scrollToBottom()

      // 3) 调对应端点
      const onDelta = (delta) => {
        assistantMsg.content += delta
        // 直接修改对象, Vue 3 选项式不响应, 走 $set
        this.$set(assistantMsg, 'content', assistantMsg.content)
        this.scrollToBottom()
      }
      const onDone = (full) => {
        assistantMsg.content = full || assistantMsg.content
        assistantMsg.isStreaming = false
        this.$set(assistantMsg, 'isStreaming', false)
        this.sending = false
        this.streamingMsgId = ''
        this.scrollToBottom()
      }
      const onError = (err) => {
        assistantMsg.content = (assistantMsg.content || '') + (assistantMsg.content ? '\n' : '') + '[发送失败:' + (err && err.message) + ']'
        assistantMsg.isStreaming = false
        this.$set(assistantMsg, 'isStreaming', false)
        this.$set(assistantMsg, 'content', assistantMsg.content)
        this.sending = false
        this.streamingMsgId = ''
        uni.showToast({ title: '发送失败', icon: 'none' })
      }

      try {
        if (this.isSupport) {
          agentApi.supportStream({ message: text, onDelta, onDone, onError })
        } else {
          agentApi.chatStream({ message: text, conversationId: this.conversationId, onDelta, onDone, onError })
        }
      } catch (e) {
        onError(e)
      }
    },
    scrollToBottom() {
      // 下一帧滚动 (等 DOM 更新)
      this.$nextTick(() => {
        const last = this.messages[this.messages.length - 1]
        if (last) this.scrollInto = 'm-' + last._id
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.cd {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;

  /* 顶部 */
  &__top {
    display: flex;
    align-items: center;
    background: $bg-card;
    padding: $spacing-sm $spacing-md;
    box-shadow: $shadow-card;
  }
  &__back {
    width: 60rpx; height: 60rpx;
    @include flex-center;
    font-size: 48rpx;
    color: $text-primary;
  }
  &__back > text { color: inherit; }
  &__title-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  &__title {
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }
  &__sub {
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__new-chat {
    padding: 8rpx 20rpx;
    background: $primary-lighter;
    color: $primary-dark;
    border-radius: $radius-pill;
    font-size: $font-sm;
  }
  &__new-chat > text { color: inherit; }

  /* 消息区 */
  &__body {
    // 2026-07-04: 用 flex:1 替代硬编码 height:calc(100vh - 280rpx)
    // 硬编码在 iPhone safe-area 下会挤压输入栏; flex:1 + min-height:0 是 uni-app H5 scroll-view 撑开父级的标准写法
    flex: 1;
    min-height: 0;
    padding: $spacing-sm $spacing-md;
  }
  &__loading, &__empty {
    text-align: center;
    padding: $spacing-2xl;
    color: $text-tertiary;
  }
  &__welcome {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    text-align: center;
  }
  &__welcome-emoji {
    font-size: 80rpx;
    margin-bottom: $spacing-sm;
  }
  &__welcome-title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }
  &__welcome-desc {
    font-size: $font-sm;
    color: $text-secondary;
    max-width: 480rpx;
  }

  &__msg {
    display: flex;
    margin-bottom: $spacing-sm;
    align-items: flex-start;
  }
  &__msg--user {
    flex-direction: row-reverse;
  }
  &__msg-avatar {
    width: 64rpx; height: 64rpx;
    border-radius: 50%;
    background: $bg-page;
    @include flex-center;
    font-size: 32rpx;
    flex-shrink: 0;
  }
  &__msg--user &__msg-avatar {
    margin-left: $spacing-sm;
  }
  &__msg--assistant &__msg-avatar {
    margin-right: $spacing-sm;
  }
  &__msg-bubble {
    max-width: 75%;
    background: $bg-card;
    padding: $spacing-sm $spacing-md;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    line-height: 1.6;
    word-break: break-word;
  }
  &__msg--user &__msg-bubble {
    background: $primary;
    color: #fff;
    border-bottom-right-radius: 4rpx;
  }
  &__msg--user &__msg-bubble > * { color: #fff; }
  &__msg--assistant &__msg-bubble {
    background: $bg-card;
    color: $text-primary;
    border-bottom-left-radius: 4rpx;
  }
  &__msg-text {
    font-size: $font-base;
    white-space: pre-wrap;
  }
  &__msg-streaming {
    color: $primary;
    animation: blink 1s steps(1) infinite;
    margin-left: 4rpx;
  }
  &__msg-streaming > text { color: inherit; }

  /* 输入框 */
  &__input-bar {
    display: flex;
    align-items: flex-end;
    background: $bg-card;
    padding: $spacing-sm $spacing-md;
    // 2026-07-04: 兼容 iPhone home indicator 底部安全区, 不加这一行输入栏会被 Home 横条遮住
    padding-bottom: calc(#{$spacing-sm} + env(safe-area-inset-bottom, 0px));
    border-top: 1rpx solid $divider-light;
    box-shadow: $shadow-float;
    flex-shrink: 0;
  }
  &__input {
    flex: 1;
    min-height: 72rpx;
    max-height: 240rpx;
    padding: 16rpx 20rpx;
    background: $bg-page;
    border-radius: $radius-md;
    font-size: $font-base;
    line-height: 1.5;
  }
  &__send {
    margin-left: $spacing-sm;
    padding: 16rpx 28rpx;
    background: $primary;
    color: #fff;
    border-radius: $radius-pill;
    font-size: $font-sm;
    font-weight: $font-weight-medium;
    flex-shrink: 0;
  }
  &__send > text { color: inherit; }
  &__send--disabled {
    background: $text-disabled;
  }
}
</style>
