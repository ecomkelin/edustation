<!--
  协议详情 - 渲染 markdown
-->
<template>
  <view class="legal-detail">
    <view v-if="loading" class="legal-detail__loading">
      <view class="legal-detail__loading-circle" />
      <text>加载中...</text>
    </view>
    <scroll-view v-else scroll-y class="legal-detail__body">
      <text class="legal-detail__title">{{ title }}</text>
      <view class="legal-detail__html" v-html="renderedHtml" />
    </scroll-view>
  </view>
</template>

<script>
import { legalApi } from '@/api/legal'
export default {
  data() {
    return {
      loading: true,
      title: '协议',
      key: '',
      scope: 'platform',
      orgId: '',
      content: ''
    }
  },
  computed: {
    renderedHtml() {
      return this._render(this.content)
    }
  },
  onLoad(query) {
    this.key = query.key || 'user-agreement'
    this.title = decodeURIComponent(query.title || '协议详情')
    this.scope = query.scope || 'platform'
    this.orgId = query.orgId || ''
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        let res
        if (this.scope === 'org' && this.orgId) {
          res = await legalApi.orgDoc(this.orgId, this.key)
        } else {
          res = await legalApi.platformDoc(this.key)
        }
        this.content = res?.content || res?.html || res?.text || ''
        if (!this.content) this.content = '# 协议\n\n该协议内容暂未提供。'
      } catch (e) {
        this.content = '# 加载失败\n\n' + (e.message || '请稍后再试')
      } finally {
        this.loading = false
      }
    },
    _escape(s) {
      return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
    },
    _render(md) {
      if (!md) return ''
      const lines = md.split('\n')
      let html = ''
      let inList = false
      for (const line of lines) {
        const t = line.trim()
        if (!t) {
          if (inList) { html += '</ul>'; inList = false }
          html += '<br/>'
          continue
        }
        if (t.startsWith('# ')) {
          if (inList) { html += '</ul>'; inList = false }
          html += `<h2>${this._escape(t.slice(2))}</h2>`
        } else if (t.startsWith('## ')) {
          if (inList) { html += '</ul>'; inList = false }
          html += `<h3>${this._escape(t.slice(3))}</h3>`
        } else if (t.match(/^[-*] /)) {
          if (!inList) { html += '<ul>'; inList = true }
          let li = this._escape(t.slice(2))
          li = li.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          html += `<li>${li}</li>`
        } else {
          if (inList) { html += '</ul>'; inList = false }
          let p = this._escape(t)
          p = p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          html += `<p>${p}</p>`
        }
      }
      if (inList) html += '</ul>'
      return html
    }
  }
}
</script>

<style lang="scss" scoped>
.legal-detail {
  min-height: 100vh;
  background: $bg-page;

  &__loading {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    color: $text-secondary;
  }

  &__loading-circle {
    width: 80rpx;
    height: 80rpx;
    border: 6rpx solid $divider;
    border-top-color: $primary;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: $spacing-md;
  }

  &__body {
    padding: $spacing-lg $spacing-md;
    min-height: 100vh;
  }

  &__title {
    display: block;
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    text-align: center;
    margin-bottom: $spacing-lg;
  }

  &__html {
    color: $text-primary;
    font-size: $font-base;
    line-height: 1.8;

    :deep(h2) {
      font-size: $font-xl;
      font-weight: $font-weight-semibold;
      margin: $spacing-lg 0 $spacing-sm;
      color: $primary;
    }
    :deep(h3) {
      font-size: $font-md;
      font-weight: $font-weight-semibold;
      margin: $spacing-md 0 $spacing-sm;
    }
    :deep(p) {
      margin: $spacing-sm 0;
    }
    :deep(ul) {
      padding-left: $spacing-md;
      margin: $spacing-sm 0;
    }
    :deep(li) {
      margin: $spacing-xs 0;
      list-style: disc;
    }
    :deep(strong) {
      color: $primary;
      font-weight: $font-weight-semibold;
    }
  }
}
</style>