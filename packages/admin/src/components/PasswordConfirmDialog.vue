<template>
  <el-dialog
    :model-value="modelValue"
    :title="title || '敏感操作确认'"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    @close="onClose"
  >
    <div class="pwd-dialog">
      <p class="msg">{{ message || '该操作将影响重要数据，请输入您的登录密码以确认：' }}</p>
      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent>
        <el-form-item prop="password" label="登录密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入当前登录用户的密码"
            autocomplete="new-password"
            @keyup.enter="onConfirm"
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onConfirm">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  // 父级在调用方处理 loading 也行；这里用内部 loading
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const formRef = ref()
const form = reactive({ password: '' })
const rules = {
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 64, message: '密码 6-64 位', trigger: 'blur' }
  ]
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      form.password = ''
      formRef.value?.clearValidate()
    }
  }
)

function onClose() {
  form.password = ''
  emit('cancel')
}

function onCancel() {
  emit('update:modelValue', false)
  emit('cancel')
}

async function onConfirm() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    ElMessage.warning('请输入密码')
    return
  }
  emit('confirm', form.password)
}
</script>

<style scoped>
.pwd-dialog .msg {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 16px;
}
</style>
