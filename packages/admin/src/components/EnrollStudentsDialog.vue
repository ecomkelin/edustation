<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="600px"
    :close-on-click-modal="false"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    @open="onOpen"
    @close="onClose"
  >
    <!-- 开班选择 / 锁定展示 -->
    <el-form label-width="80px">
      <el-form-item label="开班" required>
        <!-- pick 模式: 显示下拉让用户选 -->
        <el-select
          v-if="pickMode"
          v-model="pickedId"
          filterable
          placeholder="请选择开班"
          style="width: 100%"
          :empty-values="[null, undefined, '']"
        >
          <el-option
            v-for="opt in courseInstanceOptions"
            :key="opt._id"
            :label="instanceLabel(opt)"
            :value="opt._id"
          />
        </el-select>
        <!-- locked 模式: 只展示 -->
        <div v-else class="locked-name">
          {{ instanceLabel(effectiveInstance) }}
        </div>
      </el-form-item>
    </el-form>

    <!-- 选定的开班详情 -->
    <div v-if="effectiveInstance" class="course-info">
      <div class="row">
        <span class="label">课程产品</span>
        <span class="value muted">{{ effectiveInstance.courseProduct && effectiveInstance.courseProduct.name || '—' }}</span>
      </div>
      <div class="row">
        <span class="label">老师 / 教室</span>
        <span class="value muted">
          {{ effectiveInstance.teacher && (effectiveInstance.teacher.realName || effectiveInstance.teacher.mobile) || '未指定' }}
          ·
          {{ effectiveInstance.room && effectiveInstance.room.name || '未指定' }}
        </span>
      </div>
      <div class="row">
        <span class="label">报名情况</span>
        <span class="value">
          <el-tag :type="overCapacity ? 'danger' : 'success'" size="small">
            已报 {{ effectiveInstance.enrolledCount || 0 }}
            / 上限 {{ effectiveInstance.maxStudents || '∞' }}
          </el-tag>
          <span v-if="overCapacity" class="muted" style="margin-left: 8px">已超额,继续报名需后续通过"分班"调整</span>
        </span>
      </div>
    </div>

    <el-divider />

    <!-- 学生多选 -->
    <el-form label-width="80px">
      <el-form-item label="选择学生" required>
        <el-select
          v-model="selectedIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :loading="studentsLoading"
          placeholder="可同时选择多名学生(兄弟姐妹/班级名单)"
          style="width: 100%"
        >
          <el-option
            v-for="s in students"
            :key="s._id"
            :label="s.name"
            :value="s._id"
          />
        </el-select>
        <div class="hint">
          已选 {{ selectedIds.length }} 名 · 提交后会逐条创建,部分失败不影响其他学生
        </div>
      </el-form-item>
    </el-form>

    <!-- 上一次提交的失败明细 -->
    <div v-if="lastFailed.length > 0" class="failed-list">
      <div class="failed-title">
        <el-icon><WarningFilled /></el-icon>
        以下 {{ lastFailed.length }} 名学生未报名成功:
      </div>
      <div v-for="f in lastFailed" :key="f.student" class="failed-row">
        <span class="failed-name">{{ f.studentName || f.student }}</span>
        <span class="failed-reason">{{ f.reason }}</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!effectiveInstance || selectedIds.length === 0"
        @click="onSubmit"
      >
        提交报名 ({{ selectedIds.length }})
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { studentApi } from '@/api/student'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 锁定模式:传入单个开班对象(必含 _id)。组件不显示开班下拉。
  courseInstance: { type: Object, default: () => null },
  // 选择模式:传入可选开班数组(每个含 _id / name / courseProduct / teacher 等)。
  // 用户在弹窗内选哪个开班再报名。与 courseInstance 互斥,优先用本字段。
  courseInstanceOptions: { type: Array, default: () => null },
  title: { type: String, default: '批量报名学生' }
})

const emit = defineEmits(['update:modelValue', 'done'])

const students = ref([])
const studentsLoading = ref(false)
const selectedIds = ref([])
const submitting = ref(false)
const lastFailed = ref([])
const pickedId = ref('')

// pick 模式判定:传了 courseInstanceOptions 数组且非空就走 pick
const pickMode = computed(() =>
  Array.isArray(props.courseInstanceOptions) && props.courseInstanceOptions.length > 0
)

