<template>
  <div class="page dashboard">
    <div class="dash-header">
      <h2>欢迎回来，{{ auth.user?.realName || auth.user?.mobile || '同事' }}</h2>
      <p class="hint">请从左侧菜单进入你需要的功能模块。</p>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<style lang="scss" scoped>
.dashboard {
  .dash-header {
    h2 { margin: 0 0 8px; }
    .hint { color: #909399; font-size: 14px; margin: 0; }
  }
}
</style>