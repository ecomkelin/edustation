<template>
  <!--
    课程 (2026-06-26)
    合并原「开班」(/course-instances) + 「课程报名」(/course-enrollments) 两页到单页双标签。
    默认 tab = 开课 (instances)；URL ?tab=instances|enrollments 同步（deep-linkable）。
    复用现有的两个独立 page-level 组件，不重写：
      - CourseInstancesTab.vue（原 CourseInstances.vue body）
      - CourseEnrollmentsTab.vue（原 CourseEnrollments.vue body）
    路由：/course  (router/index.js 中)
    旧链接：/course-instances → /course?tab=instances  /course-enrollments → /course?tab=enrollments
  -->
  <div class="page course-page">
    <h2>课程</h2>
    <p class="hint">开课是教学主体；课程报名是学生 ↔ 开课的报名关系。两者独立维护但常被一起查阅。</p>

    <el-tabs v-model="activeTab" class="course-tabs">
      <el-tab-pane label="开课" name="instances">
        <CourseInstancesTab />
      </el-tab-pane>
      <el-tab-pane label="课程报名" name="enrollments">
        <CourseEnrollmentsTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CourseInstancesTab from './CourseInstancesTab.vue'
import CourseEnrollmentsTab from './CourseEnrollmentsTab.vue'

const VALID_TABS = ['instances', 'enrollments']
const DEFAULT_TAB = 'instances'

const route = useRoute()
const router = useRouter()

// 初始值：URL ?tab= 合法则用之, 否则默认开课
const initial = VALID_TABS.includes(route.query.tab) ? route.query.tab : DEFAULT_TAB
const activeTab = ref(initial)

// tab → URL：用 replace 不入栈, 避免浏览器后退键被 tab 切换污染
watch(activeTab, (v) => {
  if (!VALID_TABS.includes(v)) return
  if (route.query.tab === v) return
  router.replace({ path: '/course', query: { ...route.query, tab: v } })
})

// URL → tab: 处理浏览器后退/前进/外部 deep-link
watch(() => route.query.tab, (v) => {
  const next = VALID_TABS.includes(v) ? v : DEFAULT_TAB
  if (next !== activeTab.value) activeTab.value = next
})
</script>

<style scoped>
.course-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* 让 tab 内容与上方 hint 之间有点呼吸空间, 跟 AiAdmin 的风格一致 */
.course-tabs :deep(.el-tabs__content) { padding-top: 8px; }
</style>
