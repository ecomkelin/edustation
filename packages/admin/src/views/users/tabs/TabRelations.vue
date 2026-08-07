<!--
  tabs/TabRelations.vue (2026-08-07)
  用户详情「学生与教学」tab —— 家长身份 + 老师身份的业务痕迹。
  每个板块一个 R-0218 domain, 懒加载 + 各自分页。
-->
<template>
  <div>
    <RelatedSection
      :user-id="userId"
      domain="students"
      title="监护的学生"
      empty-text="该账号不是任何学员的监护人"
    >
      <template #columns>
        <el-table-column label="姓名" min-width="120">
          <template #default="{ row }">
            <el-link type="primary" underline="never" @click="go('/students')">{{ row.name }}</el-link>
            <el-tag v-if="row.isPrimaryGuardian" type="success" size="small" style="margin-left: 6px">主监护人</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="性别" width="70">
          <template #default="{ row }">{{ GENDER_LABEL[row.gender] || '—' }}</template>
        </el-table-column>
        <el-table-column label="年龄" width="70">
          <template #default="{ row }">{{ age(row.birthday) }}</template>
        </el-table-column>
        <el-table-column label="年级/班级" min-width="120">
          <template #default="{ row }">{{ [row.grade, row.className].filter(Boolean).join(' ') || '—' }}</template>
        </el-table-column>
        <el-table-column label="学校" min-width="140">
          <template #default="{ row }">{{ row.school ? row.school.name : '—' }}</template>
        </el-table-column>
        <el-table-column v-if="showOrg" label="机构" min-width="160">
          <template #default="{ row }">{{ row.org ? row.org.name : '—' }}</template>
        </el-table-column>
        <el-table-column label="在读" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="courseInstances"
      title="任课的开班"
      empty-text="该账号不是任何开班的任课老师"
    >
      <template #columns>
        <el-table-column prop="name" label="开班" min-width="180" />
        <el-table-column label="课程产品" min-width="140">
          <template #default="{ row }">{{ row.courseProduct || '—' }}</template>
        </el-table-column>
        <el-table-column label="学科" width="120">
          <template #default="{ row }">{{ row.subject || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="COURSE_INSTANCE_TAG[row.status] || 'info'" size="small">
              {{ COURSE_INSTANCE_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开课日期" width="120">
          <template #default="{ row }">{{ day(row.startDate) }}</template>
        </el-table-column>
        <el-table-column v-if="showOrg" label="机构" min-width="160">
          <template #default="{ row }">{{ row.org ? row.org.name : '—' }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="lessonSchedules"
      title="排课（近期在前，不含已归档）"
      empty-text="该账号没有排课"
    >
      <template #columns>
        <el-table-column label="课节" min-width="200">
          <template #default="{ row }">
            <span>{{ row.courseInstance ? row.courseInstance.name : '—' }}</span>
            <span class="dim"> 第 {{ row.lessonNo }} 节</span>
          </template>
        </el-table-column>
        <el-table-column label="上课时间" width="170">
          <template #default="{ row }">{{ fmt(row.plannedStartTime) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="LESSON_TAG[row.status] || 'info'" size="small">
              {{ LESSON_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="showOrg" label="机构" min-width="160">
          <template #default="{ row }">{{ row.org ? row.org.name : '—' }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="evaluations"
      title="写过的课评"
      empty-text="该账号没有写过课评"
    >
      <template #columns>
        <el-table-column label="学员" width="120">
          <template #default="{ row }">{{ row.student ? row.student.name : '—' }}</template>
        </el-table-column>
        <el-table-column label="课节" min-width="200">
          <template #default="{ row }">
            <span v-if="row.lesson">{{ row.lesson.title || `第 ${row.lesson.lessonNo} 节` }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="课评时间" width="170">
          <template #default="{ row }">{{ fmt(row.evaluatedAt) }}</template>
        </el-table-column>
        <el-table-column label="考勤状态" width="100">
          <template #default="{ row }">{{ ATTENDANCE_STATUS_LABEL[row.status] || row.status }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="works"
      title="上传的学员作品"
      empty-text="该账号没有上传过作品"
    >
      <template #columns>
        <el-table-column prop="title" label="作品" min-width="200" />
        <el-table-column label="学员" width="120">
          <template #default="{ row }">{{ row.student ? row.student.name : '—' }}</template>
        </el-table-column>
        <el-table-column label="学科" width="120">
          <template #default="{ row }">{{ row.subject || '—' }}</template>
        </el-table-column>
        <el-table-column label="上传时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import RelatedSection from './RelatedSection.vue'
import { formatDate } from '@/utils/format'
import { GENDER_LABEL, ATTENDANCE_STATUS_LABEL } from '@/utils/constants'

defineProps({
  userId: { type: String, required: true },
  // 平台视角才显示「机构」列 —— 机构视角下全是同一家, 列出来是噪音
  showOrg: { type: Boolean, default: false }
})

const router = useRouter()

const COURSE_INSTANCE_LABEL = {
  planning: '筹备',
  enrolling: '招生中',
  active: '进行中',
  closed: '已结课',
  cancelled: '已取消'
}
const COURSE_INSTANCE_TAG = {
  planning: 'info',
  enrolling: 'warning',
  active: 'success',
  closed: 'info',
  cancelled: 'danger'
}
const LESSON_LABEL = {
  scheduled: '已排课',
  preparing: '准备上课',
  in_progress: '上课中',
  completed: '已结束',
  archived: '已归档',
  cancelled: '已取消'
}
const LESSON_TAG = {
  scheduled: 'info',
  preparing: 'warning',
  in_progress: 'warning',
  completed: 'success',
  archived: 'info',
  cancelled: 'danger'
}

function fmt(d) {
  return d ? formatDate(d) : '—'
}
function day(d) {
  return d ? formatDate(d, 'YYYY-MM-DD') : '—'
}
function age(birthday) {
  if (!birthday) return '—'
  const b = new Date(birthday)
  if (Number.isNaN(b.getTime())) return '—'
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--
  return a >= 0 ? `${a} 岁` : '—'
}
function go(p) {
  router.push(p)
}
</script>

<style scoped>
.dim { color: #909399; font-size: 12px; margin-left: 6px; }
</style>
