<template>
  <el-dialog
    :model-value="visible"
    title="编辑触点"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      label-position="right"
    >
      <el-form-item label="触点类型" prop="type">
        <el-select v-model="form.type" style="width: 100%">
          <el-option
            v-for="(label, value) in LEAD_ACTIVITY_TYPE_LABEL"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="发生时间" prop="at">
        <el-date-picker
          v-model="form.at"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          format="YYYY-MM-DD HH:mm"
          placeholder="选择触点发生时间"
          style="width: 100%"
          :disabled-date="disableFuture"
        />
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="如 张三妈咨询了价格, 答应周末来"
        />
      </el-form-item>
      <div class="form-tip">
        <el-icon><InfoFilled /></el-icon>
        触点的"谁联系的"(byUser)不可修改, 作为审计基线
      </div>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { childLeadApi } from '@/api/childLead'
import { LEAD_ACTIVITY_TYPE_LABEL } from '@/utils/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  childLeadId: { type: String, required: true },
  activity: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref(null)
const submitting = ref(false)

const form = reactive({
  type: 'call',
  at: null,
  remark: ''
})

const rules = {
  type: [{ required: true, message: '请选择触点类型', trigger: 'change' }],
  at: [{ required: true, message: '请选择发生时间', trigger: 'change' }],
  remark: [{ max: 500, message: '不超过 500 字', trigger: 'blur' }]
}

watch(
  () => props.visible,
  (v) => {
    if (v && props.activity) {
      form.type = props.activity.type
      // 后端 at 是 ISO 字符串, 给 el-date-picker 用 ISO 即可
      form.at = props.activity.at
        ? (typeof props.activity.at === 'string'
            ? props.activity.at
            : new Date(props.activity.at).toISOString())
        : null
      form.remark = props.activity.remark || ''
    }
  },
  { immediate: true }
)

function disableFuture(date) {
  // 不允许选未来时间 (容差 1 分钟, 防时区错乱)
  return date.getTime() > Date.now() + 60_000
}

async function submit() {
  if (!props.activity) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  submitting.value = true
  try {
    await childLeadApi.updateActivity(props.childLeadId, props.activity._id, {
      type: form.type,
      at: form.at,
      remark: form.remark
    })
    ElMessage.success('已保存')
    emit('saved')
    emit('update:visible', false)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.form-tip {
  margin-top: -8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