// 当前生效的开班对象(pick: 找选中的;locked: 直接 props.courseInstance)
const effectiveInstance = computed(() => {
  if (pickMode.value) {
    return props.courseInstanceOptions.find((i) => String(i._id) === String(pickedId.value)) || null
  }
  return props.courseInstance
})

const overCapacity = computed(() => {
  const inst = effectiveInstance.value
  if (!inst || !inst.maxStudents) return false
  return (inst.enrolledCount || 0) >= inst.maxStudents
})

function instanceLabel(i) {
  if (!i) return '—'
  const name = i.name || (i.courseProduct && i.courseProduct.name) || '?'
  const product = i.courseProduct && i.courseProduct.name
  const teacher = i.teacher && (i.teacher.realName || i.teacher.mobile)
  // 三段:开班名称 优先;后跟产品名(若不同于 name);最后老师
  const parts = [name]
  if (product && product !== name) parts.push(product)
  parts.push(`老师 ${teacher || '未指定'}`)
  return parts.join(' · ')
}

async function loadStudents() {
  studentsLoading.value = true
  try {
    // isBlocked=false 过滤掉黑名单学员(报名 dialog 永远拿不到禁用学生)
    const r = await studentApi.list({ pageSize: 500, isBlocked: false })
    students.value = r.data.items || r.data || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载学生列表失败')
  } finally {
    studentsLoading.value = false
  }
}

function onOpen() {
  selectedIds.value = []
  lastFailed.value = []
  // pick 模式打开时默认不选;若选项只有一个则自动选中
  if (pickMode.value) {
    pickedId.value = props.courseInstanceOptions.length === 1
      ? props.courseInstanceOptions[0]._id
      : ''
  }
  if (students.value.length === 0) loadStudents()
}

function onClose() {
  lastFailed.value = []
}

async function onSubmit() {
  const inst = effectiveInstance.value
  if (!inst || !inst._id) {
    return ElMessage.warning('请先选择开班')
  }
  if (selectedIds.value.length === 0) {
    return ElMessage.warning('请选择至少一名学生')
  }
  submitting.value = true
  try {
    const r = await courseEnrollmentApi.create({
      courseInstance: inst._id,
      students: [...selectedIds.value]
    })
    const result = r.data || { success: [], failed: [] }
    const successN = (result.success || []).length
    const failedN = (result.failed || []).length

    if (failedN === 0) {
      ElMessage.success(`已为 ${successN} 名学生报名`)
      lastFailed.value = []
      emit('done', result)
      emit('update:modelValue', false)
    } else if (successN === 0) {
      ElMessage.error(`报名全部失败,请查看下方明细`)
      lastFailed.value = result.failed
    } else {
      ElMessage.warning(`成功 ${successN} 名,失败 ${failedN} 名(详情见下方)`)
      lastFailed.value = result.failed
      // 把成功的从已选里剔掉,留下失败的让用户决定是否重试/换班
      const failedIds = new Set(result.failed.map((f) => String(f.student)))
      selectedIds.value = selectedIds.value.filter((id) => failedIds.has(String(id)))
      emit('done', result)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

// 切换锁定开班时清空状态
watch(() => props.courseInstance && props.courseInstance._id, () => {
  selectedIds.value = []
  lastFailed.value = []
})

// 切换选中的开班时也清空已选学生(避免跨班串)
watch(pickedId, () => {
  selectedIds.value = []
  lastFailed.value = []
})
</script>

<style scoped>
.locked-name {
  font-size: 14px;
  color: #303133;
  background: #f5f7fa;
  padding: 6px 12px;
  border-radius: 4px;
}
.course-info {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 12px 16px;
  margin-top: 8px;
}
.course-info .row {
  display: flex;
  gap: 12px;
  line-height: 1.8;
  font-size: 14px;
}
.course-info .label {
  color: #909399;
  flex-shrink: 0;
  width: 80px;
}
.course-info .value {
  color: #303133;
  flex: 1;
}
.course-info .muted {
  color: #606266;
}
.hint {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
}
.failed-list {
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 6px;
  padding: 10px 14px;
  margin-top: 8px;
  max-height: 180px;
  overflow-y: auto;
}
.failed-title {
  color: #f56c6c;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.failed-row {
  display: flex;
  gap: 12px;
  font-size: 13px;
  line-height: 1.6;
}
.failed-name {
  color: #303133;
  font-weight: 500;
  min-width: 80px;
}
.failed-reason {
  color: #f56c6c;
  flex: 1;
}
</style>
