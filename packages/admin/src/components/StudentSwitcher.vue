<template>
  <div class="student-switcher">
    <span v-if="!active">未选择孩子</span>
    <span v-else>当前孩子：{{ activeName }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const active = computed(() => !!auth.activeStudentId)
const activeName = computed(() => auth.activeStudentName || auth.activeStudentId)
</script>

<style scoped>
.student-switcher {
  color: #fff;
  font-size: 14px;
}
</style>
