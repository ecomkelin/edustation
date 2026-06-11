<template>
  <div class="eval-editor" v-loading="saving">
    <!-- 顶部状态指示 -->
    <div class="eval-status">
      <el-tag v-if="evaluated" type="success" effect="dark" size="small">已评价 ✓</el-tag>
      <el-tag v-else type="info" effect="plain" size="small">未评价 ✗</el-tag>
      <span v-if="lastAt" class="muted">最近更新：{{ formatDate(lastAt, 'YYYY-MM-DD HH:mm') }}</span>
    </div>

    <div class="eval-grid">
      <div class="eval-row">
        <span class="label">评分：</span>
        <el-rate
          v-model="draft.score"
          :disabled="readOnly"
          :max="5"
          show-score
          score-template="{value} / 5"
        />
      </div>
      <div class="eval-row">
        <span class="label">总体评语：</span>
        <el-input
          v-model="draft.content"
          type="textarea"
          :rows="2"
          :disabled="readOnly"
          maxlength="2000"
          show-word-limit
          placeholder="例如：本节课认真听讲，互动积极..."
        />
      </div>
      <div class="eval-row two-col">
        <div class="col">
          <span class="label">亮点：</span>
          <el-input
            v-model="draft.strengths"
            type="textarea"
            :rows="2"
            :disabled="readOnly"
            maxlength="1000"
            show-word-limit
            placeholder="本节课表现好的地方"
          />
        </div>
        <div class="col">
          <span class="label">待改进：</span>
          <el-input
            v-model="draft.improvements"
            type="textarea"
            :rows="2"
            :disabled="readOnly"
            maxlength="1000"
            show-word-limit
            placeholder="下次可提升的方向"
          />
        </div>
      </div>
    </div>

    <div v-if="!readOnly" class="eval-actions">
      <el-button
        size="small"
        type="primary"
        :disabled="!dirty"
        :loading="saving"
        @click="save"
      >
        保存课评
      </el-button>
      <el-button size="small" :disabled="!dirty || saving" @click="resetDraft">重置</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { formatDate } from '@/utils/format'

const props = defineProps({
  attendance: { type: Object, required: true },
  readOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['saved'])

// 草稿：当前编辑值
const draft = reactive({
  score: null,
  content: '',
  strengths: '',
  improvements: ''
})

// 快照：上次保存到服务器的值（用于脏值检测）
const savedSnapshot = reactive({
  score: null,
  content: '',
  strengths: '',
  improvements: ''
})

const saving = ref(false)

const evaluated = computed(() => !!(props.attendance.evaluation && props.attendance.evaluation.evaluatedAt))
const lastAt = computed(() => props.attendance.evaluation?.evaluatedAt || null)

const dirty = computed(() => {
  return (
    draft.score !== savedSnapshot.score ||
    (draft.content || '') !== (savedSnapshot.content || '') ||
    (draft.strengths || '') !== (savedSnapshot.strengths || '') ||
    (draft.improvements || '') !== (savedSnapshot.improvements || '')
  )
})

function fillFromAttendance() {
  const ev = props.attendance.evaluation || {}
  const next = {
    score: ev.score ?? null,
    content: ev.content ?? '',
    strengths: ev.strengths ?? '',
    improvements: ev.improvements ?? ''
  }
  draft.score = next.score
  draft.content = next.content
  draft.strengths = next.strengths
  draft.improvements = next.improvements
  // 同步快照
  savedSnapshot.score = next.score
  savedSnapshot.content = next.content
  savedSnapshot.strengths = next.strengths
  savedSnapshot.improvements = next.improvements
}

watch(
  () => props.attendance && props.attendance.id,
  () => { if (props.attendance) fillFromAttendance() },
  { immediate: true }
)

function resetDraft() { fillFromAttendance() }

async function save() {
  if (!dirty.value || saving.value) return
  saving.value = true
  try {
    const body = {
      score: draft.score,
      content: draft.content || null,
      strengths: draft.strengths || null,
      improvements: draft.improvements || null
    }
    const r = await lessonAttendanceApi.updateEvaluation(props.attendance.id, body)
    const saved = r.data || {}
    const ev = saved.evaluation || {}
    // 同步快照为最新服务器值
    savedSnapshot.score = ev.score ?? null
    savedSnapshot.content = ev.content ?? ''
    savedSnapshot.strengths = ev.strengths ?? ''
    savedSnapshot.improvements = ev.improvements ?? ''
    ElMessage.success('课评已保存')
    emit('saved', {
      attendanceId: props.attendance.id,
      evaluation: {
        score: savedSnapshot.score,
        content: savedSnapshot.content,
        strengths: savedSnapshot.strengths,
        improvements: savedSnapshot.improvements
      },
      evaluatedAt: ev.evaluatedAt || new Date().toISOString()
    })
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '课评保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.eval-editor { display: flex; flex-direction: column; gap: 8px; }
.eval-status { display: flex; align-items: center; gap: 8px; }
.muted { color: #909399; font-size: 12px; }
.eval-grid { display: flex; flex-direction: column; gap: 6px; }
.eval-row { display: flex; gap: 8px; align-items: flex-start; }
.eval-row .label { color: #606266; font-size: 13px; flex-shrink: 0; min-width: 70px; line-height: 28px; }
.eval-row.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.eval-row.two-col .col { display: flex; flex-direction: column; gap: 4px; }
.eval-actions { display: flex; gap: 8px; margin-top: 4px; }
</style>