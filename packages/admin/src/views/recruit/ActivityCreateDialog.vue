<template>
  <el-dialog
    :model-value="visible"
    title="记录触点"
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
      <el-form-item label="孩子">
        <span class="form-tip-strong">{{ childName }}</span>
      </el-form-item>
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
          placeholder="选择触点发生时间, 默认现在"
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
        系统将记录当前用户为触点的"byUser", 不可后续修改
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
  childLeadId: { type: String, default: null },
  childName: { type: String, default: '' }
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
  remark: [{ max: 500, message: '不超过 500 字', trigger: 'blur' }]
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      // 重置, 不带上次残留
      form.type = 'call'
      form.at = null
      form.remark = ''
    }
  },
  { immediate: true }
)

function disableFuture(date) {
  return date.getTime() > Date.now() + 60_000
}

async function submit() {
  if (!props.childLeadId) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  submitting.value = true
  try {
    await childLeadApi.createActivity(props.childLeadId, {
      type: form.type,
      at: form.at || undefined, // 不传 → 后端 default now
      remark: form.remark
    })
    ElMessage.success('已记录')
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
.form-tip-strong {
  font-weight: 500;
  color: #303133;
}
</style>
