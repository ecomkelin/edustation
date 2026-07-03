<!--
  科普文章编辑/创建 dialog
  对应 R-3603 create / R-3604 update
  平台超管专属 (requirePlatformAdmin)
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '编辑文章' : '新建文章'"
    width="780px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" v-loading="loading">
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" maxlength="100" show-word-limit placeholder="吸引家长的标题, 1-100 字" />
      </el-form-item>

      <el-form-item label="分类">
        <el-input v-model="form.category" maxlength="50" placeholder="如 science / parenting / safety, 留空 = 全部" />
      </el-form-item>

      <el-form-item label="emoji封面">
        <el-input v-model="form.coverEmoji" maxlength="4" style="width: 120px;" placeholder="例如 💻" />
        <span class="hint">不用图床, 临时占位封面 (后续可挂 file)</span>
      </el-form-item>

      <el-form-item label="摘要" prop="summary">
        <el-input v-model="form.summary" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="列表卡片副标题, 1-200 字" />
      </el-form-item>

      <el-form-item label="正文(MD)" prop="contentMarkdown">
        <el-input
          v-model="form.contentMarkdown"
          type="textarea"
          :rows="14"
          placeholder="支持 Markdown 语法, 保存时服务端预编译 HTML; 标题 / 列表 / 强调 / 引用都可用"
        />
      </el-form-item>

      <el-form-item label="发布">
        <el-switch v-model="form.isPublished" active-text="已发布" inactive-text="草稿" />
        <span class="hint">从草稿发布时, publishedAt 自动设为当前时间</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { articleApi } from '@/api/article'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  initialData: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const formRef = ref(null)
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  title: '',
  summary: '',
  contentMarkdown: '',
  coverEmoji: '📖',
  category: '',
  isPublished: false
})

const isEdit = computed(() => !!props.initialData && !!props.initialData._id)

watch(
  () => props.modelValue,
  (v) => {
    if (v) reset()
  }
)

watch(
  () => props.initialData,
  (v) => {
    if (v) syncFrom(v)
  },
  { immediate: true }
)

function syncFrom(row) {
  form.title = row.title || ''
  form.summary = row.summary || ''
  form.contentMarkdown = row.contentMarkdown || ''
  form.coverEmoji = row.meta?.coverEmoji || '📖'
  form.category = row.category || ''
  form.isPublished = !!row.isPublished
}

function reset() {
  if (props.initialData) {
    syncFrom(props.initialData)
  } else {
    form.title = ''
    form.summary = ''
    form.contentMarkdown = ''
    form.coverEmoji = '📖'
    form.category = ''
    form.isPublished = false
  }
}

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  summary: [],
  contentMarkdown: [{ required: true, message: '请输入正文', trigger: 'blur' }]
}

async function onSave() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch { return }
  saving.value = true
  try {
    const payload = {
      title: form.title,
      summary: form.summary,
      contentMarkdown: form.contentMarkdown,
      category: form.category,
      isPublished: form.isPublished
    }
    if (form.coverEmoji) {
      // meta.coverEmoji 走 $set 到 meta; 后端 cover 字段是 coverFile 路径, 这里走 meta
      payload.coverFile = null
    }
    if (isEdit.value) {
      await articleApi.update(props.initialData._id, payload)
      ElMessage.success('已保存')
    } else {
      await articleApi.create(payload)
      ElMessage.success('已创建')
    }
    emit('saved')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.hint {
  margin-left: 12px;
  color: #999;
  font-size: 12px;
}
</style>
