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
      // AI 助手 (2026-06): 多模态输入 + 工具调用, 替代旧的 AI 客服测试
      { path: 'ai-assistant', component: () => import('@/views/agent/AiAssistant.vue') },
      { path: 'student-products', component: () => import('@/views/studentProducts/StudentProducts.vue') },
      { path: 'student-works', component: () => import('@/views/studentWorks/StudentWorks.vue') },
      // 积分管理 (2026-06-21): 学员积分账户列表 + 流水 + 手动调整
      { path: 'points', component: () => import('@/views/points/Points.vue') },
      // 宠物管理 (2026-06-21 pet-system-v2)
      { path: 'pet', component: () => import('@/views/pet/PetAdmin.vue') },
      // 宠物图鉴 CRUD (2026-06-21 pet-system-v2-ext): species/items/consumables
      { path: 'pet/species', component: () => import('@/views/pet/PetSpeciesAdmin.vue') },
      { path: 'pet/items', component: () => import('@/views/pet/PetItemAdmin.vue') },
      { path: 'pet/consumables', component: () => import('@/views/pet/PetConsumableAdmin.vue') },
      // 经营分析:5 块看板对应后端 /api/v1/reports/* ；二级菜单入口见 DefaultLayout
      { path: 'reports/overview', component: () => import('@/views/reports/OverviewReport.vue') },
      { path: 'reports/lesson-consumption', component: () => import('@/views/reports/LessonConsumptionReport.vue') },
      { path: 'reports/room-utilization', component: () => import('@/views/reports/RoomUtilizationReport.vue') },
      { path: 'reports/teacher-productivity', component: () => import('@/views/reports/TeacherProductivityReport.vue') },
      { path: 'reports/points-activity', component: () => import('@/views/reports/PointsActivityReport.vue') },
      { path: 'files', component: () => import('@/views/files/Files.vue') },
      { path: 'platform/info', component: () => import('@/views/platformInfo/PlatformInfo.vue') },
      { path: 'platform/flow-guide', component: () => import('@/views/platformInfo/CourseInstanceFlowGuide.vue') },
      // 法律协议 (2026-06)
      { path: 'legal/org-docs', component: () => import('@/views/legal/LegalDocs.vue') },
      { path: 'legal/platform', component: () => import('@/views/legal/PlatformLegal.vue'), meta: { platform: true } },
      { path: 'system/site-config', component: () => import('@/views/system/SiteConfigEdit.vue'), meta: { platform: true } },
      // AI 管理 (2026-06-18): 平台超管, 当前含会话管理 tab
      { path: 'system/ai', component: () => import('@/views/system/AiAdmin.vue'), meta: { platform: true } },
      // 游离用户 (2026-06-19): 不属于任何机构的孤儿账号管理, 仅平台超管
      { path: 'system/unaffiliated-users', component: () => import('@/views/system/UnaffiliatedUsers.vue'), meta: { platform: true } },
      // 协议接受页 (强制拦截目标; 不可被 pendingConsents 守卫拦截, 否则死循环)
      { path: 'agreement/accept', component: () => import('@/views/legal/AgreementAccept.vue'), meta: { auth: true, agreement: true } },
      // 招生试听 (2026-06 重构: Lead → Parent + ChildLead)
      { path: 'recruit/leads', component: () => import('@/views/recruit/Parents.vue') },
      // 孩子管理 (2026-06-19): 按孩子维度的精细跟进页, 与"潜客管理(按家长)"同级并列
      { path: 'recruit/child-leads', component: () => import('@/views/recruit/ChildLeads.vue') },
      { path: 'recruit/trial-bookings', component: () => import('@/views/recruit/TrialBookings.vue') },
      // 招生看板 (2026-06)
      { path: 'reports/recruit', component: () => import('@/views/reports/RecruitReport.vue') },
      // 首登强改密 (2026-06): 路由守卫拦截, 改密成功后清标志
      { path: 'reset-password', component: () => import('@/views/ResetPassword.vue'), meta: { auth: true } }
    ]
  },
  // 课堂展示 (2026-06-21 pet-system-v2-ext): 独立 layout (ClassroomLayout), 全屏深色背景
  {
    path: '/class',
    component: () => import('@/layouts/ClassroomLayout.vue'),
    meta: { auth: true },
    children: [
      { path: 'pet-display', component: () => import('@/views/classroom/PetClassroomDisplay.vue') }
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
  // 法律协议 (2026-06): 有待同意协议时拦到 /agreement/accept
  // (改密页 + 接受页本身不拦, 否则死循环; 业已改密成功后 needPasswordChange=false 才会走到这条)
  if (
    auth.isAuthenticated
    && auth.hasPendingConsents
    && !to.meta.agreement
    && to.path !== '/reset-password'
  ) {
    return next({ path: '/agreement/accept', query: { redirect: to.fullPath } })
  }
  // 平台超管专属页面
  if (to.meta.platform && !auth.isPlatformAdmin) {
    return next('/dashboard')
  }
  next()
})

export default router
