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
    <h2>课程<PageHelp title="页面说明" :max-width="440"><strong>开课</strong>: 教学主体。一门课在某个时间窗口面向某些学生开班,由 <code>CourseInstance</code> 承载。<br /><strong>课程报名</strong>: 学生 ↔ 开班的报名关系。由 <code>CourseEnrollment</code> 承载。<br /><strong>为什么合并一页</strong>: 两者独立维护但常被一起查阅 (查'这个班有哪些学生'或'这个学生报了哪些班')。</PageHelp></h2>

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
import PageHelp from '@/components/PageHelp.vue'

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
/* 让 tab 内容与上方 h2 标题之间有点呼吸空间 */
.course-tabs :deep(.el-tabs__content) { padding-top: 8px; }
</style>
