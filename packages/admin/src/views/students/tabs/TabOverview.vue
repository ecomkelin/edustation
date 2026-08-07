<!--
  TabOverview.vue (2026-08-07)
  学生详情「概览」tab: 基本信息 + 监护人 + 学习画像 + 家长沟通画像
  数据全部来自 R-0408 overview, 不额外请求。
-->
<template>
  <div>
    <!-- 基本信息 -->
    <el-card class="block" shadow="never">
      <template #header><b>基本信息</b></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="姓名">{{ profile.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ GENDER_LABEL[profile.gender] || '—' }}</el-descriptions-item>
        <el-descriptions-item label="生日">
          {{ profile.birthday ? formatDate(profile.birthday, 'YYYY-MM-DD') : '—' }}
          <span v-if="ageYears !== null" class="dim">{{ ageYears }} 岁</span>
        </el-descriptions-item>
        <el-descriptions-item label="学校">
          <span v-if="profile.school">{{ profile.school.name }}</span>
          <span v-else style="color: #909399">未登记</span>
        </el-descriptions-item>
        <el-descriptions-item label="年级">{{ profile.grade || '—' }}</el-descriptions-item>
        <el-descriptions-item label="班级">{{ profile.className || '—' }}</el-descriptions-item>
        <el-descriptions-item label="在读">
          <el-tag :type="profile.isActive ? 'success' : 'info'" size="small">
            {{ profile.isActive ? '是' : '否' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ fmt(profile.createdAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="profile.notes" label="备注（过敏史 / 注意事项）" :span="2">
          <pre class="notes">{{ profile.notes }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="profile.isBlocked" label="禁用时间">{{ fmt(profile.blockedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="profile.isBlocked" label="禁用原因" :span="2">
          {{ profile.blockedReason || '—' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 监护人 (2026-08-07: 列出所有 guardians, 主监护人 chip 标识) -->
    <el-card class="block" shadow="never">
      <template #header>
        <div class="card-head">
          <b>监护人</b>
          <span class="tip">主监护人是 C 端家长默认进入的学员</span>
        </div>
      </template>
      <el-empty v-if="!profile.guardians || profile.guardians.length === 0" :image-size="80">
        <template #description>
          <span>未登记监护人（学员可能由教务代管）</span>
        </template>
      </el-empty>
      <el-table v-else :data="profile.guardians" border size="small">
        <el-table-column label="姓名" min-width="120">
          <template #default="{ row }">
            <span>{{ row.realName || '—' }}</span>
            <el-tag v-if="row.id === profile.guardianUser" type="success" size="small" style="margin-left: 6px">主</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="160">
          <template #default="{ row }">
            <a :href="`tel:${row.mobile}`" style="color: #409eff; text-decoration: none">
              {{ row.mobile || '—' }}
            </a>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 学习画像 (R-0406 字段, 6 项结构化) -->
    <el-card class="block" shadow="never">
      <template #header>
        <div class="card-head">
          <b>学习画像</b>
          <span v-if="profile.learningProfile && profile.learningProfile.lastUpdatedAt" class="tip">
            最后更新于 {{ fmt(profile.learningProfile.lastUpdatedAt) }}
            <template v-if="profile.learningProfile.lastUpdatedBy">
              · {{ profile.learningProfile.lastUpdatedBy.realName || '—' }}
            </template>
          </span>
        </div>
      </template>
      <el-empty v-if="!hasAnyProfileField" :image-size="80" description="尚未填写学习画像" />
      <el-descriptions v-else :column="1" border>
        <el-descriptions-item label="性格">
          <pre class="profile-field">{{ profile.learningProfile.personality || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="学习目标">
          <pre class="profile-field">{{ profile.learningProfile.learningGoal || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="薄弱项">
          <pre class="profile-field">{{ profile.learningProfile.weakness || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="特长">
          <pre class="profile-field">{{ profile.learningProfile.strengths || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="课堂反馈">
          <pre class="profile-field">{{ profile.learningProfile.classFeedback || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="跟进备忘" :span="1">
          <pre class="profile-field">{{ profile.learningProfile.followUp || '—' }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 家长沟通画像 (来自主监护人手机号 → Parent, 跨机构独立) -->
    <el-card v-if="parentId" class="block" shadow="never">
      <template #header>
        <div class="card-head">
          <b>家长沟通画像</b>
          <span class="tip">续课 / 谈判前看这里</span>
        </div>
      </template>
      <el-empty v-if="!hasAnyParentProfileField" :image-size="80" description="家长档案已关联, 但尚未填写沟通画像" />
      <el-descriptions v-else :column="1" border>
        <el-descriptions-item label="沟通风格">
          <pre class="profile-field">{{ parentProfile.commStyle || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="家庭背景">
          <pre class="profile-field">{{ parentProfile.familyBg || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="孩子关注">
          <pre class="profile-field">{{ parentProfile.childFocus || '—' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="跟进备忘">
          <pre class="profile-field">{{ parentProfile.followUp || '—' }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-card v-else class="block" shadow="never">
      <template #header><b>家长沟通画像</b></template>
      <el-empty :image-size="80" description="该学员未关联家长档案 (无主监护人手机号 或 未走招生流程)" />
    </el-card>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatDate } from '@/utils/format'
import { GENDER_LABEL } from '@/utils/constants'

const props = defineProps({
  profile: { type: Object, required: true },
  parentId: { type: String, default: null },
  parentProfile: { type: Object, default: null }
})

const lp = computed(() => (props.profile && props.profile.learningProfile) || {})
const hasAnyProfileField = computed(() =>
  !!(lp.value.personality || lp.value.learningGoal || lp.value.weakness
    || lp.value.classFeedback || lp.value.strengths || lp.value.followUp)
)
const hasAnyParentProfileField = computed(() => {
  const p = props.parentProfile
  return !!(p && (p.commStyle || p.familyBg || p.childFocus || p.followUp))
})

const ageYears = computed(() => {
  const b = props.profile && props.profile.birthday
  if (!b) return null
  const d = new Date(b)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 ? a : null
})

function fmt(d) {
  return d ? formatDate(d) : '—'
}
</script>

<style scoped>
.block { margin-bottom: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; }
.tip { color: #909399; font-size: 12px; font-weight: normal; }
.dim { color: #909399; font-size: 12px; margin-left: 6px; }
.notes {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
  max-height: 160px;
  overflow-y: auto;
}
.profile-field {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
}
</style>
