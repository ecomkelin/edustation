<!--
  首页 (家) - 核心:今日课 + 周历 + 当前孩子 + 宠物卡片
-->
<template>
  <view class="home">
    <!-- 顶部渐变背景 -->
    <view class="home__top">
      <view class="home__bg-circle home__bg-circle--1" />
      <view class="home__bg-circle home__bg-circle--2" />

      <view class="home__topbar safe-area-top">
        <view class="home__greeting">
          <text class="home__greet-text">{{ greeting }},</text>
          <text class="home__greet-name">{{ userName }} 👋</text>
        </view>
        <view class="home__notif press" @tap="onNotif">
          <text class="home__notif-icon">🔔</text>
          <view v-if="notifUnread > 0" class="home__notif-dot">
            <text class="home__notif-dot-text">{{ notifUnread > 99 ? '99+' : notifUnread }}</text>
          </view>
        </view>
      </view>

      <!-- 2026-07-04 重做: 学生 pill 和机构 chip 同 row, 跟 red-box 一致 -->
      <view class="home__top-content">
        <active-student-header @change="onStudentChange" />
        <view class="home__org-chip press" @tap="goOrgHome">
          <text class="home__org-chip-icon">🏫</text>
          <text class="home__org-chip-name">{{ currentOrgName || '选择机构' }}</text>
        </view>
      </view>
    </view>

    <!-- 主体内容 -->
    <scroll-view scroll-y class="home__body" @scrolltolower="onLower">
      <!-- 2026-07-02 fix: scroll-view 内 padding 在 H5 下不传给子节点,
           包一层 wrapper view 承载 padding 让 section 真正缩进 -->
      <view class="home__body-inner">

      <!-- 2026-07-04 删「机构」stat: 顶部已有 home__org-chip 同入口, 重复
           现在只剩「剩余课时」「积分」2 列, 改成 1fr 1fr 居中放大 -->
      <view class="home__quickstats home__quickstats--2col">
        <view class="home__quickstat press" @tap="goStudentProducts">
          <text class="home__quickstat-val">{{ stats.lessonsLeft || 0 }}</text>
          <text class="home__quickstat-lbl">剩余课时</text>
        </view>
        <view class="home__quickstat press" @tap="goPoints">
          <text class="home__quickstat-val">{{ stats.points || 0 }}</text>
          <text class="home__quickstat-lbl">积分</text>
        </view>
      </view>

      <!-- 宠物概略 (2026-07-02 加回首页; 2026-07-03 删去照顾 冗余 CTA — 点卡片本身进入详情) -->
      <view class="home__section">
        <view class="section-title">
          <text>🐾 我的宠物</text>
        </view>

        <!-- 加载中 -->
        <view v-if="petLoading && !pet && !petBlockReason" class="home__pet-loading">
          <text>召唤中…</text>
        </view>

        <!-- 未报名: 引导去孩子 tab (2026-07-03: org 改名为 child) -->
        <view v-else-if="petBlockReason === 'notEnrolled'" class="home__pet-empty press" @tap="goPage('/pages/tabbar/explore')">
          <text class="home__pet-empty-emoji">🌱</text>
          <view class="home__pet-empty-info">
            <text class="home__pet-empty-title">先报名一门课程吧</text>
            <text class="home__pet-empty-desc">报名后孩子就能领养宠物伙伴 ›</text>
          </view>
        </view>

        <!-- 未领养: 引导去领养 -->
        <view v-else-if="!pet" class="home__pet-empty press" @tap="goPetAdopt">
          <text class="home__pet-empty-emoji">🥚</text>
          <view class="home__pet-empty-info">
            <text class="home__pet-empty-title">领养孩子的第一位小伙伴</text>
            <text class="home__pet-empty-desc">选一个蛋,让它陪伴孩子一起成长 ›</text>
          </view>
        </view>

        <!-- 蛋态 -->
        <view v-else-if="pet.state === 'egg'" class="home__pet-card press" @tap="goPetDetail">
          <view class="home__pet-portrait">
            <text class="home__pet-portrait-emoji">🥚</text>
          </view>
          <view class="home__pet-info">
            <view class="home__pet-name-row">
              <text class="home__pet-name">{{ petName }}</text>
              <text class="home__pet-state">待破壳</text>
            </view>
            <text class="home__pet-tier-tag" :style="{ color: petTierColor }">{{ petTier }} 阶</text>
            <text class="home__pet-cta">✨ 点击破壳看看 ›</text>
          </view>
        </view>

        <!-- 已破壳: 主卡 (头像 + 名字 + 阶位 + 双进度条) -->
        <view v-else class="home__pet-card press" @tap="goPetDetail">
          <view class="home__pet-portrait">
            <!-- 2026-07-04 重做: 跟 admin PetClassroomDisplay 严格对齐
                 - 背景层独立铺满 portrait 区, 走 svg-wrap + v-html
                 - species + 装备叠加层 走 svg-wrap + v-html + :deep(svg) CSS -->

            <!-- 背景层 -->
            <view
              v-if="petEquipLayer.background && petEquipLayer.background.svgContent"
              class="home__pet-bg"
            >
              <view class="home__svg-wrap" v-html="petEquipLayer.background.svgContent" />
            </view>

            <!-- species 主图: 三分支 svg / video / image (2026-07-14 跟 detail.vue PetEquipmentOverlay 范式对齐) -->
            <view v-if="petSpecies && petSpecies.visualType === 'svg' && petSpecies.svgContent" class="home__svg-wrap home__pet-portrait-svg" v-html="petSpecies.svgContent" />
            <!-- 2026-07-14: 跟 admin PetEquipmentOverlay 严格对齐 — 极简单行 video (无 uni-app props / 无 event handlers)
                 之前加了一堆 uni-app 特定 props + Vue @canplay/@loadedmetadata → uni-app x 3.0-alpha H5
                 触发内部 [petVideo] error 假信号, ref 未就位时 handler 跑不到, autoplay 链断 -->
            <video
              v-else-if="petSpecies && petSpecies.visualType === 'video' && petSpecies.videoFile && petSpecies.videoFile.url"
              :src="petSpecies.videoFile.url"
              :key="petSpecies._id"
              autoplay loop muted playsinline
              style="object-fit: contain"
              class="home__pet-portrait-video"
            />
            <image
              v-else-if="petSpecies && petSpecies.imageFile && petSpecies.imageFile.url"
              :src="petSpecies.imageFile.url"
              class="home__pet-portrait-img"
              mode="aspectFit"
            />
            <text v-else class="home__pet-portrait-emoji">{{ petEmoji }}</text>

            <!-- 装备叠加层 (hat/scarf/clothes/accessory/halo) — 三分支 (2026-07-14 补 video/image) -->
            <view class="home__pet-equips">
              <view
                v-for="slot in ['hat','scarf','clothes','accessory','halo']"
                :key="slot"
                class="home__pet-equip-layer"
                :class="`home__pet-equip-layer--${slot}`"
              >
                <view v-if="petEquipLayer[slot] && petEquipLayer[slot].svgContent" class="home__svg-wrap" v-html="petEquipLayer[slot].svgContent" />
                <video
                  v-else-if="petEquipLayer[slot] && petEquipLayer[slot].visualType === 'video' && petEquipLayer[slot].videoUrl"
                  :src="petEquipLayer[slot].videoUrl"
                  :key="slot"
                  autoplay loop muted playsinline
                  style="object-fit: contain"
                  class="home__pet-equip-video"
                />
                <image
                  v-else-if="petEquipLayer[slot] && petEquipLayer[slot].imageFile && petEquipLayer[slot].imageFile.url"
                  :src="petEquipLayer[slot].imageFile.url"
                  class="home__pet-equip-img"
                  mode="aspectFit"
                />
              </view>
            </view>

            <view class="home__pet-tier-badge" :style="{ background: petTierColor }">
              <text>{{ petTier }}</text>
            </view>
          </view>
          <view class="home__pet-info">
            <view class="home__pet-name-row">
              <text class="home__pet-name">{{ petName }}</text>
              <text class="home__pet-state">Lv.{{ pet.level || 1 }}</text>
            </view>
            <view class="home__pet-stat">
              <text class="home__pet-stat-label">🍖 饱腹</text>
              <view class="home__pet-stat-bar">
                <view class="home__pet-stat-fill home__pet-stat-fill--hunger" :style="{ width: petHungerPercent + '%' }" />
              </view>
              <text class="home__pet-stat-val">{{ pet.currentHunger || 0 }}/{{ pet.maxHunger || 100 }}</text>
            </view>
            <view class="home__pet-stat">
              <text class="home__pet-stat-label">⭐ 经验</text>
              <view class="home__pet-stat-bar">
                <view class="home__pet-stat-fill home__pet-stat-fill--exp" :style="{ width: petExpPercent + '%' }" />
              </view>
              <text class="home__pet-stat-val">{{ pet.experience || 0 }}/{{ petExpToNext }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 本周课表 (周历) -->
      <view class="home__section">
        <view class="section-title">
          <text>📅 本周课表</text>
          <!-- 2026-07-02: 从原"今日课程" section-title 挪过来, 跟点击意图对齐 (看完整一周课表) -->
          <text class="section-title__more section-title__more--cta" @tap="goCalendar">查看完整课表 ›</text>
        </view>

        <scroll-view scroll-x class="home__week" show-scrollbar="false">
          <view class="home__week-inner">
            <view
              v-for="day in weekDays"
              :key="day.date"
              class="home__week-day"
              :class="{ 'home__week-day--today': day.isToday, 'home__week-day--selected': day.isSelected }"
              @tap="selectDay(day)"
            >
              <text class="home__week-day-name">{{ day.name }}</text>
              <text class="home__week-day-date">{{ day.dateLabel }}</text>
              <view v-if="day.hasLesson" class="home__week-day-dot" />
            </view>
          </view>
        </scroll-view>

        <view v-if="selectedDayLessons.length" class="home__day-list">
          <view
            v-for="lesson in selectedDayLessons"
            :key="lesson._id"
            class="home__day-item press"
            @tap="goLessonDetail(lesson._id)"
          >
            <view class="home__day-time">
              <text>{{ formatTime(lesson.plannedStartTime) }}</text>
            </view>
            <view class="home__day-info">
              <view class="home__day-title-row">
                <text class="home__day-title">{{ lesson.courseInstance?.name || lesson.subject?.name || '课程' }}</text>
                <!-- 2026-07-10: 显示「第N节」, 让家长一眼看出第几次课。
                     lessonNo 可能为 null (排课未排次) 或字符串/数字, 兜底隐藏整 chip -->
                <text
                  v-if="lesson.lessonNo != null && lesson.lessonNo !== ''"
                  class="home__day-lesson-no"
                >第 {{ lesson.lessonNo }} 节</text>
              </view>
              <text class="home__day-meta">{{ lesson.teacher?.realName || '老师' }}</text>
            </view>
          </view>
        </view>
        <!-- 2026-07-11: 空状态分 3 档, 提示家长更友好
             1) 今天没课但未来 30 天内有课 → "下一节课在明天 16:00 · 周五"
             2) 今天没课且整 30 天都没课  → "还没有安排课程" (友好兜底)
             3) 用户切到非今日的某天且该日无课 → 同样走 nextUpcomingLesson 找下一天
             2026-07-11 修正: uni-app 不允许 <text> 嵌套 <template>/<view>, 用 <view> 容器包裹 -->
        <view v-else class="home__day-empty">
          <view v-if="nextUpcomingLesson" class="home__day-empty-main">
            <text v-if="selectedDay?.isToday">今天没有课哦 · </text>
            <text v-else>{{ selectedDay?.name || '该日' }}没有课 · </text>
            <text>下一节在{{ nextUpcomingLabel }} · {{ nextUpcomingDateLabel }}</text>
          </view>
          <view v-else class="home__day-empty-main">
            <text v-if="selectedDay?.isToday">今天没有课哦</text>
            <text v-else>{{ selectedDay?.name || '该日' }}没有课</text>
            <view class="home__day-empty-sub">还没有安排课程</view>
          </view>
        </view>
      </view>

      <!-- 2026-07-04 改文案: 「我的课程」→「当前课程」(更准确: 展示当前 active kid 在学的)
                          「全部课程」→「我的课程」(作为 CTA 跳全量列表, 区别于上方 active kid 单列表) -->
      <view class="home__section">
        <view class="section-title">
          <text>📚 当前课程</text>
          <text class="section-title__more section-title__more--cta" @tap="goMyCoursesAll">我的课程 ›</text>
        </view>

        <view v-if="enrollmentsLoading" class="home__loading">
          <text>召唤中…</text>
        </view>
        <view v-else-if="!enrollments.length" class="home__mine-empty">
          <text>还没有报名任何课程 ›</text>
        </view>
        <view v-else class="home__mine-list">
          <view
            v-for="e in enrollments"
            :key="e._id"
            class="home__mine-card press"
            @tap="goCourseDetail(e.courseInstance?._id || e.courseInstance)"
          >
            <text class="home__mine-card-name">{{ e.courseInstance?.name || '课程' }}</text>
            <view class="home__mine-card-meta">
              <text>👨‍🏫 {{ e.courseInstance?.teacher?.realName || '老师' }}</text>
              <text>📍 {{ e.courseInstance?.room?.name || '教室待定' }}</text>
            </view>
            <view class="home__mine-card-progress">
              <view class="home__mine-card-bar">
                <view
                  class="home__mine-card-bar-fill"
                  :style="{ width: mineProgress(e.progress && e.progress.attendedLessons, e.progress && e.progress.totalLessons) }"
                />
              </view>
              <text>已上 {{ (e.progress && e.progress.attendedLessons) || 0 }}/{{ (e.progress && e.progress.totalLessons) || 0 }} 节</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 学习画像 (2026-07-04: 从原 me.vue 移来; 数据源 R-0474 /students/me/profile - 6 字段 personality/learningGoal/weakness/strengths/classFeedback/followUp) -->
      <!-- 2026-07-04: 删「查看完整 ›」CTA — 整张 profile 卡片已可点 (@tap="goProfile"), 文字入口重复 -->
      <view class="home__section">
        <view class="section-title">
          <text>📊 学习画像</text>
        </view>

        <view class="home__profile press" @tap="goProfile">
          <view v-if="profileLoading" class="home__profile-loading">
            <text>召唤中…</text>
          </view>
          <view v-else-if="!profileHighlight" class="home__profile-empty">
            <text class="home__profile-empty-emoji">📊</text>
            <view class="home__profile-empty-info">
              <text class="home__profile-empty-title">还没有画像</text>
              <text class="home__profile-empty-desc">老师建好后,会显示孩子的成长数据 ›</text>
            </view>
          </view>
          <view v-else>
            <text class="home__profile-hl">{{ profileHighlight.label }}</text>
            <text class="home__profile-text">{{ profileHighlight.text }}</text>
          </view>
        </view>
      </view>

      <!-- 作品墙 (2026-07-03: 替换原快捷入口; 显示最近 4 个作品 + 右上"个人成长记录"入口) -->
      <view class="home__section">
        <view class="section-title">
          <text>🎨 作品墙</text>
          <!-- 2026-07-04: 删「个人成长记录 ›」CTA — 后端未开发, 点也是 toast 敬请期待, 摆着误导 -->
        </view>

        <view v-if="worksLoading" class="home__loading">
          <text>召唤中…</text>
        </view>
        <view v-else-if="!works.length" class="home__works-empty press" @tap="goWorksAll">
          <text class="home__works-empty-emoji">🎨</text>
          <text class="home__works-empty-title">还没有作品</text>
          <text class="home__works-empty-desc">孩子上课后,作品会出现在这里 ›</text>
        </view>
        <view v-else>
          <view class="home__works-grid">
            <view
              v-for="w in works"
              :key="w._id"
              class="home__works-tile press"
              @tap="goWorkDetail(w._id)"
            >
              <image
                v-if="firstFile(w)"
                class="home__works-img"
                :src="firstFile(w)"
                mode="aspectFill"
              />
              <view v-else class="home__works-img-fallback">
                <text>🎨</text>
              </view>
              <view v-if="w.title" class="home__works-title">
                <text>{{ w.title }}</text>
              </view>
            </view>
          </view>
          <view class="home__works-more press" @tap="goWorksAll">
            <text>查看全部作品 ›</text>
          </view>
        </view>
      </view>

      <view class="home__bottom-spacer" />
      </view>
    </scroll-view>

    <!-- 协议墙 -->
    <pending-consents
      v-if="showConsents"
      :visible="showConsents"
      :list="pendingList"
      @done="onConsentsDone"
    />

    <!-- 2026-07-11 v0.9: 通知预览面板 (点铃铛展开; 类似微信)
         - mask: 点击关闭
         - 每条通知: 标题 + 摘要 + 时间 + 「查看」按钮 (markRead + uni.navigateTo deeplink)
         - 底部: 「查看全部消息」按钮 switchTab 跳 messages tab -->
    <view v-if="notifPanelOpen" class="notif-mask" @tap="closeNotifPanel">
      <view class="notif-panel" @tap.stop>
        <view class="notif-panel__header">
          <text class="notif-panel__title">通知</text>
          <text v-if="notifUnread > 0" class="notif-panel__count">{{ notifUnread }} 条未读</text>
        </view>

        <view v-if="notifPanelLoading" class="notif-panel__loading">
          <text>加载中…</text>
        </view>

        <view v-else-if="!notifPanelList.length" class="notif-panel__empty">
          <text class="notif-panel__empty-emoji">📭</text>
          <text class="notif-panel__empty-text">暂无未读通知</text>
        </view>

        <view v-else class="notif-panel__items">
          <view
            v-for="n in notifPanelList"
            :key="n._id"
            class="notif-panel__item"
          >
            <view class="notif-panel__item-icon">
              <text>{{ iconOf(n.type) }}</text>
            </view>
            <view class="notif-panel__item-body">
              <text class="notif-panel__item-title">{{ n.title || n.type }}</text>
              <text class="notif-panel__item-summary">{{ n.body }}</text>
              <text class="notif-panel__item-time">{{ formatNotifTime(n.createdAt) }}</text>
            </view>
            <view class="notif-panel__item-go press" @tap="goNotif(n)">
              <text>查看</text>
            </view>
          </view>
        </view>

        <view class="notif-panel__footer">
          <view class="notif-panel__footer-btn press" @tap="goMessages">
            <text>查看全部消息 ›</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { mapState, mapGetters } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import ActiveStudentHeader from '@/components/layout/ActiveStudentHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PendingConsents from '@/components/auth/PendingConsents.vue'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { notificationApi } from '@/api/notification'
