import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', component: () => import('@/views/Login.vue'), meta: { guest: true } },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { auth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('@/views/Dashboard.vue') },
      // 个人中心：查看 / 修改自己的资料、修改密码 —— 无需权限,登录即可访问
      { path: 'profile', component: () => import('@/views/profile/Profile.vue') },
      { path: 'orgs', component: () => import('@/views/orgs/Orgs.vue') },
      // 机构推广信息 (2026-06): 机构 admin 编辑自己机构的推广内容
      { path: 'org/promotion', component: () => import('@/views/orgs/OrgPromotion.vue') },
      { path: 'categories', component: () => import('@/views/categories/Categories.vue') },
      { path: 'regions', component: () => import('@/views/regions/Regions.vue') },
      { path: 'users', component: () => import('@/views/users/Users.vue') },
      { path: 'positions', component: () => import('@/views/positions/Positions.vue') },
      { path: 'students', component: () => import('@/views/students/Students.vue') },
      { path: 'subjects', component: () => import('@/views/subjects/Subjects.vue') },
      { path: 'course-products', component: () => import('@/views/courseProducts/CourseProducts.vue') },
      { path: 'course-instances', component: () => import('@/views/courseInstances/CourseInstances.vue') },
      { path: 'course-enrollments', component: () => import('@/views/courseEnrollments/CourseEnrollments.vue') },
      { path: 'rooms', component: () => import('@/views/rooms/Rooms.vue') },
      { path: 'schools', component: () => import('@/views/schools/Schools.vue') },
      { path: 'schedule', component: () => import('@/views/lessonSchedule/ScheduleList.vue') },
      { path: 'schedule/calendar', component: () => import('@/views/lessonSchedule/ScheduleCalendar.vue') },
      { path: 'schedule/class', component: () => import('@/views/lessonSchedule/ClassSchedulePage.vue') },
      { path: 'schedule/attendance', component: () => import('@/views/lessonSchedule/AttendanceListPage.vue') },
      { path: 'schedule/makeup', component: () => import('@/views/lessonSchedule/MakeupPage.vue') },
      { path: 'orders', component: () => import('@/views/orders/Orders.vue') },
      { path: 'ai-chat', component: () => import('@/views/agent/AiChatTest.vue') },
      { path: 'student-products', component: () => import('@/views/studentProducts/StudentProducts.vue') },
      { path: 'student-works', component: () => import('@/views/studentWorks/StudentWorks.vue') },
      // 经营分析:5 块看板对应后端 /api/v1/reports/* ；二级菜单入口见 DefaultLayout
      { path: 'reports/overview', component: () => import('@/views/reports/OverviewReport.vue') },
      { path: 'reports/lesson-consumption', component: () => import('@/views/reports/LessonConsumptionReport.vue') },
      { path: 'reports/room-utilization', component: () => import('@/views/reports/RoomUtilizationReport.vue') },
      { path: 'reports/teacher-productivity', component: () => import('@/views/reports/TeacherProductivityReport.vue') },
      { path: 'reports/points-activity', component: () => import('@/views/reports/PointsActivityReport.vue') },
      { path: 'files', component: () => import('@/views/files/Files.vue') },
      { path: 'platform/info', component: () => import('@/views/platformInfo/PlatformInfo.vue') },
      { path: 'platform/flow-guide', component: () => import('@/views/platformInfo/CourseInstanceFlowGuide.vue') },
      // 招生试听 (2026-06 重构: Lead → Parent + ChildLead)
      { path: 'recruit/leads', component: () => import('@/views/recruit/Parents.vue') },
      { path: 'recruit/trial-bookings', component: () => import('@/views/recruit/TrialBookings.vue') },
      // 招生看板 (2026-06)
      { path: 'reports/recruit', component: () => import('@/views/reports/RecruitReport.vue') },
      // 首登强改密 (2026-06): 路由守卫拦截, 改密成功后清标志
      { path: 'reset-password', component: () => import('@/views/ResetPassword.vue'), meta: { auth: true } }
    ]
  },
  { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFound.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.guest && auth.isAuthenticated) {
    return next('/dashboard')
  }
  if (to.meta.auth && !auth.isAuthenticated) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }
  // 招生试听 (2026-06): 首登强改密守卫 — 任何非改密页的访问都拦到 /reset-password
  if (auth.needPasswordChange && to.path !== '/reset-password') {
    return next({ path: '/reset-password', query: { initial: '1', redirect: to.fullPath } })
  }
  next()
})

export default router
