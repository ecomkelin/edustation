<template>
  <slot v-if="allowed" />
  <el-empty v-else description="无权限" :image-size="80" />
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  perm: { type: String, required: true }
})

const auth = useAuthStore()
const allowed = computed(() => {
  if (auth.isPlatformAdmin) return true
  const cur = auth.orgs.find((o) => o.id === auth.currentOrgId)
  if (!cur) return false
  return (cur.positions || []).some((p) => (p.permissions || []).includes(props.perm))
})
</script>
