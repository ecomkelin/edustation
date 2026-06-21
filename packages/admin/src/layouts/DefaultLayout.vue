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
    <el-container class="body">
      <el-aside width="220px" class="aside">
        <el-menu :default-active="route.path" router :default-openeds="defaultOpeneds" class="aside-menu">
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon><span>仪表盘</span>
          </el-menu-item>
          <!-- AI 助手 (2026-06): 顶层入口, 跨业务域能力 -->
          <el-menu-item v-if="showAiAssistant" index="/ai-assistant">
            <el-icon><MagicStick /></el-icon><span>AI 助手</span>
          </el-menu-item>
          <template v-for="group in visibleGroups" :key="group.key">
            <el-sub-menu :index="group.key">
              <template #title>
                <el-icon><component :is="group.icon" /></el-icon>
                <span>{{ group.title }}</span>
              </template>
              <!-- D 方案 (2026-06-22): 支持二级子组 (例如系统管理下的"宠物管理"),
                   子组里再嵌套叶子菜单项 -->
              <template v-for="child in group.children" :key="child.path || child.label">
                <el-sub-menu v-if="child.children" :index="subGroupIndex(group.key, child.label)">
                  <template #title>
                    <el-icon><component :is="child.icon" /></el-icon>
                    <span>{{ child.label }}</span>
                  </template>
                  <el-menu-item v-for="leaf in child.children" :key="leaf.path" :index="leaf.path">
                    <el-icon><component :is="leaf.icon" /></el-icon>
                    <span>{{ leaf.label }}</span>
                  </el-menu-item>
                </el-sub-menu>
                <el-menu-item v-else :index="child.path">
                  <el-icon><component :is="child.icon" /></el-icon>
                  <span>{{ child.label }}</span>
                </el-menu-item>
              </template>
            </el-sub-menu>
          </template>
        </el-menu>
        <!-- 版权 (2026-06): 挪到左侧菜单底部固定, 省内容区高度 -->
        <AppFooter class="aside-footer" />
      </el-aside>
      <el-container direction="vertical" class="content">
        <el-main class="main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import OrgSwitcher from '@/components/OrgSwitcher.vue'
import AppFooter from '@/components/AppFooter.vue'
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
  Picture,
  // 招生试听 (2026-06) — 图标: TrendCharts (上升趋势图), 表达"招生漏斗 + 业绩增长"
  TrendCharts,
  // 机构推广 (Promotion 小喇叭) — 与 TrendCharts 区分
  Promotion,
  UserFilled,
  // AI 助手 (2026-06) — 魔棒图标
  MagicStick,
  // 课堂展示 (2026-06-21 pet-system-v2-ext) — 全屏展示
  VideoPlay,
  VideoCamera
} from '@element-plus/icons-vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// AI 助手 (2026-06): 顶层菜单项, 需 agent.write 权限
// 平台超管直通; 否则查当前 org 的职位权限码
const showAiAssistant = computed(() => {
  if (auth.isPlatformAdmin) return true
  const cur = auth.orgs.find((o) => o.id === auth.currentOrgId)
  if (!cur) return false
  return (cur.positions || []).some((p) =>
    (p.permissions || []).includes('agent.write')
  )
})

