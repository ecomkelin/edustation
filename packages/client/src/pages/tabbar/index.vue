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
        </view>
      </view>

      <view class="home__top-content">
        <active-student-header @change="onStudentChange" />
      </view>
    </view>

    <!-- 主体内容 -->
    <scroll-view scroll-y class="home__body" @scrolltolower="onLower">
      <!-- 2026-07-02 fix: scroll-view 内 padding 在 H5 下不传给子节点,
           包一层 wrapper view 承载 padding 让 section 真正缩进 -->
      <view class="home__body-inner">
      <!-- 宠物概略 (2026-07-02 加回首页) -->
      <view class="home__section">
        <view class="section-title">
          <text>🐾 我的宠物</text>
          <text v-if="pet" class="section-title__more" @tap="goPetDetail">去照顾 ›</text>
        </view>

        <!-- 加载中 -->
        <view v-if="petLoading && !pet && !petBlockReason" class="home__pet-loading">
          <text>召唤中…</text>
        </view>

        <!-- 未报名: 引导去孩子 tab (2026-07-03: org 改名为 child) -->
        <view v-else-if="petBlockReason === 'notEnrolled'" class="home__pet-empty press" @tap="goPage('/pages/tabbar/child')">
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
            <!-- 2026-07-02: species.visualType='svg' 时直接渲染 svgContent (跟 admin PetClassroomDisplay 对齐),
                 否则走 emoji fallback -->
            <image
              v-if="petSvgSrc"
              class="home__pet-portrait-svg"
              :src="petSvgSrc"
              mode="aspectFit"
            />
            <text v-else class="home__pet-portrait-emoji">{{ petEmoji }}</text>
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
              <text class="home__day-title">{{ lesson.courseInstance?.name || lesson.subject?.name || '课程' }}</text>
              <text class="home__day-meta">{{ lesson.teacher?.realName || '老师' }}</text>
            </view>
          </view>
        </view>
        <view v-else class="home__day-empty">
          <text>{{ selectedDay?.isToday ? '今天没有课哦' : (selectedDay?.name || '该日') + '没有课' }}</text>
        </view>
      </view>

      <!-- 我的课程&课包 (2026-07-02: 替换原"今日课程" section, 用户要求"看自己报了哪些课、买了哪些课包"; 同日按用户反馈挪到本周课表下面) -->
      <view class="home__section">
        <view class="section-title">
          <text>📦 我的课程&课包</text>
        </view>

        <!-- tab 切换 -->
        <view class="home__mine-tabs">
          <view
            :class="['home__mine-tab', { active: mineTab === 'course' }]"
            @tap="setMineTab('course')"
          >
            <text>我报名的课程 ({{ enrollments.length }})</text>
          </view>
          <view
            :class="['home__mine-tab', { active: mineTab === 'package' }]"
            @tap="setMineTab('package')"
          >
            <text>我的课包 ({{ studentProducts.length }})</text>
          </view>
        </view>

        <!-- 课程列表 -->
        <view v-if="mineTab === 'course'" class="home__mine-list">
          <view v-if="enrollmentsLoading" class="home__loading">
            <text>召唤中…</text>
          </view>
          <view v-else-if="!enrollments.length" class="home__mine-empty">
            <text>还没有报名任何课程 ›</text>
          </view>
          <view
            v-for="e in enrollments"
            v-else
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
                  :style="{ width: mineProgress(e.attendedLessons, e.totalLessons) }"
                />
              </view>
              <text>已上 {{ e.attendedLessons || 0 }}/{{ e.totalLessons || 0 }} 节</text>
            </view>
          </view>
        </view>

        <!-- 课包列表 -->
        <view v-else class="home__mine-list">
          <view v-if="packagesLoading" class="home__loading">
            <text>召唤中…</text>
          </view>
          <view v-else-if="!studentProducts.length" class="home__mine-empty">
            <text>还没有购买任何课包 ›</text>
          </view>
          <view
            v-for="p in studentProducts"
            v-else
            :key="p._id"
            class="home__mine-card press"
          >
            <text class="home__mine-card-name">{{ p.coursePackageName || p.coursePackage?.name || '课包' }}</text>
            <view class="home__mine-card-meta">
              <text>🎒 {{ p.totalLessons || 0 }} 课时</text>
              <text>· 来源 {{ sourceLabel(p.source) }}</text>
            </view>
            <view class="home__mine-card-progress">
              <view class="home__mine-card-bar">
                <view
                  class="home__mine-card-bar-fill"
                  :style="{ width: mineProgress(p.remainingLessons, p.totalLessons) }"
                />
              </view>
              <text>剩余 {{ p.remainingLessons || 0 }}/{{ p.totalLessons || 0 }} 课时</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 作品墙 (2026-07-03: 替换原快捷入口; 显示最近 4 个作品 + 右上"个人成长记录"入口) -->
      <view class="home__section">
        <view class="section-title">
          <text>🎨 作品墙</text>
          <!-- 个人成长记录: 后台未开发, 点 toast 敬请期待 -->
          <text class="section-title__more" @tap="goGrowthRecord">个人成长记录 ›</text>
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
import { pointsApi } from '@/api/points'
import { petApi } from '@/api/pet'
import { studentProductApi } from '@/api/studentProduct'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { studentWorkApi } from '@/api/studentWork'
import { date } from '@/utils/date'
import { greetingByHour, PET_SPECIES_EMOJI } from '@/utils/constants'
import { haptic } from '@/utils/haptic'

