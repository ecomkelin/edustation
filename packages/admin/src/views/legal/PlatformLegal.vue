<template>
  <div class="page">
    <h2>平台法律协议</h2>
    <p class="subtitle">
      平台级协议由文件 <code>shared/legal/*.md</code> + frontmatter 版本号承载,改文件即等同发版。
      本页只读,要修改请改仓库代码 → bump version → git push → 部署后用户被强制重新同意。
    </p>

    <el-alert
      type="warning"
      :closable="false"
      title="本页只读"
      description="平台协议是 SaaS 平台层面的法律文本,所有机构、所有用户共用一份。修改请联系运维团队走 PR 流程。"
      show-icon
      class="mb"
    />

    <el-card v-loading="loading">
      <el-collapse v-model="opened" accordion>
        <el-collapse-item v-for="doc in items" :key="doc.key" :name="doc.key">
          <template #title>
            <div class="title-line">
              <span class="doc-title">{{ doc.title }}</span>
              <el-tag size="small" type="info" class="ml">v{{ doc.version }}</el-tag>
              <el-tag v-if="doc.required" size="small" type="warning" class="ml">必勾</el-tag>
              <span class="effective ml">{{ doc.effectiveAt }} 起生效</span>
            </div>
          </template>
          <div v-if="doc.summary" class="summary">{{ doc.summary }}</div>
          <MarkdownView v-loading="doc.loading" :markdown="doc.markdown" :html="doc.html" />
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { legalApi } from '@/api/legal'
import MarkdownView from '@/components/MarkdownView.vue'

const items = ref([])
const loading = ref(false)
const opened = ref('')

async function load() {
  loading.value = true
  try {
    const res = await legalApi.listPlatform()
    items.value = (res.data?.items || []).map((d) => ({ ...d, html: '', markdown: '', loading: false }))
  } finally {
    loading.value = false
  }
}

// 懒加载: 展开某项时才拉完整 markdown/html
watch(opened, async (key) => {
  if (!key) return
  const doc = items.value.find((d) => d.key === key)
  if (!doc || doc.html) return
  doc.loading = true
  try {
    const res = await legalApi.getPlatform(key)
    doc.html = res.data?.html || ''
    doc.markdown = res.data?.markdown || ''
  } finally {
    doc.loading = false
  }
})

onMounted(load)
</script>

<style scoped>
.page { padding: 8px; }
.subtitle { color: #909399; margin: 0 0 16px; font-size: 13px; line-height: 1.6; }
.subtitle code {
  padding: 1px 6px;
  background: #f5f7fa;
  border-radius: 3px;
  font-size: 12px;
  color: #c7254e;
}
.mb { margin-bottom: 16px; }
.title-line { display: flex; align-items: center; gap: 8px; flex: 1; }
.doc-title { font-size: 15px; font-weight: 500; color: #303133; }
.ml { margin-left: 8px; }
.effective { color: #909399; font-size: 12px; margin-left: auto; padding-right: 12px; }
.summary {
  margin: 8px 0 16px;
  padding: 8px 12px;
  background: #fafafa;
  border-left: 3px solid #409EFF;
  color: #606266;
  font-size: 13px;
}
</style>