// 一级导航分组：按业务域聚合
const menuGroups = [
  {
    // 平台级: 平台超管管理多机构档案 + 系统级说明
    key: 'system',
    title: '系统管理',
    icon: Platform,
    children: [
      // 顺序 (2026-06-22 用户决策): 1 机构档案 2 游离用户 3 AI管理 4 宠物管理 5 地区管理 6 平台配置
      // 原 /orgs 改名为 机构档案; 与新一级菜单'机构管理'(本机构内部运营) 消歧
      { path: '/orgs', label: '机构档案', icon: Box, requirePlatform: true },
      // 游离用户 (2026-06-19): 不属于任何机构的孤儿账号 (跨机构数据, 平台超管审/清)
      { path: '/system/unaffiliated-users', label: '游离用户', icon: Connection, requirePlatform: true },
      // AI 管理 (2026-06-18): 会话/知识库/审计; 当前先做会话管理
      { path: '/system/ai', label: 'AI 管理', icon: MagicStick, requirePlatform: true },
      // D 方案 (2026-06-22) → 重构 (2026-06-22 用户决策):
      // 物种/装饰/食物图鉴由平台超管统一管理，全机构共用一份图鉴
      // requirePlatform: true，仅平台超管可见 + 可写；机构 admin 看得到页面但写操作后端 403
      {
        label: '宠物管理',
        icon: MagicStick,
        requirePlatform: true,
        children: [
          { path: '/pet/species', label: '宠物图鉴', icon: MagicStick, perm: 'pet.write', requirePlatform: true },
          { path: '/pet/items', label: '装饰图鉴', icon: MagicStick, perm: 'pet.write', requirePlatform: true },
          { path: '/pet/consumables', label: '食物玩具', icon: MagicStick, perm: 'pet.write', requirePlatform: true }
        ]
      },
      // 地区管理 (2026-06-22): 原"地区字典"简化命名; 平台超管维护省市区字典
      { path: '/regions', label: '地区管理', icon: Box, requirePlatform: true },
      // 平台配置 (2026-06-22): 4 个平台级配置项合并子组
      // 子组里都是 requirePlatform: true (纯平台超管配置), 机构用户看不到
      {
        label: '平台配置',
        icon: Setting,
        children: [
          // 站点配置: 备案号/运营主体 (2026-06)
          { path: '/system/site-config', label: '站点配置', icon: Setting, requirePlatform: true },
          // 平台协议 (2026-06): 平台级协议只读
          { path: '/legal/platform', label: '平台协议', icon: Files, requirePlatform: true },
          // 流程/说明类放最下面: 一次性的阅读材料, 不常看
          { path: '/platform/flow-guide', label: '开班流程说明', icon: Reading, requirePlatform: true },
          { path: '/platform/info', label: '系统说明', icon: Warning, requirePlatform: true }
        ]
      }
    ]
  },
  {
    // 本机构内部运营 (2026-06-22):
    // - 用户管理: 高频操作, 直挂二级 (admin 常看'我的人')
    // - 运营子组: 职位/推广/机构协议
    // - 基础数据子组: 文件/字典/教室/学科/学校档案
    key: 'org-mgmt',
    title: '机构管理',
    icon: Setting,
    children: [
      // 用户管理 (2026-06-22): 从运营子组提到机构管理直挂二级 (高频操作)
      { path: '/users', label: '用户管理', icon: User, perm: 'user.read' },
      // 运营子组: 职位/推广/机构协议
      {
        label: '运营',
        icon: User,
        children: [
          // 2026-06: 职位管理提到机构推广前 (机构 admin 进首页常看'我的人权限对不对')
          { path: '/positions', label: '职位管理', icon: Lock, perm: 'position.read' },
          // 原 /org/promotion 改名为 机构推广
          { path: '/org/promotion', label: '机构推广', icon: Promotion, perm: 'org-promotion.write' },
          // 机构协议 (2026-06-22): 从独立子组并入运营最下 (制度文档, 与推广同属机构运营)
          { path: '/legal/org-docs', label: '机构协议', icon: Notebook, perm: 'legal.read' }
        ]
      },
      // 基础数据子组: 文件/字典/教室/学科/学校档案
      {
        label: '基础数据',
        icon: Files,
        children: [
          // 文件管理 (2026-06-22): 从基础数据分离出来, 归位到机构管理
          { path: '/files', label: '文件管理', icon: Picture, perm: 'storage.read' },
          // 类别字典 (2026-06 整改): per-org, 机构 admin 可维护本机构字典
          { path: '/categories', label: '类别字典', icon: Files },
          { path: '/rooms', label: '教室', icon: Box, perm: 'room.read' },
          { path: '/subjects', label: '学科', icon: Notebook, perm: 'subject.read' },
          { path: '/schools', label: '学校档案', icon: School, perm: 'school.read' }
        ]
      }
    ]
  },
  {
    // 招生 (2026-06 方案 A): 招生漏斗入口, 地推/教务共用
    // 2026-06 图标换为 TrendCharts (上升趋势图), 与机构推广的 Promotion (小喇叭) 区分
    key: 'recruit',
    title: '招生',
    icon: TrendCharts,
    children: [
      // 顺序按数据收敛方向: 家长 (按手机号) → 孩子 (按孩子) → 预约 (按单次试听)
      { path: '/recruit/leads', label: '潜客管理(按家长)', icon: UserFilled, perm: 'recruit.read' },
      { path: '/recruit/child-leads', label: '孩子管理', icon: UserFilled, perm: 'recruit.read' },
      { path: '/recruit/trial-bookings', label: '试听记录', icon: Calendar, perm: 'recruit.read' }
    ]
  },
  {
    key: 'teach',
    title: '教务',
    icon: School,
    children: [
      { path: '/course-products', label: '课程产品', icon: Files, perm: 'courseProduct.read' },
      { path: '/course-instances', label: '开班', icon: Reading, perm: 'courseInstance.read' },
      { path: '/course-enrollments', label: '课程报名', icon: Notebook, perm: 'courseEnrollment.read' },
      { path: '/schedule', label: '排课', icon: Calendar, perm: 'lessonSchedule.read' },
      { path: '/schedule/class', label: '上课表', icon: Present, perm: 'lessonAttendance.read' },
      // 教学工具 (2026-06 方案 A): 原"课堂展示"一级菜单降级到子组, 预留扩展
      {
        label: '教学工具',
        icon: VideoPlay,
        children: [
          // 宠物课堂展示 (2026-06-21 pet-system-v2-ext): 全屏宠物展示页 (老师投影给全班看)
          { path: '/class/pet-display', label: '宠物课堂展示', icon: VideoCamera, perm: 'pet.read' }
        ]
      }
    ]
  },
  {
    key: 'biz',
    title: '学员',
    icon: User,
    children: [
      { path: '/students', label: '学生管理', icon: Reading, perm: 'student.read' },
      { path: '/student-products', label: '学生课包', icon: Present, perm: 'studentProduct.read' },
      { path: '/student-works', label: '学生作品', icon: Goods, perm: 'studentWork.read' },
      { path: '/orders', label: '订单', icon: ShoppingCart, perm: 'order.read' },
      // 积分管理 (2026-06-21): 学员积分账户列表 + 流水 + 手动调整积分
      { path: '/points', label: '积分管理', icon: Present, perm: 'points.read' },
      // 宠物实例 (2026-06-21 pet-system-v2): 机构全量宠物 + 事件流 + 调整
      // D 方案 (2026-06-22): 实例留在学员与订单 (per-org 强隔离, 学员侧资产)
      { path: '/pet', label: '宠物实例', icon: Present, perm: 'pet.read' }
    ]
  },
  // 课堂展示 (2026-06 方案 A): 降级到 教务 > 教学工具 子组, 不再作为一级菜单
  {
    key: 'analytics',
    title: '经营分析',
    icon: DataAnalysis,
    children: [
      { path: '/reports/overview', label: '经营总览', icon: Odometer, perm: 'report.read' },
      { path: '/reports/lesson-consumption', label: '课消与课表', icon: Reading, perm: 'report.read' },
      { path: '/reports/room-utilization', label: '教室利用率', icon: School, perm: 'report.read' },
      { path: '/reports/teacher-productivity', label: '老师产能', icon: User, perm: 'report.read' },
      { path: '/reports/points-activity', label: '积分与活跃', icon: Present, perm: 'report.read' },
      // 招生看板 (2026-06)
      { path: '/reports/recruit', label: '招生看板', icon: Promotion, perm: 'recruit.read' }
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

// D 方案 (2026-06-22): 二级子组在 el-menu 里的 index, 用 groupKey.label 拼一个唯一的, 避免与 group.key 冲突
function subGroupIndex(groupKey, label) {
  return `${groupKey}:${label}`
}

// 递归过滤 children:
// - 叶子项走 isAllowed
// - 子组 (有 children 字段) 递归过滤, 过滤后空数组则子组整体隐藏
function filterChildren(children) {
  return children
    .map((c) => {
      if (c.children) {
        const sub = filterChildren(c.children)
        return sub.length > 0 ? { ...c, children: sub } : null
      }
      return isAllowed(c) ? c : null
    })
    .filter(Boolean)
}

const visibleGroups = computed(() =>
  menuGroups
    .map((g) => ({ ...g, children: filterChildren(g.children) }))
    .filter((g) => g.children.length > 0)
)

// 当前活跃子项所属分组 (含二级嵌套), 初始化时自动展开 group + sub-group
const defaultOpeneds = computed(() => {
  const active = route.path
  for (const g of menuGroups) {
    for (const c of g.children) {
      if (c.path === active) return [g.key]
      if (c.children && c.children.some((leaf) => leaf.path === active)) {
        return [g.key, subGroupIndex(g.key, c.label)]
      }
    }
  }
  return []
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
  flex-shrink: 0;
}
.body { flex: 1; min-height: 0; }
.content { flex: 1; min-width: 0; }
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
  display: flex;
  flex-direction: column;
  overflow: hidden;       /* 整体 aside 不滚, 内部 .aside-menu 滚 */
}
.aside-menu {
  flex: 1;
  overflow-y: auto;
  border-right: none !important; /* el-menu 自带 border, 跟 aside 重叠 */
}
.aside-footer {
  /* footer 走自己的样式, 这里只控宽度不超 */
  flex-shrink: 0;
  border-top: 1px solid #ebeef5;
}
.main {
  background: #f5f7fa;
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}
</style>
