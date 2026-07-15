<!--
  PetCatalogAdmin (2026-07-15)
  合并 3 个 catalog 页到单页 3 标签:
    - 宠物图鉴 (species, platform-only, 写操作后端 requirePlatformAdmin 兜底)
    - 食物玩具 (consumables, 同上)
    - 宠物等级配置 (level-config, per-org 机构管理员可改本机构)
  URL ?tab=species|consumables|level-config 同步 (deep-linkable).
  旧链接兼容: /pet/species, /pet/consumables, /pet/level-config (router/index.js redirect).
  复用 3 个 tab-body 子组件 (PetSpeciesTab / PetConsumableTab / PetLevelConfigTab),
  body 来自原 PetSpeciesAdmin / PetConsumableAdmin / PetLevelConfigAdmin (2026-06-21 ~ 2026-07-15),
  整体平移仅 name 字段微调, 内部逻辑零改动.
-->
<template>
  <div class="page pet-catalog-page">
    <h2>宠物管理<PageHelp title="页面说明" :max-width="460">
      <strong>宠物图鉴</strong>: 平台级共享物种 (video 推荐 9:16), 全机构共用一份。<br />
      <strong>食物玩具</strong>: 喂食消耗品图鉴, 单套数值 (无等阶)。<br />
      <strong>宠物等级配置</strong>: 本机构宠物等级曲线 (per-org 可配, 默认 12 级 / 100 + 50×(L-1))。<br />
      <strong>权限</strong>: 图鉴 + 食物玩具 写操作仅平台超管 (后端兜底); 等级配置机构管理员可改本机构。
    </PageHelp></h2>

    <el-tabs v-model="activeTab" class="pet-catalog-tabs">
      <el-tab-pane label="宠物图鉴" name="species">
        <PetSpeciesTab />
      </el-tab-pane>
      <el-tab-pane label="食物玩具" name="consumables">
        <PetConsumableTab />
      </el-tab-pane>
      <el-tab-pane label="宠物等级配置" name="level-config">
        <PetLevelConfigTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PetSpeciesTab from './tabs/PetSpeciesTab.vue'
import PetConsumableTab from './tabs/PetConsumableTab.vue'
import PetLevelConfigTab from './tabs/PetLevelConfigTab.vue'
import PageHelp from '@/components/PageHelp.vue'

const VALID_TABS = ['species', 'consumables', 'level-config']
const DEFAULT_TAB = 'species'

const route = useRoute()
const router = useRouter()

// 初始值: URL ?tab= 合法则用之, 否则默认 species
const initial = VALID_TABS.includes(route.query.tab) ? route.query.tab : DEFAULT_TAB
const activeTab = ref(initial)

// tab → URL: replace 不入栈, 避免浏览器后退键被 tab 切换污染
watch(activeTab, (v) => {
  if (!VALID_TABS.includes(v)) return
  if (route.query.tab === v) return
  router.replace({ path: '/pet/catalog', query: { ...route.query, tab: v } })
})

// URL → tab: 处理浏览器后退/前进/外部 deep-link
watch(() => route.query.tab, (v) => {
  const next = VALID_TABS.includes(v) ? v : DEFAULT_TAB
  if (next !== activeTab.value) activeTab.value = next
})
</script>

<style scoped>
.pet-catalog-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* tab 内容与上方 h2 标题之间留点呼吸空间 */
.pet-catalog-tabs :deep(.el-tabs__content) { padding-top: 8px; }
</style>