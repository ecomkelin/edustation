<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="800px"
    top="40px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="dialog-body">
      <MarkdownView :html="doc.html" :markdown="doc.markdown" />
    </div>
    <template #footer>
      <span class="version" v-if="doc.version">v{{ doc.version }} · {{ doc.effectiveAt }}</span>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { legalApi } from '@/api/legal'
import MarkdownView from '@/components/MarkdownView.vue'

const props = defineProps({
  modelValue: Boolean,
  /** 'user-agreement' / 'privacy-policy' / 'minor-info' / 'cookie-policy' / 'platform-saas-agreement' */
  agreementKey: { type: String, required: true }
})
defineEmits(['update:modelValue'])

const loading = ref(false)
const doc = reactive({ html: '', markdown: '', version: '', effectiveAt: '', title: '' })

const title = ref('')

watch(
  () => [props.modelValue, props.agreementKey],
  async ([visible, key]) => {
    if (!visible || !key) return
    loading.value = true
    doc.html = ''
    doc.markdown = ''
    try {
      const res = await legalApi.getPlatform(key)
      const d = res.data || {}
      doc.html = d.html || ''
      doc.markdown = d.markdown || ''
      doc.version = d.version
      doc.effectiveAt = d.effectiveAt
      doc.title = d.title
      title.value = d.title || key
    } finally {
      loading.value = false
    }
  },
  { immediate: false }
)
</script>

<style scoped>
.dialog-body { max-height: 60vh; overflow-y: auto; padding: 0 4px; }
.version { color: #909399; font-size: 12px; margin-right: auto; padding-left: 4px; }
</style>
