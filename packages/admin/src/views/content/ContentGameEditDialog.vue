<!--
  小游戏编辑/创建 dialog
  R-3704 create / R-3705 update
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '编辑游戏' : '新建游戏'"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" maxlength="60" show-word-limit placeholder="吸引家长点击的游戏名" />
      </el-form-item>

      <el-form-item label="简介" prop="intro">
        <el-input v-model="form.intro" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="一段话讲清楚玩什么 + 练什么" />
      </el-form-item>

      <el-form-item label="启动 URL" prop="launchUrl">
        <el-input v-model="form.launchUrl" placeholder="https:// 开头, C 端 web-view 打开" />
        <span class="hint">生产环境请填自有 H5 地址, demo 数据用 example.com 占位</span>
      </el-form-item>

      <el-form-item label="emoji封面">
        <el-input v-model="form.coverEmoji" maxlength="4" style="width: 120px;" placeholder="例如 🎮" />
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

      <el-form-item label="难度">
        <el-select v-model="form.difficulty" placeholder="选难度" clearable>
          <el-option label="简单" value="easy" />
          <el-option label="中等" value="medium" />
          <el-option label="困难" value="hard" />
        </el-select>
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
import { gameApi } from '@/api/game'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  initialData: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const formRef = ref(null)
const saving = ref(false)

const form = reactive({
  name: '',
  intro: '',
  launchUrl: '',
  coverEmoji: '🎮',
  tags: [],
  difficulty: '',
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
  form.name = row.name || ''
  form.intro = row.intro || ''
  form.launchUrl = row.launchUrl || ''
  form.coverEmoji = row.meta?.coverEmoji || '🎮'
  form.tags = Array.isArray(row.tags) ? [...row.tags] : []
  form.difficulty = row.difficulty || ''
  form.isPublished = !!row.isPublished
}

function reset() {
  if (props.initialData) {
    syncFrom(props.initialData)
  } else {
    form.name = ''
    form.intro = ''
    form.launchUrl = ''
    form.coverEmoji = '🎮'
    form.tags = []
    form.difficulty = ''
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
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  intro: [],
  launchUrl: [{ required: true, type: 'url', message: '请输入 https:// URL', trigger: 'blur' }]
}

async function onSave() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch { return }
  saving.value = true
  try {
    const payload = {
      name: form.name,
      intro: form.intro,
      launchUrl: form.launchUrl,
      coverEmoji: form.coverEmoji,
      tags: form.tags,
      difficulty: form.difficulty,
      isPublished: form.isPublished
    }
    if (isEdit.value) {
      await gameApi.update(props.initialData._id, payload)
      ElMessage.success('已保存')
    } else {
      await gameApi.create(payload)
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