import { pointsApi } from '@/api/points'
import { petApi } from '@/api/pet'
import { studentProductApi } from '@/api/studentProduct'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { studentWorkApi } from '@/api/studentWork'
import { studentApi } from '@/api/student'
import { date } from '@/utils/date'
import { greetingByHour, PET_SPECIES_EMOJI } from '@/utils/constants'
import { haptic } from '@/utils/haptic'
import { toast } from '@/components/common/Toast'

const TIER_EMOJI = { C: '🥚', B: '🐣', A: '🦊', S: '🐉' }
const TIER_COLOR = { C: '#9CA3AF', B: '#7CD9B7', A: '#5B9EE6', S: '#F5C148' }
// 2026-07-11 v0.9: 通知类型 emoji (跟 components/messages/InboxList.vue TYPE_ICON 同源)
const NOTIF_ICON = {
  lesson_remind_1h: '📚', lesson_remind_24h: '📅', lesson_absent: '⚠️',
  task_due: '📝', task_assigned: '📋', task_comment: '💬',
  order_paid: '💰', order_refunded: '↩️',
  evaluation_published: '⭐',
  point_grant: '🎁', point_deduct: '💸',
  pet_critical: '🐾',
  access_stranger: '🚨',
  system_notice: '📢'
}
// 2026-07-03: 装备 slot 常量 (与 detail.vue / admin 对齐)
const PET_ITEM_SLOTS = ['background', 'hat', 'scarf', 'clothes', 'accessory', 'halo']

