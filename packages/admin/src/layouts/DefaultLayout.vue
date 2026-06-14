<template>
  <el-container class="layout">
    <el-header class="header">
      <div class="logo">🎓 EduStation</div>
      <div class="header-right">
        <OrgSwitcher />
        <el-dropdown @command="onCommand">
          <span class="user-trigger">
            <el-avatar :size="28" :src="auth.user?.avatar || ''" class="user-avatar">
              {{ avatarInitial }}
            </el-avatar>
            <span class="user-name">{{ auth.user?.realName || auth.user?.mobile }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>个人中心
              </el-dropdown-item>
              <el-dropdown-item command="changePassword">
                <el-icon><Lock /></el-icon>修改密码
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>
    <el-container>
      <el-aside width="220px" class="aside">
        <el-menu :default-active="route.path" router :default-openeds="defaultOpeneds">
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon><span>仪表盘</span>
          </el-menu-item>
          <template v-for="group in visibleGroups" :key="group.key">
            <el-sub-menu :index="group.key">
              <template #title>
                <el-icon><component :is="group.icon" /></el-icon>
                <span>{{ group.title }}</span>
              </template>
              <el-menu-item v-for="child in group.children" :key="child.path" :index="child.path">
                <el-icon><component :is="child.icon" /></el-icon>
                <span>{{ child.label }}</span>
              </el-menu-item>
            </el-sub-menu>
          </template>
        </el-menu>
      </el-aside>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import OrgSwitcher from '@/components/OrgSwitcher.vue'
import {
  ArrowDown,
  Odometer,
  Setting,
  Files,
  Box,
  User,
  Lock,
  Reading,
  Notebook,
  Goods,
  Calendar,
  ShoppingCart,
  School,
  Present,
  Platform,
  Key,
  Connection,
  Warning,
  ChatLineRound,
  SwitchButton,
  DataAnalysis,
  Picture
} from '@element-plus/icons-vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// 一级导航分组：按业务域聚合
const menuGroups = [
  {
    key: 'system',
    title: '系统管理',
    icon: Setting,
    children: [
      { path: '/orgs', label: '机构管理', icon: Box, requirePlatform: true },
      { path: '/users', label: '用户管理', icon: User, perm: 'user.read' },
      { path: '/positions', label: '职位权限', icon: Lock, perm: 'position.read' },
      { path: '/files', label: '文件管理', icon: Picture, perm: 'storage.read' }
    ]
  },
  {
    key: 'basic',
    title: '基础数据',
    icon: Files,
    children: [
      { path: '/categories', label: '类别字典', icon: Files, requirePlatform: true },
      { path: '/regions', label: '地区字典', icon: Box, requirePlatform: true },
      { path: '/rooms', label: '教室', icon: Box, perm: 'room.read' },
      { path: '/subjects', label: '学科', icon: Notebook, perm: 'subject.read' },
      { path: '/schools', label: '学校档案', icon: School, perm: 'school.read' }
    ]
  },
  {
    key: 'teach',
    title: '教务管理',
    icon: School,
    children: [
      { path: '/course-products', label: '课程产品', icon: Files, perm: 'courseProduct.read' },
      { path: '/course-instances', label: '开班', icon: Reading, perm: 'courseInstance.read' },
      { path: '/course-enrollments', label: '课程报名', icon: Notebook, perm: 'courseEnrollment.read' },
      { path: '/schedule', label: '排课', icon: Calendar, perm: 'lessonSchedule.read' },
      { path: '/schedule/class', label: '上课表', icon: Present, perm: 'lessonAttendance.read' }
    ]
  },
  {
    key: 'biz',
    title: '学员与订单',
    icon: User,
    children: [
      { path: '/students', label: '学生管理', icon: Reading, perm: 'student.read' },
      { path: '/student-products', label: '学生课包', icon: Present, perm: 'studentProduct.read' },
      { path: '/student-works', label: '学生作品', icon: Goods, perm: 'studentWork.read' },
      { path: '/orders', label: '订单', icon: ShoppingCart, perm: 'order.read' },
      { path: '/ai-chat', label: 'AI 客服测试', icon: ChatLineRound, perm: 'order.read' }
    ]
  },
  {
    key: 'analytics',
    title: '经营分析',
    icon: DataAnalysis,
    children: [
      { path: '/reports/overview', label: '经营总览', icon: Odometer, perm: 'report.read' },
      { path: '/reports/lesson-consumption', label: '课消与课表', icon: Reading, perm: 'report.read' },
      { path: '/reports/room-utilization', label: '教室利用率', icon: School, perm: 'report.read' },
      { path: '/reports/teacher-productivity', label: '老师产能', icon: User, perm: 'report.read' },
      { path: '/reports/points-activity', label: '积分与活跃', icon: Present, perm: 'report.read' }
    ]
  },
  {
    key: 'platform',
    title: '平台管理',
    icon: Platform,
    children: [
      // 仅平台超管可见：当前是『系统说明』单页，未来平台级运维入口都放这里
      { path: '/platform/info', label: '系统说明', icon: Warning, requirePlatform: true },
      { path: '/platform/flow-guide', label: '开班流程说明', icon: Reading, requirePlatform: true }
    ]
  }
]

function isAllowed(item) {
  if (item.requirePlatform) return auth.isPlatformAdmin
  // 平台超管直通：与后端 requirePermission 行为保持一致
  if (auth.isPlatformAdmin) return true
  if (!item.perm) return true
  return auth.orgs.some(
    (o) => o.id === auth.currentOrgId && (o.positions || []).some((p) => (p.permissions || []).includes(item.perm))
  )
}

const visibleGroups = computed(() =>
  menuGroups
    .map((g) => ({ ...g, children: g.children.filter(isAllowed) }))
    .filter((g) => g.children.length > 0)
)

// 当前活跃子项所属分组，初始化时自动展开
const defaultOpeneds = computed(() => {
  const active = route.path
  const matched = menuGroups.find((g) => g.children.some((c) => c.path === active))
  return matched ? [matched.key] : []
})

async function onCommand(cmd) {
  if (cmd === 'logout') {
    await auth.logout()
    router.replace('/login')
  } else if (cmd === 'profile') {
    router.push('/profile')
  } else if (cmd === 'changePassword') {
    // 改密统一走个人中心的对话框,避免维护两份"修改密码"表单逻辑
    router.push({ path: '/profile', query: { changePassword: 1 } })
  }
}

// 头像兜底字符（无头像时显示姓名/手机号最后一个字）
const avatarInitial = computed(() => {
  const name = auth.user?.realName || auth.user?.mobile || ''
  return name ? name.slice(-1) : '?'
})
</script>

<style scoped>
.layout {
  height: 100vh;
}
.header {
  background: #001529;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.logo {
  font-size: 18px;
  font-weight: 600;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.user-trigger {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #fff;
}
.user-avatar {
  background: #409EFF;
  color: #fff;
  font-size: 12px;
}
.user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aside {
  background: #fff;
  border-right: 1px solid #ebeef5;
}
.main {
  background: #f5f7fa;
  padding: 16px;
}
</style>
