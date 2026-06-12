<template>
  <div class="kpi-card" :class="`accent-${accent || 'default'}`">
    <div class="kpi-label">{{ label }}</div>
    <div class="kpi-value-row">
      <span class="kpi-value">{{ value }}</span>
      <span v-if="unit" class="kpi-unit">{{ unit }}</span>
    </div>
    <div v-if="extra" class="kpi-extra">{{ extra }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  unit: { type: String, default: '' },
  extra: { type: String, default: '' },
  accent: { type: String, default: 'default' } // default / green / blue / orange / red
})
</script>

<style lang="scss" scoped>
.kpi-card {
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  &.accent-green { border-left: 3px solid #67c23a; }
  &.accent-blue  { border-left: 3px solid #409eff; }
  &.accent-orange{ border-left: 3px solid #e6a23c; }
  &.accent-red   { border-left: 3px solid #f56c6c; }
  &.accent-default { border-left: 3px solid #dcdfe6; }
  .kpi-label { color: #909399; font-size: 12px; }
  .kpi-value-row { display: flex; align-items: baseline; gap: 4px; }
  .kpi-value { font-size: 22px; font-weight: 600; color: #303133; line-height: 1.2; }
  .kpi-unit  { color: #909399; font-size: 12px; }
  .kpi-extra { color: #c0c4cc; font-size: 12px; }
}
</style>