export default {
  components: { ActiveStudentHeader, EmptyState, PendingConsents },
  data() {
    return {
      loading: true,
      weekLessons: [],
      selectedDate: '',
      showConsents: false,
      pendingList: [],
      // 宠物概略卡 (2026-07-02 加回首页, 合并自原 pet.vue)
      petLoading: false,
      pet: null,
      petSpecies: null,
      petBlockReason: '',
      // 2026-07-03 加: 装备 catalog 缓存 (用 petApi.items 拉一次), 给首页宠物卡显示"已装备 N 件"
      petEquipMap: {},
      // 我的课程 (2026-07-03 简化, 只剩当前孩子报名的课程; 2026-07-02 替换原"今日课程" section)
      enrollments: [],
      enrollmentsLoading: false,
      // 2026-07-03: 顶部孩子 stat (剩余课时 + 积分, 从原 me.vue 移过来)
      stats: { lessonsLeft: 0, points: 0 },
      statsLoading: false,
      // 2026-07-03 作品墙: 最近 4 个作品缩略图 (R-1670 me)
      works: [],
      worksLoading: false,
      // 2026-07-04 学习画像: 学生 profile (端点 /students/:id/profile 返 personality/learningGoal/weakness...)
      profile: null,
      profileLoading: false,
      // 2026-07-11 v0.9: 顶部铃铛未读数 (R-4003), >0 时显示红点
      notifUnread: 0,
      // 2026-07-11 v0.9: 通知预览面板 (点铃铛展开)
      notifPanelOpen: false,
      notifPanelList: [],
      notifPanelLoading: false
    }
  },
  computed: {
    ...mapState(useAuthStore, ['user', 'pendingConsents']),
    ...mapGetters(useAuthStore, ['hasPendingConsents']),
    ...mapState(useStudentStore, ['activeStudentId']),

    auth() {
      return useAuthStore()
    },

    // 2026-07-03: 当前激活机构 (顶部"机构"stat 跳转用)
    orgId() {
      return this.auth.currentOrgId
    },
    // 2026-07-04: 顶部同-row 机构 chip 用, 从 auth.orgs 找当前机构名
    currentOrgName() {
      const id = this.auth.currentOrgId
      if (!id || !Array.isArray(this.auth.orgs)) return ''
      const org = this.auth.orgs.find((o) => String(o.id) === String(id))
      return (org && org.name) || ''
    },

    userName() {
      return this.user?.realName || this.user?.mobile?.slice(-4) || '朋友'
    },
    greeting() {
      return greetingByHour()
    },
    weekDays() {
      const start = date.startOfWeek()
      const today = date.fmtDate(new Date())
      const days = []
      for (let i = 0; i < 7; i++) {
        const d = date.addDays(start, i)
        const dateStr = date.fmtDate(d)
        const lessons = this.weekLessons.filter((l) => date.fmtDate(l.plannedStartTime) === dateStr)
        days.push({
          date: dateStr,
          name: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d).getDay()],
          dateLabel: String(new Date(d).getDate()),
          isToday: dateStr === today,
          isSelected: dateStr === this.selectedDate,
          hasLesson: lessons.length > 0
        })
      }
      return days
    },
    todayLessons() {
      const today = date.fmtDate(new Date())
      return this.weekLessons
        .filter((l) => date.fmtDate(l.plannedStartTime) === today)
        .sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    },
    selectedDayLessons() {
      if (!this.selectedDate) return []
      return this.weekLessons
        .filter((l) => date.fmtDate(l.plannedStartTime) === this.selectedDate)
        .sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    },
    // 2026-07-11: 空状态提示用 — 找到 selectedDate 之后最近的一节排课
    //   返回 { daysUntil, lesson, date } 或 null (整 30 天都没排课)
    //   用 selectedDate 而不是 today, 这样用户切到任意一天都有正确提示
    nextUpcomingLesson() {
      if (!this.selectedDate) return null
      const selected = new Date(this.selectedDate)
      const future = this.weekLessons
        .filter((l) => l && l.plannedStartTime && new Date(l.plannedStartTime) > selected)
        .sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
      if (!future.length) return null
      const next = future[0]
      const nextDate = new Date(next.plannedStartTime)
      const nextDateStr = date.fmtDate(nextDate)
      // 计算距离 selectedDate 多少天 (向上取整, 半天算 1 天)
      const ms = nextDate.getTime() - selected.getTime()
      const daysUntil = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
      return { daysUntil, lesson: next, date: nextDate, dateStr: nextDateStr }
    },
    // 2026-07-11: 把 nextUpcomingLesson.daysUntil 转成中文短语
    //   1 → "明天", 2 → "后天", 3-7 → "3 天后", 8+ → "N 天后"
    nextUpcomingLabel() {
      const n = this.nextUpcomingLesson
      if (!n) return ''
      if (n.daysUntil === 1) return '明天'
      if (n.daysUntil === 2) return '后天'
      return `${n.daysUntil} 天后`
    },
    // 2026-07-11: nextUpcomingLesson 的友好日期标签, 给空状态用
    //   同一周显示 "周X HH:mm", 跨周显示 "MM-DD 周X HH:mm", 跨月加 "M月"
    nextUpcomingDateLabel() {
      const n = this.nextUpcomingLesson
      if (!n) return ''
      const today = new Date()
      const todayYmd = date.fmtDate(today)
      const nextMd = `${n.date.getMonth() + 1}/${n.date.getDate()}`
      const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][n.date.getDay()]
      const time = new Date(n.date).toTimeString().slice(0, 5)
      // 同月内只显示 MM/DD; 跨月显示 M月DD日; 跨年显示 YYYY-MM-DD
      if (n.date.getFullYear() === today.getFullYear()) {
        if (n.date.getMonth() === today.getMonth()) return `${nextMd} ${weekday} ${time}`
        return `${n.date.getMonth() + 1}月${n.date.getDate()}日 ${weekday} ${time}`
      }
      return `${date.fmtDate(n.date)} ${weekday} ${time}`
    },
    // 2026-07-11: 30 天窗口内完全没有排课时, 模板走"还没有安排课程"友好兜底
    hasNoUpcomingIn30Days() {
      return !this.nextUpcomingLesson
    },
    // 2026-07-02 fix: 模板 line 196 用 selectedDay.isToday/name, 但 data 只声明了 selectedDate (字符串)
    // 从 weekDays 里反查选中的 day 对象, 模板就不报 undefined 了
    selectedDay() {
      return this.weekDays.find((d) => d.date === this.selectedDate) || null
    },
    // 宠物概略 (2026-07-02 加)
    petTier() {
      return this.pet?.tier || this.pet?.eggTier || 'C'
    },
    petTierColor() {
      return TIER_COLOR[this.petTier] || TIER_COLOR.C
    },
    petHungerPercent() {
      if (!this.pet) return 0
      const max = this.pet.maxHunger || 100
      return Math.max(0, Math.min(100, ((this.pet.currentHunger || 0) / max) * 100))
    },
    petExpToNext() {
      if (!this.pet) return 100
      const L = this.pet.level || 1
      const tier = this.petTier
      const formula = { C: 50 + L * 20, B: 80 + L * 30, A: 120 + L * 50, S: 200 + L * 80 }
      return formula[tier] || 100
    },
    petExpPercent() {
      if (!this.pet) return 0
      return Math.max(0, Math.min(100, ((this.pet.experience || 0) / this.petExpToNext) * 100))
    },
    petEmoji() {
      if (!this.pet) return '🐾'
      // 2026-07-14: visualType==='video'/'image' 物种靠真实素材渲染, emoji 仅兜底 (物种无素材)
      // 已破壳用 speciesRecord (admin 维护的 svg 优先), 否则按 species key 查 emoji
      if (this.pet.state !== 'egg' && this.petSpecies && this.petSpecies.visualType !== 'svg' && this.petSpecies.visualType !== 'video' && this.petSpecies.visualType !== 'image' && this.petSpecies.icon) {
        return this.petSpecies.icon
      }
      const key = this.pet.species
      return (key && PET_SPECIES_EMOJI[key]) || TIER_EMOJI[this.petTier] || '🐾'
    },

    // 2026-07-02: species.visualType='svg' 时, 把 svgContent 转 data URI 让 image 渲染
    // base64 编码避免引号转义问题, 跟 admin PetClassroomDisplay v-html 等效
    petSvgSrc() {
      if (!this.petSpecies || this.petSpecies.visualType !== 'svg' || !this.petSpecies.svgContent) return ''
      // uni-app image 不支持 v-html, 转 base64 data URI
      try {
        // #ifdef H5
        // H5 端 base64 编码有 btoa, 走 btoa
        if (typeof btoa === 'function') {
          return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(this.petSpecies.svgContent)))
        }
        // #endif
        // 其他端 (小程序) 用 encodeURIComponent + 手写 base64
        return 'data:image/svg+xml;base64,' + this._b64encode(this.petSpecies.svgContent)
      } catch (e) {
        return ''
      }
    },
    petName() {
      return this.pet?.nickname || this.petSpecies?.name || TIER_EMOJI[this.petTier] || '我的宠物'
    },
    petStateLabel() {
      if (!this.pet) return ''
      if (this.pet.state === 'egg') return '🥚 待破壳'
      return `Lv.${this.pet.level || 1} · ${this.petTier} 阶`
    },
    // 2026-07-04 重做: 直接透传 svgContent, 模板走 svg-wrap + v-html (跟 admin 同源)
    petEquipLayer() {
      const out = { background: null, hat: null, scarf: null, clothes: null, accessory: null, halo: null }
      if (!this.pet) return out
      const equipped = this.pet.equipped || {}
      for (const slot of PET_ITEM_SLOTS) {
        const key = equipped[slot]
        if (!key) continue
        const meta = this.petEquipMap[key]
        if (!meta) continue
        out[slot] = {
          key,
          // 2026-07-14: 透传 visualType + videoFile + videoUrl (跟 detail.vue equipmentLayers 字段对齐)
          visualType: meta.visualType || 'image',
          svgContent: meta.svgContent || '',
          url: (meta.imageFile && meta.imageFile.url) || '',
          imageFile: meta.imageFile || null,
          videoFile: meta.videoFile || null,
          videoUrl: meta.videoFile && meta.videoFile.url ? meta.videoFile.url : ''
        }
      }
      return out
    },
    // 2026-07-04 学习画像 (mini 预览): 取第一个非空字段做高亮 label + 60 字预览
    // 端点实际返 personality/learningGoal/weakness/classFeedback/strengths/followUp (老师手填画像)
    profileHighlight() {
      const p = this.profile
      if (!p) return null
      const candidates = [
        { label: '🎯 学习目标', text: p.learningGoal },
        { label: '💡 性格特点', text: p.personality },
        { label: '⭐ 优势', text: p.strengths },
        { label: '⚠️ 待加强', text: p.weakness },
        { label: '💬 课堂反馈', text: p.classFeedback },
        { label: '📌 跟进事项', text: p.followUp }
      ]
      for (const c of candidates) {
        if (c.text && String(c.text).trim()) {
          const txt = String(c.text).trim()
          return {
            label: c.label,
            text: txt.length > 60 ? txt.slice(0, 60) + '…' : txt
          }
        }
      }
      return null
    }
  },
  watch: {
    activeStudentId() {
      this.load()
    },
    pendingConsents: {
      handler(list) {
        if (Array.isArray(list) && list.length) {
          this.pendingList = list
          this.showConsents = true
        }
      },
      immediate: true
    }
  },
  onShow() {
    if (!this.selectedDate) this.selectedDate = date.fmtDate(new Date())
    this.load()
    this.loadUnreadCount()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const now = new Date()
        const start = date.startOfWeek()
        // 2026-07-11: 拉到 30 天, 给空状态提示"最近 N 天后有课"用 (不再只到下周)
        const end = date.addDays(start, 30)
        // 2026-07-02 fix: 改用 C 端 myCalendar (R-1492),不走 admin /calendar
        // admin /calendar 需要 lessonSchedule.read 权限码,家长没有 → 返空 → 今日课永远空
        const res = await lessonScheduleApi.myCalendar({
          from: date.fmtDate(start),
          to: date.fmtDate(end),
          isTrialLesson: false
        })
        // 响应可能是数组 / {items: []} / {data: []}
        let list = res
        if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        else if (!Array.isArray(res)) list = []
        this.weekLessons = list.map((l) => ({ ...l, _id: l._id || l.id }))
      } catch (e) {
        console.warn('[home.load]', e)
        this.weekLessons = []
      } finally {
        this.loading = false
      }
      // 宠物概略 (并行)
      this.loadPet()
      // 我的课程 (并行)
      this.loadEnrollments()
      // 作品墙 (并行, 2026-07-03)
      this.loadWorks()
      // 孩子 stat (并行, 2026-07-03)
      this.loadStats()
      // 学习画像 (并行, 2026-07-04)
      this.loadProfile()
    },

    // 2026-07-03 简化: 只加载当前孩子报名的课程 (R-1214); 课包顶部 stat 已有, 此模块不重复展示
    async loadEnrollments() {
      this.enrollmentsLoading = true
      try {
        const res = await courseEnrollmentApi.me({})
        let list = []
        if (Array.isArray(res)) list = res
        else if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        this.enrollments = list
      } catch (e) {
        console.warn('[child.loadEnrollments]', e)
        this.enrollments = []
      } finally {
        this.enrollmentsLoading = false
      }
    },

    // 进度条百分比 (避免除零)
    mineProgress(value, total) {
      const v = Number(value) || 0
      const t = Number(total) || 0
      if (t <= 0) return '0%'
      return Math.min(100, Math.round((v / t) * 100)) + '%'
    },

    // 2026-07-02: 课程卡点击进 CourseInstance 详情 (R-1101 + R-1215)
    goCourseDetail(id) {
      if (!id) return
      haptic.tap()
      uni.navigateTo({ url: '/pages/course/instance-detail?id=' + id })
    },

    // 2026-07-03: 作品墙模块 — 加载最近 4 个作品 (R-1670 /student-works/me)
    async loadWorks() {
      this.worksLoading = true
      try {
        const res = await studentWorkApi.me({ page: 1, pageSize: 4, sort: '-createdAt' })
        // http 拦截器可能返 res.data 或直接 res, 兼容 [memory: http-interceptor-actually-unpacked]
        const data = res?.data || res || {}
        this.works = Array.isArray(data.items) ? data.items
          : Array.isArray(data.data) ? data.data
          : Array.isArray(data) ? data
          : []
      } catch (e) {
        console.warn('[child.loadWorks]', e)
        this.works = []
      } finally {
        this.worksLoading = false
      }
    },

    // 2026-07-03: 孩子维度 stat — 剩余课时 (从 studentProductApi.me 聚合) + 积分 (pointsApi.me)
    async loadStats() {
      this.statsLoading = true
      const tasks = []
      // /points/me 后端强制 activeStudent, 没选孩子就别发
      if (this.activeStudentId) {
        tasks.push(
          pointsApi.me().then((r) => (this.stats.points = r?.balance || 0)).catch(() => {})
        )
      }
      tasks.push(
        studentProductApi
          .me({ isActive: true })
          .then((res) => {
            const items = Array.isArray(res) ? res : res?.items || res?.data || []
            this.stats.lessonsLeft = items.reduce((s, p) => s + (p.remainingLessons || 0), 0)
          })
          .catch(() => {})
      )
      await Promise.all(tasks).finally(() => { this.statsLoading = false })
    },

    // 2026-07-03: 顶部 stat 跳转
    goStudentProducts() {
      haptic.tap()
      // 2026-07-05: home.vue stat 卡按全局 activeStudent 走, 附带 ?kid= 让详情页定位该 kid 数据 (不切 activeStudent)
      // 用普通字符串拼接避免模板字面量嵌三元在一些 vite-plugin-uni 解析器下的兼容性坑
      const kid = this.activeStudentId || ''
      const url = kid ? '/pages/studentProduct/list?kid=' + kid : '/pages/studentProduct/list'
      uni.navigateTo({ url: url })
    },
    goPoints() {
      haptic.tap()
      const kid = this.activeStudentId || ''
      const url = kid ? '/pages/points/wallet?kid=' + kid : '/pages/points/wallet'
      uni.navigateTo({ url: url })
    },
    // 2026-07-04 顶部机构 chip 跳转 — 公开机构主页 R-0932 (跟被删的 stat 按钮是同入口)
    goOrgHome() {
      haptic.tap()
      const orgId = this.orgId
      if (!orgId) {
        uni.showToast({ title: '尚未选择机构', icon: 'none' })
        return
      }
      uni.navigateTo({ url: '/pages/org/home?id=' + orgId })
    },

    // 2026-07-03: 「我的课程」section 标题右侧"全部课程"按钮 — 跳独立全量列表 (含 4 状态 tab)
    goMyCoursesAll() {
      haptic.tap()
      uni.navigateTo({ url: '/pages/course/enrollment-list' })
    },

    // 取作品首图 (fileUrls[0]), 简单空守卫
    firstFile(w) {
      if (!w || !Array.isArray(w.fileUrls) || !w.fileUrls.length) return ''
      return w.fileUrls[0] || ''
    },

    // 跳作品详情
    goWorkDetail(id) {
      if (!id) return
      haptic.tap()
      uni.navigateTo({ url: '/pages/work/detail?id=' + id })
    },

    // 跳完整作品墙
    goWorksAll() {
      haptic.tap()
      uni.navigateTo({ url: '/pages/work/list' })
    },

    // 2026-07-04: 删 goGrowthRecord 方法 — 顶栏 CTA 已下线, 死代码

    async loadPet() {
      this.petLoading = true
      this.petBlockReason = ''
      try {
        const res = await petApi.me()
        // 2026-07-03 修: 后端 getMine 返回 {pet: ...}, request.js 解包后 r = {pet};
        // 之前 `res || null` 把 {pet: ...} 整个当成 pet, 导致 this.pet.state/species 拿到 undefined.
        // 现在显式取 r.pet (与 detail.vue 同步)
        this.pet = (res && (res.pet || res.data?.pet)) || null
        // 2026-07-04 修: 之前二次 fetch /pet/species?tier=xxx 用 tier 过滤,会把 species 锁定在另一阶
        //   (如 pet.tier=B 但 species='rabbit_white' 是 C 阶) 就匹配不到, 渲染退到 emoji 兜底
        //   → admin 显示真正的 SVG, client 显示 🐣 完全不一致
        // fix: 直接吃 /pet/me 已 populate 的 speciesRecord (pet.service.decoratePet 注入)
        this.petSpecies = (this.pet && this.pet.speciesRecord) || null
        // 兜底: 万一后端没 populate (旧版本兼容), 再去查一次全集不限 tier
        if (this.pet && this.pet.species && !this.petSpecies) {
          try {
            const list = await petApi.species({ isActive: true })
            const items = Array.isArray(list) ? list : list.items || list.data || []
            this.petSpecies = items.find((s) => s.key === this.pet.species) || null
          } catch (_) {
            this.petSpecies = null
          }
        }
        // 2026-07-03: 拉一次 catalog (itemMap) 给首页装备叠加层渲染用;
        // 与 detail.vue loadCatalog 一致, 只缓存用过的 visual 数据, 不全展开
        await this.loadEquipCatalog()
      } catch (e) {
        if (e && (e.code === 'notEnrolled' || e.statusCode === 422)) {
          this.petBlockReason = 'notEnrolled'
        }
        this.pet = null
        this.petSpecies = null
      } finally {
        this.petLoading = false
      }
    },

    // 2026-07-03: 首页装备 catalog — 只为已装备的 6 slot 各查一次, 不拉全量
    // 与 detail.vue loadCatalog 区别: 首页不需要 chip 列表, 只需要已装备的 url/svgContent
    async loadEquipCatalog() {
      if (!this.pet) {
        this.petEquipMap = {}
        return
      }
      const equipped = this.pet.equipped || {}
      const needed = PET_ITEM_SLOTS.map((s) => equipped[s]).filter(Boolean)
      if (needed.length === 0) {
        this.petEquipMap = {}
        return
      }
      try {
        const ir = await petApi.items({ pageSize: 100 })
        const bySlot = ir?.items || {}
        const map = {}
        for (const slotKey of Object.keys(bySlot)) {
          const group = bySlot[slotKey]
          const list = Array.isArray(group?.items) ? group.items : []
          for (const it of list) {
            if (needed.indexOf(it.key) < 0) continue
            map[it.key] = {
              name: it.name,
              slot: it.slot || slotKey,
              // 2026-07-14: 同步存 visualType + videoFile (跟 detail.vue equipmentLayers 字段对齐)
              visualType: it.visualType || 'image',
              svgContent: it.svgContent || '',
              imageFile: it.imageFile || null,
              videoFile: it.videoFile || null
            }
          }
        }
        this.petEquipMap = map
      } catch (e) {
        this.petEquipMap = {}
      }
    },

    selectDay(day) {
      haptic.tap()
      this.selectedDate = day.date
    },

    formatTime: (d) => (d ? new Date(d).toTimeString().slice(0, 5) : ''),
    isFuture: (d) => d && new Date(d) > new Date(),
    // 2026-07-11 v0.9: 通知面板用相对时间 ("X 分钟前" / "今天 HH:MM" / "M-D")
    formatNotifTime(d) {
      if (!d) return ''
      const t = new Date(d)
      const now = new Date()
      const ms = now - t
      const min = Math.floor(ms / 60000)
      const hr = Math.floor(min / 60)
      if (min < 1) return '刚刚'
      if (min < 60) return `${min} 分钟前`
      if (hr < 24) return `${hr} 小时前`
      const m = String(t.getMonth() + 1).padStart(2, '0')
      const dd = String(t.getDate()).padStart(2, '0')
      return `${m}-${dd}`
    },
    // 通知类型 → emoji
    iconOf(type) {
      return NOTIF_ICON[type] || '🔔'
    },

    // 简易 base64 编码 (用于 SVG data URI; 小程序无 btoa 时兜底)
    _b64encode(str) {
      if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)))
      // 简易 fallback: 用 encodeURIComponent 替代 (image 组件多数实现能识别 URL-encoded data URI)
      return encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1))
    },
    // 2026-07-04: SVG → base64 data URI, <image> 渲染更稳定 (v-html H5 偶尔丢 SVG)
    _svgDataUri(svg) {
      if (!svg) return ''
      try {
        if (typeof btoa === 'function') {
          return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
        }
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
      } catch (e) {
        return ''
      }
    },
    countdownText: (d) => date.countdownLabel(d),

    durationLabel(lesson) {
      if (!lesson.plannedStartTime || !lesson.plannedEndTime) return ''
      const min = Math.round(
        (new Date(lesson.plannedEndTime) - new Date(lesson.plannedStartTime)) / 60000
      )
      return min + ' 分钟'
    },

    statusClass(s) {
      const map = {
        scheduled: 'tag-info',
        preparing: 'tag-info',
        in_progress: 'tag-success',
        finished: 'tag-success',
        archived: 'tag-ghost',
        cancelled: 'tag-warn'
      }
      return map[s] || 'tag-info'
    },
    statusLabel(s) {
      const map = {
        scheduled: '待上课',
        preparing: '备课中',
        in_progress: '进行中',
        finished: '已结束',
        archived: '已归档',
        cancelled: '已取消'
      }
      return map[s] || s
    },

    onStudentChange() {
      this.load()
    },

    // R-0474 (2026-07-11): 学习画像 — 家长走 /students/me/profile (跳过 requirePermission)
    // 旧实现: R-0406 GET /students/:id/profile 需要 student.read, 家长 Position 移权限后 403
    async loadProfile() {
      if (!this.activeStudentId) {
        this.profile = null
        this.profileLoading = false
        return
      }
      this.profileLoading = true
      try {
        // 走 /me/profile, server 端 activeStudent 中间件从 x-active-student-id 取
        // 并校验 "req.user 是该 kid 监护人", 无需在前端传 id
        const res = await studentApi.myProfile()
        this.profile = res || null
      } catch (e) {
        // 404 = 学生没画像 (其他错误也兜底当 null)
        console.warn('[home.loadProfile]', e)
        this.profile = null
      } finally {
        this.profileLoading = false
      }
    },

    goProfile() {
      if (!this.activeStudentId) {
        uni.showToast({ title: '请先选择孩子', icon: 'none' })
        return
      }
      haptic.tap()
      uni.navigateTo({ url: '/pages/student/profile?id=' + this.activeStudentId })
    },

    goCalendar() {
      haptic.tap()
      const kid = this.activeStudentId || ''
      const url = kid ? '/pages/schedule/calendar?kid=' + kid : '/pages/schedule/calendar'
      uni.navigateTo({ url: url })
    },

    goLessonDetail(id) {
      uni.navigateTo({ url: `/pages/schedule/detail?id=${id}` })
    },

    goPage(url) {
      uni.navigateTo({ url })
    },

    onNotif() {
      // 2026-07-11 v0.9 (改): 不直接跳 tab, 弹通知预览面板 (类似微信)
      //   面板内每条有"查看"按钮做实际跳转 (markRead + uni.navigateTo deeplink)
      //   底部"查看全部"按钮才 switchTab 跳 messages
      this.toggleNotifPanel()
    },

    toggleNotifPanel() {
      this.notifPanelOpen = !this.notifPanelOpen
      if (this.notifPanelOpen && !this.notifPanelList.length) {
        this.loadNotifPanel()
      }
    },

    closeNotifPanel() {
      this.notifPanelOpen = false
    },

    async loadNotifPanel() {
      this.notifPanelLoading = true
      try {
        // R-4002 GET /notifications/me?status=unread&pageSize=5
        const res = await notificationApi.listMe({ status: 'unread', page: 1, pageSize: 5 })
        const data = res && res.data ? res.data : res
        this.notifPanelList = (data && data.items) || []
      } catch (e) {
        console.warn('[home.loadNotifPanel]', e)
        this.notifPanelList = []
      } finally {
        this.notifPanelLoading = false
      }
    },

    // "查看"按钮: 标已读 + 跳 deeplink (跟 InboxList.onTap 同款)
    async goNotif(n) {
      if (!n) return
      try {
        if (n.status === 'unread') {
          await notificationApi.markRead(n._id).catch(() => {})
          n.status = 'read'
          n.readAt = new Date()
          // 本地红点 -1
          this.notifUnread = Math.max(0, this.notifUnread - 1)
          // 同步服务端的真实未读数 (避免乐观更新漂移)
          this.loadUnreadCount()
        }
      } catch (_) {}
      this.closeNotifPanel()
      const dl = n.payload && n.payload.deeplink
      if (dl) {
        uni.navigateTo({ url: dl })
      }
    },

    // "查看全部"按钮: 跳 messages tab
    goMessages() {
      this.closeNotifPanel()
      uni.switchTab({ url: '/pages/tabbar/messages' })
    },

    async loadUnreadCount() {
      // 2026-07-11 v0.9: 顶部铃铛红点; 失败静默 (不影响首页其他功能)
      try {
        const res = await notificationApi.unreadCount()
        const data = res && res.data ? res.data : res
        this.notifUnread = (data && (data.count != null ? data.count : data.unread)) || 0
      } catch (e) {
        this.notifUnread = 0
      }
    },

    onLower() {
      // 预留给无限滚动
    },

    onConsentsDone() {
      const auth = useAuthStore()
      auth.clearPendingConsents()
      this.showConsents = false
      haptic.success()
    },

    // 宠物概略导航 (2026-07-02 加, 2026-07-03 改成新版 /pages/pet/detail 详情页)
    goPetDetail() {
      uni.navigateTo({ url: '/pages/pet/detail' })
    },
    goPetAdopt() {
      uni.navigateTo({ url: '/pages/pet/adopt' })
    }
  }
}
</script>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
  background: $bg-page;

  &__top {
    background: linear-gradient(180deg, #FFB088 0%, #FFE4D3 60%, $bg-page 100%);
    padding-bottom: $spacing-md;
    position: relative;
    overflow: hidden;
  }

  &__bg-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.4;
    animation: float 6s ease-in-out infinite;
    pointer-events: none;

    &--1 {
      width: 240rpx;
      height: 240rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: -60rpx;
      right: -40rpx;
    }
    &--2 {
      width: 180rpx;
      height: 180rpx;
      background: radial-gradient(circle, $accent-light 0%, transparent 70%);
      top: 80rpx;
      left: -60rpx;
      animation-delay: 1.5s;
    }
  }

  &__topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    // 2026-07-02 与 body 同步用 $spacing-lg 防止右侧贴边
    padding: $spacing-md $spacing-lg $spacing-sm;
    position: relative;
  }

  &__greeting {
    display: flex;
    align-items: baseline;
  }

  &__greet-text {
    font-size: $font-base;
    color: $text-secondary;
    margin-right: 8rpx;
  }

  &__greet-name {
    font-size: $font-xl;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  &__notif {
    width: 72rpx;
    height: 72rpx;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8rpx);
    position: relative;
  }

  &__notif-icon {
    font-size: 36rpx;
  }

  // 2026-07-11 v0.9: 红点徽标
  &__notif-dot {
    position: absolute;
    top: 4rpx;
    right: 4rpx;
    min-width: 32rpx;
    height: 32rpx;
    padding: 0 8rpx;
    background: #f56c6c;
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2rpx solid #fff;
    box-sizing: border-box;
  }

  &__notif-dot-text {
    color: #fff;
    font-size: 20rpx;
    line-height: 1;
    font-weight: 600;
  }

  &__top-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12rpx;
    padding: 0 $spacing-lg;
    position: relative;
  }

  // 2026-07-04: 跟学生 pill 同 row 的机构 chip (在 active-student-header 右侧)
  &__org-chip {
    display: flex;
    align-items: center;
    gap: 6rpx;
    padding: 8rpx 18rpx 8rpx 14rpx;
    background: rgba(255, 255, 255, 0.7);
    border-radius: $radius-pill;
    box-shadow: 0 4rpx 12rpx rgba(255, 138, 101, 0.10);
    backdrop-filter: blur(8rpx);
    flex: 0 1 auto;
    max-width: 56%;
    min-width: 0;
    &:active {
      background: rgba(255, 255, 255, 0.88);
    }
  }
  &__org-chip-icon {
    font-size: 24rpx;
    flex-shrink: 0;
    line-height: 1;
  }
  &__org-chip-name {
    font-size: $font-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  &__body {
    // 2026-07-02: scroll-view 的 padding 在 H5 下不传给子节点,
    // 真实缩进交给内层 wrapper (home__body-inner), scroll-view 自身只管滚动
    height: calc(100vh - 280rpx);
  }

  &__body-inner {
    padding: 0 $spacing-lg;
  }

  // 2026-07-03: 顶部孩子 stat 卡 (剩余课时/积分/我的课程) — 跟 me.vue stat 区分, 这里 3 列
  // 2026-07-04: 删「机构」stat 后改 2 列
  &__quickstats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-sm;
    padding: $spacing-md;
    margin-top: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__quickstats--2col {
    grid-template-columns: 1fr 1fr;
  }
  &__quickstats--2col .home__quickstat-val {
    font-size: 56rpx; // 比 $font-xl(40rpx) 更大, 撑满 2 列, 跟 hero 数字呼应
  }
  &__quickstat {
    text-align: center;
    padding: $spacing-sm $spacing-xs;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:active {
      background: rgba(255, 138, 101, 0.08);
      transform: scale(0.98);
    }
  }
  &__quickstat-val {
    display: block;
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1.2;
    margin-bottom: 4rpx;
  }
  &__quickstat-lbl {
    display: block;
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__section {
    padding: $spacing-md 0;
  }

  &__loading {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__lesson-skeleton {
    height: 144rpx;
    background: linear-gradient(90deg, $divider-light 0%, #f8f4ee 50%, $divider-light 100%);
    background-size: 200% 100%;
    border-radius: $radius-md;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  &__lessons {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__lesson {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    transition: all $transition-fast;

    &:active {
      transform: scale(0.98);
    }
  }

  &__lesson-time {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 120rpx;
  }

  &__lesson-time-h {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1.2;
  }

  &__lesson-time-dur {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 4rpx;
  }

  &__lesson-divider {
    width: 1rpx;
    height: 56rpx;
    background: $divider;
    margin: 0 $spacing-md;
  }

  &__lesson-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  &__lesson-title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 8rpx;
  }

  &__lesson-meta {
    display: flex;
    gap: $spacing-sm;
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: 8rpx;
  }

  &__lesson-countdown {
    font-size: $font-xs;
    color: $primary;
  }

  &__lesson-status {
    align-self: flex-start;
  }

  &__lesson-arrow {
    font-size: 40rpx;
    color: $text-tertiary;
    margin-left: $spacing-sm;
  }

  // 周历
  &__week {
    margin: 0 (-$spacing-md);
    padding: 0 $spacing-md;
  }

  &__week-inner {
    display: inline-flex;
    gap: $spacing-xs;
    padding: $spacing-xs 0;
  }

  &__week-day {
    flex-shrink: 0;
    width: 96rpx;
    height: 120rpx;
    background: $bg-card;
    border-radius: $radius-md;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: $shadow-card;
    transition: all $transition-fast;

    &--today {
      background: $primary-lighter;
    }

    &--selected {
      background: linear-gradient(135deg, $primary, $primary-light);
      box-shadow: $shadow-button;
      transform: translateY(-4rpx);
    }
  }

  &__week-day-name {
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: 4rpx;

    .home__week-day--selected & {
      color: rgba(255, 255, 255, 0.9);
    }
  }

  &__week-day-date {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;

    .home__week-day--selected & {
      color: #fff;
    }
  }

  &__week-day-dot {
    position: absolute;
    bottom: 12rpx;
    width: 8rpx;
    height: 8rpx;
    border-radius: 50%;
    background: $primary;

    .home__week-day--selected & {
      background: #fff;
    }
  }

  &__day-list {
    margin-top: $spacing-md;
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__day-item {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    background: $bg-card;
    border-radius: $radius-sm;
    box-shadow: $shadow-card;
  }

  &__day-time {
    min-width: 100rpx;
    font-size: $font-sm;
    color: $primary;
    font-weight: $font-weight-semibold;
  }

  &__day-info {
    flex: 1;
    margin-left: $spacing-sm;
  }

  // 2026-07-10: 课程名 + 「第 N 节」 同行的容器, 让 chip 浮在右侧
  &__day-title-row {
    display: flex;
    align-items: baseline;
    gap: $spacing-xs;
    min-width: 0;
  }

  &__day-title {
    font-size: $font-base;
    color: $text-primary;
    display: block;
    flex: 1;
    min-width: 0;
    @include multi-ellipsis(1);
  }

  &__day-lesson-no {
    flex-shrink: 0;
    font-size: $font-xs;
    color: $primary;
    background: $primary-lighter;
    padding: 2rpx 12rpx;
    border-radius: $radius-pill;
    line-height: 1.4;
    font-weight: $font-weight-medium;
  }

  &__day-meta {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__day-empty {
    margin-top: $spacing-md;
    text-align: center;
    padding: $spacing-md;
  }

  // 2026-07-11: 空状态主行 (一节课都没有的日子)
  //   注意: 这是 <view> 容器, 内部包多个 <text>, 不要改 display: inline
  &__day-empty-main {
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
    line-height: 1.6;

    text {
      color: inherit;
      font-size: inherit;
    }
  }
  // 2026-07-11: 30 天内彻底没排课时显示的小灰字
  &__day-empty-sub {
    display: block;
    margin-top: 6rpx;
    color: $text-tertiary;
    font-size: $font-xs;
  }

  // 作品墙 (2026-07-03: 替换原快捷入口)
  &__works-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: $spacing-sm;
    margin-bottom: $spacing-md;
  }
  &__works-tile {
    position: relative;
    aspect-ratio: 1 / 1;
    background: $bg-card;
    border-radius: $radius-md;
    overflow: hidden;
    box-shadow: $shadow-card;
  }
  &__works-img {
    width: 100%;
    height: 100%;
    display: block;
  }
  &__works-img-fallback {
    width: 100%;
    height: 100%;
    @include flex-center;
    font-size: 64rpx;
    background: $bg-page;
  }
  &__works-title {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: $spacing-xs $spacing-sm;
    background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.5));
    color: #fff;
    font-size: $font-xs;
    line-height: 1.4;
  }
  &__works-more {
    text-align: center;
    padding: $spacing-sm 0;
    font-size: $font-sm;
    color: $primary;
  }
  &__works-empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-xl $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__works-empty-emoji { font-size: 64rpx; margin-bottom: $spacing-sm; }
  &__works-empty-title {
    font-size: $font-base;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__works-empty-desc {
    font-size: $font-sm;
    color: $text-tertiary;
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }

  // 宠物概略 (2026-07-02 加)
  &__pet-loading {
    padding: $spacing-xl;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }

  &__pet-empty {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__pet-empty-emoji {
    font-size: 64rpx;
    margin-right: $spacing-md;
  }
  &__pet-empty-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  &__pet-empty-title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__pet-empty-desc {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__pet-card {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary-lighter, #FFE4D3);
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }

  // 我的课程 (2026-07-03 简化: 单列表, 无 tab)
  // 学习画像 (2026-07-04: 从 me.vue 搬来; mini 预览卡)
  &__profile {
    background: linear-gradient(135deg, $primary-lighter, #FFE4D3);
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    min-height: 120rpx;
    display: flex;
    align-items: center;
  }
  &__profile-loading {
    flex: 1;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__profile-empty {
    display: flex;
    align-items: center;
    width: 100%;
  }
  &__profile-empty-emoji {
    font-size: 56rpx;
    margin-right: $spacing-md;
    flex-shrink: 0;
  }
  &__profile-empty-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  &__profile-empty-title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__profile-empty-desc {
    font-size: $font-xs;
    color: $text-secondary;
  }
  &__profile-hl {
    display: block;
    font-size: $font-sm;
    font-weight: $font-weight-semibold;
    color: $primary-dark;
    margin-bottom: 6rpx;
  }
  &__profile-text {
    display: block;
    font-size: $font-base;
    color: $text-primary;
    line-height: 1.5;
    @include multi-ellipsis(2);
  }

  &__mine-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__mine-card {
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }

  &__mine-card-name {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__mine-card-meta {
    display: flex;
    gap: $spacing-sm;
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: $spacing-sm;
  }

  &__mine-card-progress {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__mine-card-bar {
    flex: 1;
    height: 12rpx;
    background: rgba(0, 0, 0, 0.05);
    border-radius: $radius-pill;
    overflow: hidden;
  }

  &__mine-card-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, $primary, $primary-light);
    border-radius: $radius-pill;
    transition: width $transition-base;
  }

  &__mine-card-progress text {
    font-size: $font-xs;
    color: $text-tertiary;
    flex-shrink: 0;
  }

  &__mine-empty {
    padding: $spacing-xl $spacing-md;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  &__pet-portrait {
    width: 200rpx;
    height: 200rpx;
    background: $bg-card;
    border-radius: 24rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: $spacing-md;
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
  }
  &__pet-portrait-emoji {
    font-size: 120rpx;
  }
  &__pet-portrait-svg {
    position: relative;
    z-index: 1;
  }
  // 2026-07-14: video / image 物种 — 跟 svg 同尺寸规则, object-fit: contain 保留比例
  &__pet-portrait-video,
  &__pet-portrait-img {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  // 2026-07-04 重做: svg-wrap 容器 + :deep(svg) (跟 admin PetEquipmentOverlay .svg-wrap 同款)
  &__svg-wrap { width: 100%; height: 100%; display: block; }
  &__svg-wrap :deep(svg) { width: 100%; height: 100%; display: block; object-fit: contain; }
  // 2026-07-14: 装备叠加层 video / image (跟 svg 同尺寸规则)
  &__pet-equip-video,
  &__pet-equip-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  // 2026-07-04: 装备背景层 (跟 admin PetClassroomDisplay.pet-display-bg 同款:
  // 绝对定位铺满 portrait, 显示蓝天草地这类背景, 不挡交互)
  &__pet-bg {
    position: absolute;
    inset: 0;
    display: block;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  // 2026-07-04: 装备叠加层容器 (跟 admin PetEquipmentOverlay 同款坐标)
  &__pet-equips {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }
  &__pet-equip-layer {
    position: absolute;
    @include flex-center;
    pointer-events: none;
  }
  &__pet-equip-layer--hat       { top: -2%;  left: 50%; transform: translateX(-50%); width: 50%; height: 32%; z-index: 3; }
  &__pet-equip-layer--scarf     { top: 38%;  left: 50%; transform: translateX(-50%); width: 55%; height: 16%; z-index: 4; }
  &__pet-equip-layer--clothes   { top: 50%;  left: 50%; transform: translateX(-50%); width: 70%; height: 36%; z-index: 2; }
  &__pet-equip-layer--accessory { top: 36%;  left: 50%; transform: translateX(-50%); width: 45%; height: 18%; z-index: 4; }
  &__pet-equip-layer--halo      { top: -4%;  left: 50%; transform: translateX(-50%); width: 75%; height: 30%; opacity: 0.85; z-index: 2; }
  &__pet-tier-badge {
    position: absolute;
    bottom: -8rpx;
    right: -8rpx;
    width: 36rpx;
    height: 36rpx;
    border-radius: 50%;
    @include flex-center;
    color: #fff;
    font-size: $font-xs;
    font-weight: $font-weight-bold;
    box-shadow: $shadow-card;
    z-index: 3;
  }
  &__pet-tier-badge > text { color: inherit; }

  &__pet-info {
    flex: 1;
    min-width: 0;
  }
  &__pet-name-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-xs;
  }
  &__pet-name {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    @include multi-ellipsis(1);
    flex: 1;
    margin-right: $spacing-xs;
  }
  &__pet-state {
    font-size: $font-xs;
    color: $text-secondary;
    flex-shrink: 0;
  }
  &__pet-tier-tag {
    font-size: $font-xs;
    font-weight: $font-weight-semibold;
    margin-bottom: $spacing-xs;
    display: block;
  }
  &__pet-cta {
    font-size: $font-sm;
    color: $primary-dark;
    font-weight: $font-weight-medium;
  }

  &__pet-stat {
    display: flex;
    align-items: center;
    margin-bottom: 6rpx;
  }
  &__pet-stat-label {
    width: 80rpx;
    font-size: $font-xs;
    color: $text-secondary;
    flex-shrink: 0;
  }
  &__pet-stat-bar {
    flex: 1;
    height: 12rpx;
    background: rgba(255, 255, 255, 0.6);
    border-radius: $radius-pill;
    overflow: hidden;
    margin: 0 $spacing-xs;
  }
  &__pet-stat-fill {
    height: 100%;
    border-radius: $radius-pill;
    transition: width 0.3s ease;

    &--hunger {
      background: linear-gradient(90deg, #FFA07A, #FF8A65);
    }
    &--exp {
      background: linear-gradient(90deg, #7CD9B7, #5B9EE6);
    }
  }
  &__pet-stat-val {
    width: 100rpx;
    font-size: $font-xs;
    color: $text-secondary;
    text-align: right;
    flex-shrink: 0;
  }
}

// 2026-07-11 v0.9: 通知预览面板 (点铃铛展开)
// 类似微信的"未读消息预览"样式: 半透明 mask + 顶部卡片浮层
.notif-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  // 顶部安全区 + 让 panel 落在顶部 header 下方
  padding-top: 220rpx;
}

.notif-panel {
  background: $bg-card;
  border-radius: 0 0 $radius-md $radius-md;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.12);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0 $spacing-md;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-md $spacing-lg;
    border-bottom: 1rpx solid $divider-light;
  }
  &__title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }
  &__count {
    font-size: $font-sm;
    color: $primary;
  }

  &__loading, &__empty {
    padding: $spacing-xl $spacing-md;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__empty-emoji {
    display: block;
    font-size: 80rpx;
    margin-bottom: $spacing-sm;
  }
  &__empty-text {
    display: block;
  }

  &__items {
    flex: 1;
    overflow-y: auto;
    padding: $spacing-xs 0;
  }
  &__item {
    display: flex;
    align-items: flex-start;
    padding: $spacing-md $spacing-lg;
    border-bottom: 1rpx solid $divider-light;
    &:last-child {
      border-bottom: none;
    }
  }
  &__item-icon {
    width: 72rpx; height: 72rpx;
    border-radius: 50%;
    background: $primary-lighter;
    @include flex-center;
    font-size: 36rpx;
    flex-shrink: 0;
    margin-right: $spacing-sm;
  }
  &__item-body {
    flex: 1;
    min-width: 0;
    margin-right: $spacing-sm;
  }
  &__item-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
    margin-bottom: 4rpx;
    @include multi-ellipsis(1);
  }
  &__item-summary {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: 4rpx;
    @include multi-ellipsis(2);
  }
  &__item-time {
    display: block;
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__item-go {
    flex-shrink: 0;
    align-self: center;
    padding: 8rpx 20rpx;
    border-radius: $radius-pill;
    border: 1rpx solid $primary;
    color: $primary;
    font-size: $font-xs;
    &:active {
      background: $primary-lighter;
    }
  }

  &__footer {
    border-top: 1rpx solid $divider-light;
    padding: $spacing-sm $spacing-md;
    background: $bg-page;
  }
  &__footer-btn {
    text-align: center;
    padding: $spacing-sm 0;
    color: $primary;
    font-size: $font-sm;
    &:active {
      opacity: 0.7;
    }
  }
}
</style>