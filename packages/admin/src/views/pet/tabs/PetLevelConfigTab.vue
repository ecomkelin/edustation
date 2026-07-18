<!--
  PetLevelConfigTab (2026-07-15 立项；2026-07-16 升级为逐级手填；2026-07-18 删 maxLevel 文案)
  经验曲线：base + increment 公式兜底 + 可逐级覆盖的 overrides 表（手动调整）。
  最高等级：2026-07-18 起由各 PetSpecies 的「各等级形象 (levelVisuals[])」列表本身决定
    (max(levelVisuals[].level)，空数组 → DEFAULT_SPECIES_MAX_LEVEL=1 兜底, 即"蛋态默认"只能 1 级);
    本页不再有"最高等级"概念 — 详细见 shared/petConfig.js。
-->
<template>
  <div class="pet-level-config">
    <div class="tab-tip">
      <el-tooltip
        content="逐级管理本机构宠物的晋升经验。未列出的等级仍按公式（基础经验 + 每级增量 × (L-1)）自动计算。物种最高等级由「宠物图鉴 → 各等级形象」列表决定（无覆盖时按 1 级兜底，即'蛋态默认'不能升级）。"
        placement="bottom"
      >
        <el-icon class="help-icon"><QuestionFilled /></el-icon>
      </el-tooltip>
      <span class="tab-tip-text">本机构宠物经验曲线（per-org 可配，公式 + 逐级覆盖）；物种最高等级在「宠物图鉴」由「各等级形象」列表决定</span>
    </div>

    <el-card v-loading="loading" class="config-card">
      <!-- 仅基础经验 + 锁定增量两段; 公式细节由每行覆盖表自带"公式默认"列实时显示 -->
      <div class="curve-summary">
        <div class="curve-summary-item">
          <span class="curve-summary-label">基础经验 (expBase)</span>
          <el-input-number v-model="form.expBase" :min="1" :max="1000000" :step="10" />
          <span class="hint">默认 100；公式 <code>expToNext(L) = {{ form.expBase }} + {{ LOCKED_EXP_INCREMENT }} × (L−1)</code></span>
        </div>
        <div class="curve-summary-item">
          <span class="curve-summary-label">每级增量 (expIncrement)</span>
          <span class="locked-value">{{ LOCKED_EXP_INCREMENT }}</span>
          <span class="hint">已锁定 — 逐级差异在下方覆盖表里手填</span>
        </div>
      </div>

      <el-divider>逐级覆盖（手动调整某一级所需经验）</el-divider>

      <div class="overrides-toolbar">
        <span class="toolbar-hint">
          共 <strong>{{ form.levelExpOverrides.length }}</strong> 条
          <el-tooltip
            content="严格规则: 只能删除最大覆盖级（最后一行），避免等级链中间断开。如需移除中间级，请先把更高一级删除。"
            placement="top"
          >
            <el-icon class="rule-hint-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </span>
        <div class="toolbar-actions">
          <el-button size="small" @click="prefillByFormula">用公式补齐到 Lv.{{ suggestedMaxLevel }}</el-button>
          <el-button size="small" type="primary" :icon="Plus" @click="addRow">新增一级</el-button>
          <el-button size="small" @click="clearAll" :disabled="form.levelExpOverrides.length === 0">清空覆盖</el-button>
        </div>
      </div>

      <el-table :data="form.levelExpOverrides" size="small" border class="overrides-table" row-key="rowKey" key-field="rowKey">
        <el-table-column label="起始等级" width="120" align="center">
          <template #default="{ row }">
            <!-- 起始等级只读 (产品决策 2026-07-16): 用户意图是 "为这条链新增一级覆盖"，
                 不是去手动改 level。新增一级 / 删除最大级已足够调整覆盖范围。 -->
            <span class="level-chip">Lv.{{ row.level }}</span>
          </template>
        </el-table-column>
        <el-table-column label="升到下一级所需经验" min-width="200">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.exp"
              :min="1"
              :max="1000000"
              :step="10"
              size="small"
              controls-position="right"
              @change="(v) => updateRowExp(row, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="公式默认" min-width="220">
          <template #default="{ row }">
            <span class="formula-preview">{{ expByFormula(row.level) }}</span>
            <span class="formula-tip">基础 {{ form.expBase }} + 增量 {{ LOCKED_EXP_INCREMENT }} × {{ row.level - 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right" align="center">
          <template #default="{ $index, row }">
            <!-- 严格规则: 只能删最大覆盖级 (避免与更高等级脱节) -->
            <el-tooltip
              v-if="!canRemoveRow(row)"
              content="仅最大覆盖级可删；如需移除此条，请先调整等级或删除更高一级"
              placement="top"
            >
              <el-button size="small" type="danger" link disabled>删除</el-button>
            </el-tooltip>
            <el-button
              v-else
              size="small"
              type="danger"
              link
              @click="removeRow($index)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="save-bar">
        <el-button type="primary" :loading="saving" :disabled="!canSave" @click="save">保存</el-button>
        <el-button @click="load" :disabled="saving">重置</el-button>
        <span v-if="dirty" class="dirty-tip">有未保存的改动</span>
      </div>

      <!--
        2026-07-16: 删掉重复的"各级经验曲线预览"表。
        原预览表与上方"逐级覆盖"表完全重叠（同一份 Lv→exp 数据），
        上方覆盖表已有"公式默认"列实时显示与公式值的差，预览表纯冗余。
        满级后的行为：expToNext(L) 在 level >= resolveMaxLevel(species) 时返回 null；
        2026-07-18: 最高等级由 species.levelVisuals[].max 派生 (无字段 maxLevel)。
        详情见 shared/petConfig.js 文档。
      -->
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { petCatalogApi } from '@/api/petCatalog'
// shared/petConfig.js 是 CJS；走 .mjs 桥接避免 Vite/esbuild 把 CJS 转 ESM 后
// 顶层 named import 拿到 { default: ... } 而没有真实 named exports (2026-07-16)。
import { LOCKED_EXP_INCREMENT } from '@shared/petConfig.mjs'

const loading = ref(false)
const saving = ref(false)
// expIncrement 已锁定（产品决策：固定 300），不再可编辑（2026-07-16）
const form = ref({ expBase: 100, levelExpOverrides: [] })
const dirty = ref(false)

// 用公式补齐时的目标最高级（建议 12，避免误填到 100）
const suggestedMaxLevel = 12

let rowSeq = 0
function nextRowKey() {
  rowSeq += 1
  return `r${Date.now().toString(36)}_${rowSeq}`
}

function markDirty() {
  dirty.value = true
}

// 公式默认值（用于面板上的「公式默认」列 + 「用公式补齐」）
function expByFormula(level) {
  const base = Number(form.value.expBase) || 0
  return base + LOCKED_EXP_INCREMENT * (level - 1)
}

const canSave = computed(() => dirty.value && !saving.value)

async function load() {
  loading.value = true
  try {
    const r = await petCatalogApi.getLevelConfig()
    const d = r.data || r
    const overrides = Array.isArray(d.levelExpOverrides)
      ? d.levelExpOverrides
      : Object.keys(d.levelExpOverrides || {}).map(k => ({ level: Number(k), exp: d.levelExpOverrides[k] }))
    form.value = {
      expBase: d.expBase ?? 100,
      // expIncrement 锁定 → 从入参里无视；后端 normalizeLevelConfig 也会强制 = 300
      levelExpOverrides: overrides
        .filter(o => Number.isFinite(Number(o.level)) && Number.isFinite(Number(o.exp)) && Number(o.exp) > 0)
        .map(o => ({ rowKey: nextRowKey(), level: Number(o.level), exp: Number(o.exp) }))
        .sort((a, b) => a.level - b.level)
    }
    dirty.value = false
  } finally {
    loading.value = false
  }
}

function addRow() {
  const used = new Set(form.value.levelExpOverrides.map(r => Number(r.level)))
  let next = 1
  while (used.has(next)) next += 1
  form.value.levelExpOverrides.push({ rowKey: nextRowKey(), level: next, exp: expByFormula(next) })
  markDirty()
}

function updateRowExp(row, v) {
  const exp = Number(v)
  if (!Number.isFinite(exp) || exp <= 0) return
  row.exp = exp
  markDirty()
}

/**
 * 严格删除规则 (2026-07-16): 只能删最大覆盖级。
 * 覆盖表按 level 升序——"最大"指当前所有行里 level 最大者。
 * 删中间级会让 Lv.X 与 Lv.(X+2) 之间脱节 (Lv.X+1 退回公式，但意图不明)，
 * 所以必须先调整/删除更高一级的覆盖才能动这一级。
 */
function canRemoveRow(row) {
  const list = form.value.levelExpOverrides || []
  if (list.length === 0) return false
  const rowLevel = Number(row.level)
  return list.every(r => Number(r.level) <= rowLevel)
}

function removeRow(idx) {
  const list = form.value.levelExpOverrides || []
  const target = list[idx]
  if (!target || !canRemoveRow(target)) {
    ElMessage.warning('只能删除最大覆盖级；如需移除此条，请先调整或删除更高一级')
    return
  }
  list.splice(idx, 1)
  markDirty()
}

async function clearAll() {
  try {
    await ElMessageBox.confirm('清空所有覆盖项后，未列出的等级将按公式计算。确认继续？', '提示', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
  } catch (e) {
    return
  }
  form.value.levelExpOverrides = []
  markDirty()
}

function prefillByFormula() {
  // 用 expBase + LOCKED_EXP_INCREMENT 公式生成 1..suggestedMaxLevel 的覆盖
  const rows = []
  for (let L = 1; L <= suggestedMaxLevel; L++) {
    rows.push({ rowKey: nextRowKey(), level: L, exp: expByFormula(L) })
  }
  form.value.levelExpOverrides = rows
  markDirty()
  ElMessage.success(`已按公式（基础 ${form.value.expBase} + 增量 ${LOCKED_EXP_INCREMENT}）补齐 ${suggestedMaxLevel} 条`)
}

function validatePayload(rows) {
  const seen = new Set()
  for (const r of rows) {
    const lvl = Number(r.level)
    const exp = Number(r.exp)
    if (!Number.isFinite(lvl) || lvl < 1 || lvl > 100) return `等级必须为 1-100 之间`
    if (!Number.isFinite(exp) || exp <= 0) return `Lv.${lvl} 的经验必须为正数`
    if (seen.has(lvl)) return `Lv.${lvl} 重复（每条 level 必须唯一）`
    seen.add(lvl)
  }
  return null
}

async function save() {
  const err = validatePayload(form.value.levelExpOverrides)
  if (err) {
    ElMessage.error(err)
    return
  }
  saving.value = true
  try {
    const payload = {
      expBase: Math.max(1, Number(form.value.expBase) || 1),
      // expIncrement 已锁定 300：前端不再发送，后端 normalizeLevelConfig 也会强制
      levelExpOverrides: form.value.levelExpOverrides
        .map(r => ({ level: Number(r.level), exp: Number(r.exp) }))
        .sort((a, b) => a.level - b.level)
    }
    await petCatalogApi.updateLevelConfig(payload)
    dirty.value = false
    ElMessage.success('已保存')
    await load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.pet-level-config { display: flex; flex-direction: column; gap: 12px; }
.tab-tip { display: flex; align-items: center; gap: 6px; color: #606266; font-size: 13px; }
.help-icon { color: #909399; cursor: help; }
.config-card { width: 100%; }
.hint { margin-left: 12px; color: #909399; font-size: 12px; }

/* 顶部两段: 基础经验 / 锁定增量 横向铺开 (公式细节在覆盖表每行自带) */
.curve-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 36px;
  padding: 4px 0 8px;
  margin-bottom: 4px;
}
.curve-summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.curve-summary-label {
  color: #606266;
  font-size: 13px;
  white-space: nowrap;
}
.hint code {
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
  margin: 0 2px;
}
.locked-value {
  display: inline-block;
  min-width: 64px;
  padding: 4px 12px;
  background: #f5f7fa;
  border: 1px dashed #c0c4cc;
  border-radius: 4px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: #606266;
  font-weight: 600;
}
.overrides-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 12px; flex-wrap: wrap; }
.toolbar-hint { color: #606266; font-size: 12px; }
.toolbar-hint code { background: #f5f7fa; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.rule-hint-icon { color: #909399; cursor: help; margin-left: 4px; font-size: 14px; vertical-align: -2px; }
.toolbar-actions { display: flex; gap: 8px; }
.overrides-table { width: 100%; }
.formula-preview { font-family: ui-monospace, Menlo, Consolas, monospace; color: #909399; margin-right: 8px; }
.formula-tip { color: #c0c4cc; font-size: 11px; }
.level-chip {
  display: inline-block;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-weight: 600;
  color: #303133;
  background: #f5f7fa;
  padding: 2px 10px;
  border-radius: 10px;
  border: 1px solid #e4e7ed;
  font-size: 13px;
}
.save-bar { margin-top: 16px; display: flex; align-items: center; gap: 12px; }
.dirty-tip { color: #e6a23c; font-size: 12px; }
.maxed { color: #67c23a; }
</style>
