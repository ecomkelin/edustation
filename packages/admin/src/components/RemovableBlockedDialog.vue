<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="560px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    destroy-on-close
    @update:model-value="onUpdate"
  >
    <div class="blocked-dialog">
      <!-- 顶部：对象 -->
      <div v-if="target" class="blocked-target">
        <span class="label">对象</span>
        <b class="value">{{ target }}</b>
      </div>

      <!-- 概览 -->
      <div class="blocked-summary">
        共发现 <b class="count">{{ totalCount }}</b> 项关联数据，阻止本次物理删除。
      </div>

      <!-- 关联数据列表（用 div+flex 模拟表格，比原生 table 更可控）-->
      <div class="blocked-list">
        <div class="blocked-row blocked-head">
          <div class="col-label">关联数据</div>
          <div class="col-count">数量</div>
          <div class="col-hint">建议操作</div>
        </div>
        <div v-for="(b, i) in blockers" :key="i" class="blocked-row">
          <div class="col-label">
            <el-tag type="danger" size="small" effect="light">{{ b.label || '关联数据' }}</el-tag>
          </div>
          <div class="col-count">
            <b>{{ b.count }}</b><span class="unit">条</span>
          </div>
          <div class="col-hint">{{ b.hint || '请先处理相关数据' }}</div>
        </div>
      </div>

      <!-- 引导文字 -->
      <div class="blocked-foot">
        <el-icon style="vertical-align: -2px; margin-right: 4px;"><InfoFilled /></el-icon>
        请依次处理以上关联数据后，再回到此页尝试删除。处理过程中遇到问题请联系系统管理员。
      </div>
    </div>

    <template #footer>
      <el-button type="primary" @click="close">我知道了</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'

/**
 * 「无法删除」专用弹窗。
 *
 * 解决 ElMessageBox.alert + dangerouslyUseHTMLString: true 渲染大段 HTML 时
 * 不稳定的问题（v-html 在某些 EP 版本里被剥离、表格被 message 默认 padding 压扁等）。
 * 用 ElDialog 走 Vue 模板，结构和样式都可控。
 *
 * Props:
 *   - visible:  boolean  双向绑定显示状态
 *   - title:    string   弹窗标题，默认「无法删除」
 *   - target:   string   被删除对象名（点明是哪一条）
 *   - blockers: Array<{label,count,hint}>
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '无法删除' },
  target: { type: String, default: '' },
  blockers: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:visible', 'close'])

const totalCount = computed(() => {
  return (props.blockers || []).reduce((sum, b) => sum + (Number(b && b.count) || 0), 0)
})

function close() {
  emit('update:visible', false)
  emit('close')
}

function onUpdate(v) {
  emit('update:visible', v)
  if (!v) emit('close')
}
</script>

<style scoped>
.blocked-dialog {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

.blocked-target {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 4px;
  margin-bottom: 14px;
  color: #b88230;
  font-size: 13px;
  line-height: 1.6;
}
.blocked-target .label {
  color: #909399;
}
.blocked-target .value {
  color: #b88230;
  font-size: 14px;
}

.blocked-summary {
  margin-bottom: 10px;
  color: #303133;
  font-size: 14px;
  line-height: 1.6;
}
.blocked-summary .count {
  color: #f56c6c;
  font-size: 18px;
  margin: 0 2px;
}

.blocked-list {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
}
.blocked-row {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid #ebeef5;
}
.blocked-row:last-child {
  border-bottom: none;
}
.blocked-head {
  background: #f5f7fa;
  color: #909399;
  font-size: 12px;
}
.blocked-head > div {
  padding: 8px 12px;
  font-weight: 500;
}

.col-label {
  width: 110px;
  flex-shrink: 0;
  padding: 12px;
  display: flex;
  align-items: center;
}
.col-count {
  width: 80px;
  flex-shrink: 0;
  padding: 12px;
  text-align: right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  color: #303133;
  font-size: 14px;
}
.col-count .unit {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}
.col-hint {
  flex: 1;
  padding: 12px;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.blocked-foot {
  margin-top: 14px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
</style>
