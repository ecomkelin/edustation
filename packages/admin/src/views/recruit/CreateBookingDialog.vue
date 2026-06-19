<template>
  <el-dialog
    :model-value="visible"
    title="为现有孩子新建试听预约"
    width="480px"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <el-form
      v-if="child"
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      @submit.prevent
    >
      <el-form-item label="孩子">
        <span class="readonly">{{ child.name }}</span>
        <span v-if="child.parent?.phone" class="muted ml">
          家长 {{ child.parent.phone }}
        </span>
      </el-form-item>
      <el-form-item label="科目" prop="subject">
        <el-select
          v-model="form.subject"
          placeholder="不选则用孩子档案里的科目"
          clearable
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="c in subjectOptions"
            :key="c._id"
            :label="c.name"
            :value="c._id"
          />
        </el-select>
        <div class="muted hint">
          已约次数 {{ attemptNoHint }} 次 (新建后为第 {{ attemptNoHint + 1 }} 次)
        </div>
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          :maxlength="500"
          show-word-limit
          placeholder="例如: 家长主动约本周六再试 / 想换老师"
        />
      </el-form-item>
    </el-form>

    <div class="hint-bar muted">
      创建后预约状态为"待约",可立即在右侧弹窗里排时间;老预约保留作审计。
    </div>

    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">
        创建并排课
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { trialBookingApi } from '@/api/trialBooking'
import { categoryApi } from '@/api/category'

/**
 * 为现有孩子新建一笔 awaiting_schedule 预约 (2026-06-20)
 *
 * 业务场景:
 *   - 已取消 → 想再试
 *   - 已转化 → 想再试另一门
 *   - 录入时漏了某个科目, 现在想补
 *
 * Props:
 *   - visible: Boolean
 *   - child: { _id, name, parent, trialSubjects[] }  来自 ChildLeadDetailDialog
 *
 * Emits:
 *   - update:visible
 *   - created({ booking, child }) 父级收到后: reload + 立即弹 BatchScheduleDialog(singleMode) 排课
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  child: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'created'])

const formRef = ref(null)
const saving = ref(false)
const subjectOptions = ref([])

// 已有预约次数提示 (用于 UI 显示"第 N 次")
const attemptNoHint = ref(0)

const form = reactive({
  subject: null,
  remark: ''
})
const rules = {
  subject: [],
  remark: [{ max: 500, message: '备注最长 500 字' }]
}

// 关闭时重置
watch(() => props.visible, async (v) => {
  if (v) {
    form.subject = null
    form.remark = ''
    saving.value = false
    await Promise.all([loadSubjects(), loadAttemptHint()])
  }
})

async function loadSubjects() {
  try {
    const r = await categoryApi.list({ model: 'Subject', pageSize: 200 })
    subjectOptions.value = r.data?.items || (Array.isArray(r.data) ? r.data : [])
  } catch (e) {
    subjectOptions.value = []
  }
}

async function loadAttemptHint() {
  if (!props.child?._id) {
    attemptNoHint.value = 0
    return
  }
  try {
    // 拉一笔 list (pageSize=1) 拿 total; 一次查询即可
    const r = await trialBookingApi.list({ preStudent: props.child._id, pageSize: 1 })
    attemptNoHint.value = r.data?.total || 0
  } catch (e) {
    attemptNoHint.value = 0
  }
}

async function onSubmit() {
  if (!props.child?._id) return
  saving.value = true
  try {
    const r = await trialBookingApi.createForChild({
      preStudent: props.child._id,
      subject: form.subject || undefined,
      remark: form.remark || undefined
    })
    ElMessage.success(`已创建第 ${r.data.attemptNo} 次预约 (待约)`)
    emit('created', { booking: r.data, child: props.child })
    emit('update:visible', false)
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '创建失败'
    ElMessage.error(`创建失败: ${msg}`)
  } finally {
    saving.value = false
  }
}

function onCancel() {
  emit('update:visible', false)
}
</script>

<style scoped>
.readonly { font-weight: 500; }
.muted { color: #909399; font-size: 12px; }
.ml { margin-left: 8px; }
.hint { line-height: 1.4; margin-top: 4px; }
.hint-bar {
  margin: -8px 0 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
}
</style>