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
      { path: 'platform/info', component: () => import('@/views/platformInfo/PlatformInfo.vue') },
      { path: 'platform/flow-guide', component: () => import('@/views/platformInfo/CourseInstanceFlowGuide.vue') }
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
  next()
})

export default router