const TIER_EMOJI = { C: '🥚', B: '🐣', A: '🦊', S: '🐉' }
const TIER_COLOR = { C: '#9CA3AF', B: '#7CD9B7', A: '#5B9EE6', S: '#F5C148' }

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
      // 我的课程&课包 (2026-07-02 替换原"今日课程" section)
      mineTab: 'course',
      enrollments: [],
      enrollmentsLoading: false,
      studentProducts: [],
      packagesLoading: false,
      // 2026-07-03 作品墙: 最近 4 个作品缩略图 (R-1670 me)
      works: [],
      worksLoading: false
    }
  },
  computed: {
    ...mapState(useAuthStore, ['user', 'pendingConsents']),
    ...mapGetters(useAuthStore, ['hasPendingConsents']),
    ...mapState(useStudentStore, ['activeStudentId']),

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
      // 已破壳用 speciesRecord (admin 维护的 svg 优先), 否则按 species key 查 emoji
      if (this.pet.state !== 'egg' && this.petSpecies && this.petSpecies.visualType !== 'svg' && this.petSpecies.icon) {
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
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const now = new Date()
        const start = date.startOfWeek()
        const end = date.addDays(start, 14) // 取两周更稳
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
      // 我的课程&课包 (并行)
      this.loadMine()
      // 作品墙 (并行, 2026-07-03)
      this.loadWorks()
    },

    // 2026-07-02: 加载"我报名的课程" + "我的课包",并行两个端点 (R-1214 + R-2079)
    async loadMine() {
      this.loadEnrollments()
      this.loadPackages()
    },

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

    async loadPackages() {
      this.packagesLoading = true
      try {
        const res = await studentProductApi.me({})
        let list = []
        if (Array.isArray(res)) list = res
        else if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        this.studentProducts = list
      } catch (e) {
        console.warn('[child.loadPackages]', e)
        this.studentProducts = []
      } finally {
        this.packagesLoading = false
      }
    },

    // tab 切换 (haptic 反馈 + 滚动置顶)
    setMineTab(tab) {
      if (this.mineTab === tab) return
      haptic.tap()
      this.mineTab = tab
    },

    // 进度条百分比 (避免除零)
    mineProgress(value, total) {
      const v = Number(value) || 0
      const t = Number(total) || 0
      if (t <= 0) return '0%'
      return Math.min(100, Math.round((v / t) * 100)) + '%'
    },

    // 课包来源文案
    sourceLabel(s) {
      const map = {
        purchase: '购买',
        gift: '赠课',
        reward: '奖励',
        manual: '手动开通'
      }
      return map[s] || s || '其他'
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

    // 2026-07-03: 个人成长记录入口 — 后台未开发, toast 敬请期待
    goGrowthRecord() {
      haptic.tap()
      uni.showToast({ title: '个人成长记录 · 敬请期待', icon: 'none' })
    },

    async loadPet() {
      this.petLoading = true
      this.petBlockReason = ''
      try {
        const res = await petApi.me()
        this.pet = res || null
        if (this.pet && this.pet.species) {
          try {
            const list = await petApi.species({ tier: this.pet.tier, isActive: true })
            const items = Array.isArray(list) ? list : list.items || list.data || []
            this.petSpecies = items.find((s) => s.key === this.pet.species) || null
          } catch (_) {
            this.petSpecies = null
          }
        } else {
          this.petSpecies = null
        }
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

    selectDay(day) {
      haptic.tap()
      this.selectedDate = day.date
    },

    formatTime: (d) => (d ? new Date(d).toTimeString().slice(0, 5) : ''),
    isFuture: (d) => d && new Date(d) > new Date(),

    // 简易 base64 编码 (用于 SVG data URI; 小程序无 btoa 时兜底)
    _b64encode(str) {
      if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)))
      // 简易 fallback: 用 encodeURIComponent 替代 (image 组件多数实现能识别 URL-encoded data URI)
      return encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1))
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

    goCalendar() {
      uni.navigateTo({ url: '/pages/schedule/calendar' })
    },

    goLessonDetail(id) {
      uni.navigateTo({ url: `/pages/schedule/detail?id=${id}` })
    },

    goPage(url) {
      uni.navigateTo({ url })
    },

    onNotif() {
      uni.showToast({ title: '通知中心 (待开发)', icon: 'none' })
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

    // 宠物概略导航 (2026-07-02 加, 2026-07-02 同日精简: 只展示, 点击进详情页)
    goPetDetail() {
      uni.navigateTo({ url: '/pages/pet/feed' })
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
  }

  &__notif-icon {
    font-size: 36rpx;
  }

  &__top-content {
    padding: 0 $spacing-lg;
    position: relative;
  }

  &__body {
    // 2026-07-02: scroll-view 的 padding 在 H5 下不传给子节点,
    // 真实缩进交给内层 wrapper (home__body-inner), scroll-view 自身只管滚动
    height: calc(100vh - 280rpx);
  }

  &__body-inner {
    padding: 0 $spacing-lg;
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

  &__day-title {
    font-size: $font-base;
    color: $text-primary;
    display: block;
  }

  &__day-meta {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__day-empty {
    margin-top: $spacing-md;
    text-align: center;
    padding: $spacing-md;
    color: $text-tertiary;
    font-size: $font-sm;
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

  // 我的课程&课包 (2026-07-02: 替换原"今日课程" section)
  &__mine-tabs {
    display: flex;
    background: $bg-card;
    border-radius: $radius-md;
    padding: 4rpx;
    margin-bottom: $spacing-md;
    box-shadow: $shadow-card;
  }

  &__mine-tab {
    flex: 1;
    text-align: center;
    padding: 12rpx 0;
    font-size: $font-sm;
    color: $text-secondary;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &.active {
      background: linear-gradient(135deg, $primary, $primary-light);
      color: #fff;
      font-weight: $font-weight-medium;
      box-shadow: 0 2rpx 8rpx rgba(255, 138, 101, 0.3);
    }
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
    width: 120rpx;
    height: 120rpx;
    background: $bg-card;
    border-radius: 24rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: $spacing-md;
    position: relative;
    flex-shrink: 0;
  }
  &__pet-portrait-emoji {
    font-size: 72rpx;
  }
  &__pet-portrait-svg {
    width: 100rpx;
    height: 100rpx;
  }
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
</style>