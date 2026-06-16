<template>
  <el-dialog
    :model-value="visible"
    title="学生学习画像"
    width="680px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <div v-if="student" class="profile-header">
      <span class="header-label">学生:</span>
      <span class="header-name">{{ student.name || '—' }}</span>
      <el-tag v-if="student.gender" size="small" style="margin-left: 8px">
        {{ student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : student.gender }}
      </el-tag>
      <span v-if="student.school?.name" class="header-school">{{ student.school.name }}</span>
    </div>

    <el-alert
      v-if="student?.notes"
      type="warning"
      :closable="false"
      show-icon
      title="过敏史/特殊需求/老师注意事项 (独立保留)"
      :description="student.notes"
      style="margin-bottom: 16px"
    />

    <el-form ref="formRef" :model="form" label-width="100px" label-position="right">
      <el-form-item label="性格">
        <el-input
          v-model="form.personality"
          type="textarea"
          :rows="2"
          :maxlength="500"
          show-word-limit
          placeholder="例: 慢热 / 跟老师熟了就开朗 / 敏感"
        />
      </el-form-item>
      <el-form-item label="学习目标">
        <el-input
          v-model="form.learningGoal"
          type="textarea"
          :rows="2"
          :maxlength="500"
          show-word-limit
          placeholder="例: 冲刺小升初 / 培养兴趣 / 考级"
        />
      </el-form-item>
      <el-form-item label="薄弱项">
        <el-input
          v-model="form.weakness"
          type="textarea"
          :rows="2"
          :maxlength="500"
          show-word-limit
          placeholder="例: 应用题 / 英语口语 / 音准"
        />
      </el-form-item>
      <el-form-item label="特长">
        <el-input
          v-model="form.strengths"
          type="textarea"
          :rows="2"
          :maxlength="500"
          show-word-limit
          placeholder="例: 逻辑思维强 / 绘画有天赋 / 乐感好"
        />
      </el-form-item>
      <el-form-item label="上课反馈">
        <el-input
          v-model="form.classFeedback"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
          placeholder="例: 上周第 3 节表现好 / 最近注意力下降"
        />
      </el-form-item>
      <el-form-item label="跟进备忘">
        <el-input
          v-model="form.followUp"
          type="textarea"
          :rows="5"
          :maxlength="2000"
          show-word-limit
          placeholder="例: 家长希望 9 月冲比赛; 老师建议加 1 节课"
        />
      </el-form-item>
      <el-form-item v-if="form.lastUpdatedAt" label="最后更新">
        <span class="meta-text">
          {{ form.lastUpdatedBy?.realName || '系统' }} ·
          {{ formatTime(form.lastUpdatedAt) }}
        </span>
      </el-form-item>
      <el-form-item v-else label=" ">
        <span class="meta-text meta-empty">尚未填写</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="onClose(false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { studentApi } from '@/api/student'

const props = defineProps({
  visible: { type: Boolean, default: false },
  student: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref()
const saving = ref(false)

const form = reactive({
  personality: '',
  learningGoal: '',
  weakness: '',
  strengths: '',
  classFeedback: '',
  followUp: '',
  lastUpdatedBy: null,
  lastUpdatedAt: null
})

watch(
  () => [props.visible, props.student?.id],
  async ([vis, id]) => {
    if (vis && id) await loadProfile()
  },
  { immediate: true }
)

async function loadProfile() {
  try {
    const r = await studentApi.getProfile(props.student.id)
    Object.assign(form, {
      personality: r.data.personality || '',
      learningGoal: r.data.learningGoal || '',
      weakness: r.data.weakness || '',
      strengths: r.data.strengths || '',
      classFeedback: r.data.classFeedback || '',
      followUp: r.data.followUp || '',
      lastUpdatedBy: r.data.lastUpdatedBy || null,
      lastUpdatedAt: r.data.lastUpdatedAt || null
    })
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载画像失败')
  }
}

async function onSave() {
  saving.value = true
  try {
    const r = await studentApi.setProfile(props.student.id, {
      personality: form.personality,
      learningGoal: form.learningGoal,
      weakness: form.weakness,
      strengths: form.strengths,
      classFeedback: form.classFeedback,
      followUp: form.followUp
    })
    form.lastUpdatedBy = r.data.lastUpdatedBy
    form.lastUpdatedAt = r.data.lastUpdatedAt
    ElMessage.success('已保存')
    emit('saved', r.data)
    onClose(false)
  } catch (e) {
    // 错误已由拦截器弹
  } finally {
    saving.value = false
  }
}

function onClose(v) {
  emit('update:visible', v ?? false)
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.profile-header {
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #f5f7fa;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-label {
  color: #999;
  font-size: 13px;
}
.header-name {
  font-weight: 600;
  font-size: 15px;
}
.header-school {
  color: #606266;
  font-size: 13px;
  margin-left: 8px;
}
.meta-text {
  color: #999;
  font-size: 12px;
}
.meta-empty {
  color: #c0c4cc;
}
</style>
