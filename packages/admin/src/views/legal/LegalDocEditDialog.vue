<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="1100px"
    top="40px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" label-position="top">
      <el-row :gutter="16">
        <el-col :span="14">
          <el-form-item label="标题" prop="title">
            <el-input v-model="form.title" placeholder="例:课程购买协议" />
          </el-form-item>
        </el-col>
        <el-col :span="5">
          <el-form-item label="必勾">
            <el-switch v-model="form.isRequired" />
            <span class="form-hint">true 时客户端会强制勾选同意</span>
          </el-form-item>
        </el-col>
        <el-col :span="5">
          <el-form-item label="拦截作用域">
            <el-select v-model="form.requireScope">
              <el-option label="下单时" value="order" />
              <el-option label="登录时" value="login" />
              <el-option label="仅展示" value="none" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="协议正文(Markdown)" prop="contentMarkdown">
        <el-row :gutter="12" style="width: 100%">
          <el-col :span="12">
            <el-input
              v-model="form.contentMarkdown"
              type="textarea"
              :rows="22"
              placeholder="支持标准 Markdown:# 标题、**加粗**、列表、表格、引用 ..."
              :style="{ fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: '13px' }"
            />
          </el-col>
          <el-col :span="12">
            <div class="preview-wrap">
              <div class="preview-label">实时预览</div>
              <MarkdownView :markdown="form.contentMarkdown" class="preview-body" />
            </div>
          </el-col>
        </el-row>
      </el-form-item>

      <el-alert
        type="info"
        :closable="false"
        title="保存即升版"
        description="提交后系统会自动把当前生效版本停用 (isActive=false),并创建新版本 (version patch+1)。历史用户的 UserConsent 记录不受影响,但客户端下次触发对应作用域时会要求重新同意。"
      />
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存并升版</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { legalApi } from '@/api/legal'
import MarkdownView from '@/components/MarkdownView.vue'

const props = defineProps({
  modelValue: Boolean,
  orgId: { type: String, required: true },
  editKey: { type: String, required: true },
  initialData: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const formRef = ref()
const submitting = ref(false)
const form = reactive({
  title: '',
  contentMarkdown: '',
  isRequired: false,
  requireScope: 'none'
})

const dialogTitle = computed(() => `${props.initialData?._id ? '编辑' : '新建'} - ${form.title || props.editKey}`)

const rules = {
  title: [{ required: true, message: '请填写标题', trigger: 'blur' }],
  contentMarkdown: [{ required: true, message: '请填写协议正文', trigger: 'blur' }]
}

watch(
  () => props.modelValue,
  (v) => {
    if (v && props.initialData) {
      form.title = props.initialData.title || ''
      form.contentMarkdown = props.initialData.contentMarkdown || ''
      form.isRequired = !!props.initialData.isRequired
      form.requireScope = props.initialData.requireScope || 'none'
    }
  }
)

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  submitting.value = true
  try {
    await legalApi.updateOrgDoc(props.orgId, props.editKey, {
      title: form.title,
      contentMarkdown: form.contentMarkdown,
      isRequired: form.isRequired,
      requireScope: form.requireScope
    })
    ElMessage.success('已保存并升版')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.form-hint { color: #909399; font-size: 12px; margin-left: 8px; }
.preview-wrap {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  height: 460px;
  display: flex;
  flex-direction: column;
}
.preview-label {
  padding: 4px 12px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
  font-size: 12px;
  color: #909399;
}
.preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
</style>
