<template>
  <div class="org-switcher">
    <el-select
      v-if="showSelector"
      v-model="orgId"
      placeholder="选择机构"
      size="small"
      style="width: 220px"
      filterable
      @change="onChange"
    >
      <el-option v-for="o in options" :key="o.id" :label="o.name" :value="o.id">
        <span>{{ o.name }}</span>
        <el-tag v-if="o.isMain" type="success" size="small" style="margin-left: 8px">主</el-tag>
        <el-tag v-if="o.isActive === false" type="info" size="small" style="margin-left: 8px">已停用</el-tag>
      </el-option>
    </el-select>
    <span v-else-if="currentOrg" class="single-org">{{ currentOrg.name }}</span>
    <span v-else-if="auth.isPlatformAdmin" class="single-org placeholder">尚未选择机构</span>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { orgApi } from '@/api/org'

const auth = useAuthStore()

const platformOrgs = ref([])

/**
 * 选项来源：
 *   - 平台超管：拉全量机构（带主属标记）
 *   - 普通用户：用 auth.orgs (来自 /auth/me)
 */
const options = computed(() => {
  if (auth.isPlatformAdmin) {
    const mainSet = new Set(auth.orgs.filter((o) => o.isMain).map((o) => o.id))
    return platformOrgs.value.map((o) => ({
      id: o.id || o._id,
      name: o.name,
      isActive: o.isActive,
      isMain: mainSet.has(o.id || o._id)
    }))
  }
  return auth.orgs
})

const showSelector = computed(() => {
  if (auth.isPlatformAdmin) return true
  return auth.orgs.length > 1
})

const orgId = computed({
  get: () => auth.currentOrgId,
  set: (v) => auth.setOrg(v)
})

const currentOrg = computed(() => options.value.find((o) => o.id === auth.currentOrgId))

function onChange(v) {
  auth.setOrg(v)
  // 简单刷新：路由重新加载
  window.location.reload()
}

onMounted(async () => {
  if (auth.isPlatformAdmin) {
    try {
      const r = await orgApi.list({ pageSize: 200 })
      platformOrgs.value = (r.data.items || []).map((o) => ({ ...o, id: o.id || o._id }))
      // 如果当前未选机构，自动选第一个，避免后续接口缺 x-org-id
      if (!auth.currentOrgId && platformOrgs.value.length) {
        auth.setOrg(platformOrgs.value[0].id)
      }
    } catch (_) {
      /* ignore */
    }
  }
})
</script>

<style scoped>
.org-switcher {
  display: inline-flex;
  align-items: center;
}
.single-org {
  color: #fff;
  font-size: 14px;
}
.placeholder {
  color: #f0a020;
}
</style>
