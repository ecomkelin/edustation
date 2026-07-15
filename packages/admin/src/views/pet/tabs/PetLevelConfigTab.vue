<!--
  PetLevelConfigTab (2026-07-15)
  从原 PetLevelConfigAdmin.vue 整体迁移, body 不变; 只去掉原 page-header h2 (容器页已有 h2, 避免重复).
-->
<template>
  <div class="pet-level-config">
    <div class="tab-tip">
      <el-tooltip content="控制本机构宠物的最大等级与每级所需经验。经验公式：expToNext(L) = 基础经验 + 每级增量 × (L - 1)" placement="bottom">
        <el-icon class="help-icon"><QuestionFilled /></el-icon>
      </el-tooltip>
      <span class="tab-tip-text">本机构宠物等级/经验曲线（per-org 可配，默认 12 级 / 100 + 50×(L-1)）</span>
    </div>

    <el-card v-loading="loading" class="config-card">
      <el-form :model="form" label-width="140px" style="max-width: 480px">
        <el-form-item label="最大等级">
          <el-input-number v-model="form.maxLevel" :min="1" :max="100" />
          <span class="hint">满级后经验封顶、不再升级（默认 12）</span>
        </el-form-item>
        <el-form-item label="基础经验 (expBase)">
          <el-input-number v-model="form.expBase" :min="1" :max="1000000" :step="10" />
          <span class="hint">1 级升 2 级所需经验（默认 100）</span>
        </el-form-item>
        <el-form-item label="每级增量 (expIncrement)">
          <el-input-number v-model="form.expIncrement" :min="0" :max="1000000" :step="10" />
          <span class="hint">每升一级额外增加的经验需求（默认 50）</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          <el-button @click="load">重置</el-button>
        </el-form-item>
      </el-form>

      <el-divider>各级经验曲线预览</el-divider>
      <el-table :data="curveRows" size="small" border style="max-width: 480px">
        <el-table-column prop="level" label="等级" width="120">
          <template #default="{ row }">Lv.{{ row.level }}</template>
        </el-table-column>
        <el-table-column prop="need" label="升到下一级所需经验">
          <template #default="{ row }">
            <span v-if="row.need == null" class="maxed">已满级</span>
            <span v-else>{{ row.need }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { petCatalogApi } from '@/api/petCatalog'

const loading = ref(false)
const saving = ref(false)
const form = ref({ maxLevel: 12, expBase: 100, expIncrement: 50 })

const curveRows = computed(() => {
  const rows = []
  const { maxLevel, expBase, expIncrement } = form.value
  for (let L = 1; L <= maxLevel; L++) {
    rows.push({ level: L, need: L >= maxLevel ? null : expBase + expIncrement * (L - 1) })
  }
  return rows
})

async function load() {
  loading.value = true
  try {
    const r = await petCatalogApi.getLevelConfig()
    const d = r.data || r
    form.value = {
      maxLevel: d.maxLevel ?? 12,
      expBase: d.expBase ?? 100,
      expIncrement: d.expIncrement ?? 50
    }
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await petCatalogApi.updateLevelConfig({ ...form.value })
    ElMessage.success('已保存')
    await load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 18px; }
.help-icon { color: #909399; cursor: help; }
.config-card { max-width: 720px; }
.hint { margin-left: 12px; color: #909399; font-size: 12px; }
.maxed { color: #67c23a; }
</style>
