<template>
  <div class="leads-hub">
    <!--
      潜客管理 容器 (2026-06-26 用户决策)
      - 合并原来的「潜客管理(按家长)」「孩子管理」两个同级菜单/页面
      - 用 el-tabs 切: 孩子(默认) / 家长
      - URL 同步 ?tab=child / ?tab=parent — 浏览器前进/后退/分享/刷新都能保留
      - 菜单点击不带 query → 走默认 tab=child
      - tab 内容各自独立组件 (ChildLeads / Parents), 互不耦合, 后续迭代两 tab 改动互不影响
    -->
    <el-tabs
      v-model="activeTab"
      class="leads-tabs"
      @tab-change="onTabChange"
    >
      <el-tab-pane name="child" label="孩子">
        <ChildLeads />
      </el-tab-pane>
      <el-tab-pane name="parent" label="家长">
        <Parents />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChildLeads from './ChildLeads.vue'
import Parents from './Parents.vue'

const route = useRoute()
const router = useRouter()

// 2026-06-26: tab 用 URL ?tab= 同步; 默认 child
//   - 合法值限定 'child' / 'parent', 其它值 (含 undefined) 落到 child
//   - 菜单点进来不带 query → 默认 child (与用户期望一致)
const ALLOWED_TABS = ['child', 'parent']
const activeTab = ref(normalizeTab(route.query.tab))

function normalizeTab(v) {
  return ALLOWED_TABS.includes(v) ? v : 'child'
}

function onTabChange(name) {
  // tab 切换 → 把当前 tab 写回 URL (replace 不污染历史栈, 用户在 tab 内部翻页/筛选项 不该让后退一次就跳到上一个 tab)
  router.replace({ query: { ...route.query, tab: name } })
}

// 浏览器后退/外部链接带 ?tab=parent 进来 → 响应
watch(() => route.query.tab, (v) => {
  const next = normalizeTab(v)
  if (next !== activeTab.value) activeTab.value = next
})

// 进页时如果 URL 没有 tab, 主动写一次, 让用户能直接复制当前 URL 给别人
onMounted(() => {
  if (!route.query.tab) {
    router.replace({ query: { ...route.query, tab: activeTab.value } })
  }
})
</script>

<style scoped>
.leads-hub { padding: 16px; }
/* 顶 tab 跟页面 padding 0 对齐, 跟原来 Parents/ChildLeads 自带 padding=16px 视觉一致 */
.leads-tabs :deep(.el-tabs__header) { margin-bottom: 16px; }
</style>
