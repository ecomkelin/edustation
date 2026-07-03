<!--
  科普视频编辑/创建 dialog
  对应 R-3805 create / R-3806 update
  平台超管专属 (requirePlatformAdmin)
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '编辑视频' : '新建视频'"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" maxlength="80" show-word-limit placeholder="吸引家长点击的视频名" />
      </el-form-item>

      <el-form-item label="简介" prop="intro">
        <el-input v-model="form.intro" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="一句话讲清楚这个视频讲什么" />
      </el-form-item>

      <el-form-item label="视频 URL" prop="videoUrl">
        <el-input v-model="form.videoUrl" placeholder="https:// 开头, mp4 直链或 H5 embed URL, C 端 web-view 打开" />
        <span class="hint">生产环境请填自有视频地址, demo 用 example.com 占位</span>
      </el-form-item>

      <el-form-item label="emoji封面">
        <el-input v-model="form.coverEmoji" maxlength="4" style="width: 120px;" placeholder="例如 🎬" />
      </el-form-item>

      <el-form-item label="分类">
        <el-input v-model="form.category" maxlength="50" placeholder="如 science / nature / space, 留空 = 全部" />
      </el-form-item>

      <el-form-item label="时长(秒)">
        <el-input-number v-model="form.durationSeconds" :min="0" :max="86400" placeholder="可选, 仅展示" />
      </el-form-item>

      <el-form-item label="标签">
        <el-tag
          v-for="t in form.tags"
          :key="t"
          closable
          style="margin-right: 6px;"
          @close="removeTag(t)"
        >
          {{ t }}
        </el-tag>
        <el-input
          v-if="tagInputVisible"
          ref="tagInputRef"
          v-model="tagInputValue"
          class="tag-input"
          size="small"
          style="width: 100px;"
          @keyup.enter="addTag"
          @blur="addTag"
        />
        <el-button v-else size="small" type="primary" plain @click="showTagInput">+ 添加标签</el-button>
      </el-form-item>

      <el-form-item label="发布">
        <el-switch v-model="form.isPublished" active-text="已发布" inactive-text="草稿" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { videoApi } from '@/api/video'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  initialData: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const formRef = ref(null)
const saving = ref(false)

const form = reactive({
  title: '',
  intro: '',
  videoUrl: '',
  coverEmoji: '🎬',
  category: '',
  durationSeconds: 0,
  tags: [],
  isPublished: false
})

const tagInputVisible = ref(false)
const tagInputValue = ref('')
const tagInputRef = ref(null)

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
  form.intro = row.intro || ''
  form.videoUrl = row.videoUrl || ''
  form.coverEmoji = row.meta?.coverEmoji || '🎬'
  form.category = row.category || ''
  form.durationSeconds = row.durationSeconds || 0
  form.tags = Array.isArray(row.tags) ? [...row.tags] : []
  form.isPublished = !!row.isPublished
}

function reset() {
  if (props.initialData) {
    syncFrom(props.initialData)
  } else {
    form.title = ''
    form.intro = ''
    form.videoUrl = ''
    form.coverEmoji = '🎬'
    form.category = ''
    form.durationSeconds = 0
    form.tags = []
    form.isPublished = false
  }
}

function showTagInput() {
  tagInputVisible.value = true
  nextTick(() => {
    tagInputRef.value?.focus?.()
  })
}

function addTag() {
  const v = (tagInputValue.value || '').trim()
  if (v && !form.tags.includes(v) && form.tags.length < 5) {
    form.tags.push(v)
  }
  tagInputVisible.value = false
  tagInputValue.value = ''
}

function removeTag(t) {
  form.tags = form.tags.filter((x) => x !== t)
}

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  intro: [],
  videoUrl: [{ required: true, type: 'url', message: '请输入 https:// URL', trigger: 'blur' }]
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
      intro: form.intro,
      videoUrl: form.videoUrl,
      coverEmoji: form.coverEmoji,
      category: form.category,
      durationSeconds: form.durationSeconds,
      tags: form.tags,
      isPublished: form.isPublished
    }
    if (isEdit.value) {
      await videoApi.update(props.initialData._id, payload)
      ElMessage.success('已保存')
    } else {
      await videoApi.create(payload)
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
.hint { margin-left: 12px; color: #999; font-size: 12px; }
.tag-input { margin-left: 6px; }
</style>
