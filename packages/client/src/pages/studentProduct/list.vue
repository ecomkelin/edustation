<!--
  我的课包 - C 端家长视角
  数据源: R-2079 GET /student-products/me (强制 activeStudent)
  字段 (service.list 已 populate):
    courseProduct.{name, totalLessons, validDays}
    order.{_id, status, paidAmount} (仅 source=order)
    giftedBy.{realName, mobile}     (仅 source=gift)
    giftReason / totalLessons / remainingLessons / expireDate / isActive / source / createdAt

  2026-07-10: 客户点课包 → 弹出「消费明细」面板 (R-2080)
    复用 admin StudentProducts.vue 弹窗结构: 顶部 summary + 5 KPI + 明细表
    服务端返回 summary = { total, completed, checkedIn, scheduled, noShow, leave, makeup }
-->
<template>
  <view class="sp">
    <!-- 汇总头 -->
    <view class="sp__hero">
      <view class="sp__hero-bg" />
      <view class="sp__hero-inner">
        <text class="sp__hero-label">{{ activeStudentName }}的课包</text>
        <view class="sp__hero-row">
          <view class="sp__hero-num">
            <text class="sp__hero-num-val">{{ summary.totalRemaining }}</text>
            <text class="sp__hero-num-unit">节</text>
          </view>
          <view class="sp__hero-stat">
            <text class="sp__hero-stat-val">{{ summary.activeCount }}</text>
            <text class="sp__hero-stat-lbl">可用课包</text>
          </view>
          <view class="sp__hero-stat">
            <text class="sp__hero-stat-val">{{ summary.expiringSoon }}</text>
            <text class="sp__hero-stat-lbl">7天内到期</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 列表 -->
    <scroll-view
      scroll-y
      class="sp__scroll"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onPullDown"
    >
      <view class="sp__list-inner">
        <!-- 加载中 -->
        <view v-if="loading && !items.length" class="sp__skeleton">
          <view v-for="i in 3" :key="i" class="sp__skeleton-card" />
        </view>

        <!-- 空状态 -->
        <view v-else-if="!loading && !items.length" class="sp__empty press" @tap="goCourses">
          <text class="sp__empty-emoji">🎒</text>
          <text class="sp__empty-title">还没有课包</text>
          <text class="sp__empty-desc">去发现适合孩子的课程 ›</text>
        </view>

        <!-- 卡片列表 -->
        <view v-else class="sp__list">
          <view
            v-for="sp in items"
            :key="sp._id"
            class="sp__card press"
            :class="{ 'sp__card--inactive': !sp.isActive }"
            @tap="openUsage(sp)"
          >
            <!-- 卡片头: 课程产品名 + 来源标签 -->
            <view class="sp__card-head">
              <text class="sp__card-name">{{ sp.courseProduct?.name || '课程' }}</text>
              <text class="sp__card-source" :class="`sp__card-source--${sp.source}`">
                {{ sourceLabel(sp) }}
              </text>
            </view>

            <!-- 进度条 -->
            <view class="sp__progress">
              <view class="sp__progress-bar">
                <view class="sp__progress-bar-fill" :style="{ width: percent(sp) + '%' }" />
              </view>
              <text class="sp__progress-text">
                剩余 <text class="sp__progress-text-em">{{ sp.remainingLessons }}</text>
                / {{ sp.totalLessons }} 节
              </text>
            </view>

            <!-- 元数据 -->
            <view class="sp__meta">
              <view class="sp__meta-item">
                <text class="sp__meta-icon">📅</text>
                <text class="sp__meta-text">到期 {{ formatDate(sp.expireDate) }}</text>
              </view>
              <view v-if="sp.courseProduct?.validDays" class="sp__meta-item">
                <text class="sp__meta-icon">⏳</text>
                <text class="sp__meta-text">自购入起 {{ sp.courseProduct.validDays }} 天</text>
              </view>
              <view v-if="sp.source === 'gift' && sp.giftedBy?.realName" class="sp__meta-item">
                <text class="sp__meta-icon">🎁</text>
                <text class="sp__meta-text">由 {{ sp.giftedBy.realName }} 赠送</text>
              </view>
              <view v-if="sp.source === 'gift' && sp.giftReason" class="sp__meta-item sp__meta-item--reason">
                <text class="sp__meta-icon">💡</text>
                <text class="sp__meta-text">原因: {{ sp.giftReason }}</text>
              </view>
              <view v-if="sp.source === 'order' && sp.order" class="sp__meta-item">
                <text class="sp__meta-icon">🧾</text>
                <text class="sp__meta-text">来源订单 {{ shortOrderId(sp.order) }}</text>
              </view>
            </view>

            <!-- 标签栏 -->
            <view class="sp__tags">
              <text v-if="isExpired(sp)" class="sp__tag sp__tag--warn">已过期</text>
              <text v-else-if="expiringDays(sp) <= 7" class="sp__tag sp__tag--warn">
                {{ expiringDays(sp) }}天后到期
              </text>
              <text v-if="sp.isActive === false" class="sp__tag sp__tag--ghost">已停用</text>
              <text v-if="sp.remainingLessons === 0" class="sp__tag sp__tag--ghost">已用完</text>
              <text v-else-if="percent(sp) <= 20" class="sp__tag sp__tag--info">余量紧张</text>
              <!-- 2026-07-10: 提示客户此卡可点开明细, 替换原本的 "购买" -->
              <text class="sp__tag sp__tag--hint">查看消费明细 ›</text>
            </view>
          </view>
        </view>

        <view class="sp__bottom-spacer" />
      </view>
    </scroll-view>

    <!--
      2026-07-10: 「课包消费明细」弹层 (R-2080)
      结构仿 admin StudentProducts.vue usageDialog:
        顶部 summary (来源 / 剩余/总课时 / 到期日 / 消费记录数)
        5 KPI (已消课 / 已签到 / 待上课 / 未到 / 请假)
        明细表 (计划上课时间 / 开班·第几课 / 状态 / 签到 / 下课 / 课评)
      uni-app 标准做法: 全屏 fixed sheet + 遮罩, 适配小程序/H5
    -->
    <view v-if="usageOpen" class="sp-sheet" @tap.self="closeUsage" @touchmove.stop.prevent="noop">
      <view class="sp-sheet__mask" />
      <view class="sp-sheet__panel">
        <view class="sp-sheet__header">
          <view class="sp-sheet__title-wrap">
            <text class="sp-sheet__title">课包消费明细</text>
            <text v-if="usageTarget" class="sp-sheet__subtitle">
              {{ usageTarget.courseProductName }}
            </text>
          </view>
          <view class="sp-sheet__close press" @tap="closeUsage">
            <text>×</text>
          </view>
        </view>

        <scroll-view
          scroll-y
          class="sp-sheet__scroll"
        >
          <view class="sp-sheet__body">
            <!-- 课包概要 -->
            <view v-if="usageTarget" class="sp-sheet__summary">
              <view class="sp-sheet__summary-item">
                <text class="sp-sheet__summary-label">来源</text>
                <text class="sp-sheet__summary-val">
                  <text v-if="usageTarget.source === 'gift'" class="sp-sheet__tag sp-sheet__tag--gift">赠课</text>
                  <text v-else class="sp-sheet__tag sp-sheet__tag--order">订单</text>
                </text>
              </view>
              <view class="sp-sheet__summary-item">
                <text class="sp-sheet__summary-label">剩余/总课时</text>
                <text class="sp-sheet__summary-val sp-sheet__summary-val--strong">
                  {{ usageTarget.remainingLessons }} / {{ usageTarget.totalLessons }}
                </text>
              </view>
              <view class="sp-sheet__summary-item">
                <text class="sp-sheet__summary-label">到期日</text>
                <text class="sp-sheet__summary-val" :class="expiryClassOfTarget">
                  {{ formatDate(usageTarget.expireDate) || '—' }}
                </text>
              </view>
              <view class="sp-sheet__summary-item">
                <text class="sp-sheet__summary-label">消费记录数</text>
                <text class="sp-sheet__summary-val sp-sheet__summary-val--strong">
                  {{ usageData.summary?.total ?? '—' }}
                </text>
              </view>
            </view>

            <!-- 状态 KPI -->
            <view v-if="usageData.summary" class="sp-sheet__kpi">
              <view class="sp-sheet__kpi-cell">
                <text class="sp-sheet__kpi-num">{{ usageData.summary.completed }}</text>
                <text class="sp-sheet__kpi-lbl">已消课</text>
              </view>
              <view class="sp-sheet__kpi-cell">
                <text class="sp-sheet__kpi-num">{{ usageData.summary.checkedIn }}</text>
                <text class="sp-sheet__kpi-lbl">已签到</text>
              </view>
              <view class="sp-sheet__kpi-cell">
                <text class="sp-sheet__kpi-num">{{ usageData.summary.scheduled }}</text>
                <text class="sp-sheet__kpi-lbl">待上课</text>
              </view>
              <view class="sp-sheet__kpi-cell">
                <text class="sp-sheet__kpi-num sp-sheet__kpi-num--warn">{{ usageData.summary.noShow }}</text>
                <text class="sp-sheet__kpi-lbl">未到</text>
              </view>
              <view class="sp-sheet__kpi-cell">
                <text class="sp-sheet__kpi-num sp-sheet__kpi-num--gold">{{ usageData.summary.leave }}</text>
                <text class="sp-sheet__kpi-lbl">请假</text>
              </view>
            </view>

            <!-- 加载占位 -->
            <view v-if="usageLoading" class="sp-sheet__loading">
              <text>召唤消费明细中…</text>
            </view>

            <!-- 空状态 -->
            <view
              v-else-if="!usageData.items || !usageData.items.length"
              class="sp-sheet__empty"
            >
              <text class="sp-sheet__empty-emoji">📭</text>
              <text class="sp-sheet__empty-text">该课包暂无消费记录</text>
              <text class="sp-sheet__empty-hint">仅作为预选产品，尚未消课</text>
            </view>

            <!-- 明细列表 -->
            <view v-else class="sp-sheet__list">
              <view
                v-for="row in usageData.items"
                :key="row._id"
                class="sp-sheet__row"
              >
                <view class="sp-sheet__row-main">
                  <text v-if="row.lessonSchedule" class="sp-sheet__row-when">
                    {{ formatDateTime(row.lessonSchedule.plannedStartTime) }}
                  </text>
                  <text v-else class="sp-sheet__row-when sp-sheet__row-when--muted">—</text>
                  <text v-if="row.lessonSchedule" class="sp-sheet__row-what">
                    {{ row.lessonSchedule.courseInstance?.name || '—' }}
                    <text class="sp-sheet__row-what-sep">·</text>
                    第 {{ row.lessonSchedule.lessonNo || '?' }} 课
                  </text>
                  <text v-else class="sp-sheet__row-what sp-sheet__row-what--muted">—</text>
                  <view class="sp-sheet__row-tags">
                    <text class="sp-sheet__row-status" :class="`sp-sheet__row-status--${row.status}`">
                      {{ usageStatusLabel(row.status) }}
                    </text>
                    <text v-if="row.meta && row.meta.makeupOf" class="sp-sheet__row-makeup">补课</text>
                  </view>
                </view>
                <view class="sp-sheet__row-sub">
                  <view class="sp-sheet__row-sub-cell">
                    <text class="sp-sheet__row-sub-lbl">签到</text>
                    <text :class="['sp-sheet__row-sub-val', !row.actualStartTime && 'sp-sheet__row-sub-val--muted']">
                      {{ row.actualStartTime ? formatDateTimeMini(row.actualStartTime) : '—' }}
                    </text>
                  </view>
                  <view class="sp-sheet__row-sub-cell">
                    <text class="sp-sheet__row-sub-lbl">下课</text>
                    <text :class="['sp-sheet__row-sub-val', !row.actualEndTime && 'sp-sheet__row-sub-val--muted']">
                      {{ row.actualEndTime ? formatDateTimeMini(row.actualEndTime) : '—' }}
                    </text>
                  </view>
                  <view class="sp-sheet__row-sub-cell">
                    <text class="sp-sheet__row-sub-lbl">课评</text>
                    <text :class="['sp-sheet__row-sub-val', (row.evaluation && row.evaluation.score != null) ? 'sp-sheet__row-sub-val--strong' : 'sp-sheet__row-sub-val--muted']">
                      {{ (row.evaluation && row.evaluation.score != null) ? `${row.evaluation.score} 分` : '—' }}
                    </text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script>
import { mapState } from 'pinia'
import { useStudentStore } from '@/stores/student'
import { studentProductApi } from '@/api/studentProduct'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'
import { toast } from '@/components/common/Toast'

export default {
  components: {},
  data() {
    return {
      loading: false,
      refreshing: false,
      items: [],
      // 2026-07-05: viewKidId 模式 (跟 wallet 一致), kid-card 跳进来查该 kid 的课包, 不切全局 activeStudent
      viewKidId: '',
      viewStudentName: '',
      // 2026-07-10: 「课包消费明细」弹层 (R-2080)
      //   仿 admin StudentProducts.vue usageDialog 字段
      usageOpen: false,
      usageLoading: false,
      usageTarget: null, // { id, courseProductName, remainingLessons, totalLessons, source, expireDate }
      usageData: { summary: null, items: [] }
    }
  },
  computed: {
    ...mapState(useStudentStore, ['list']),
    // 2026-07-05: 用 viewStudentName 替代 activeStudentName
    activeStudentName() {
      return this.viewStudentName || '当前孩子'
    },
    // 兜底: onShow 跑时 student store list 还没就绪, 临时显示 '当前孩子', list 就绪后自动纠正
    shouldRetryResolve() {
      return this.viewKidId && !this.viewStudentName && Array.isArray(this.list) && this.list.length > 0
    },
    summary() {
      const active = this.items.filter((x) => x.isActive !== false)
      const totalRemaining = active.reduce((s, x) => s + (x.remainingLessons || 0), 0)
      const expiringSoon = active.filter((x) => {
        const d = this.expiringDays(x)
        return d >= 0 && d <= 7
      }).length
      return {
        totalRemaining,
        activeCount: active.length,
        expiringSoon
      }
    },
    // 弹层顶部 "到期日" 颜色, 复用卡片列表的过期/快到期配色
    expiryClassOfTarget() {
      const ed = this.usageTarget && this.usageTarget.expireDate
      if (!ed) return ''
      const diff = new Date(ed).getTime() - Date.now()
      const days = Math.floor(diff / (24 * 3600 * 1000))
      if (days < 0) return 'sp-sheet__summary-val--expired'
      if (days < 30) return 'sp-sheet__summary-val--expiring'
      return ''
    }
  },
  watch: {
    // 2026-07-05: list (kidMap) 异步就绪后, 自动 retry resolve viewStudentName
    list: {
      handler() { if (this.shouldRetryResolve) this._resolveViewName() },
      deep: false
    }
  },
  onLoad(query) {
    // 优先 window.location.search (浏览器 URL 权威, 跟 wallet 同模式)
    let kid = ''
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search)
        kid = params.get('kid') || ''
      }
    } catch (_) {}
    if (!kid && query && query.kid) kid = query.kid
    this.viewKidId = kid || ''
    this._resolveViewName()
  },
  // 重设当前激活机构时 (rare) 重新拉取
  onShow() {
    // 每次显示强制重新读 query (H5 下 navigateTo 复用实例只跑 onShow)
    let kid = ''
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search)
        kid = params.get('kid') || ''
      }
    } catch (_) {}
    if (!kid) {
      try {
        const pages = getCurrentPages && getCurrentPages()
        const cur = pages && pages.length ? pages[pages.length - 1] : null
        const options = (cur && cur.options) || {}
        kid = options.kid || ''
      } catch (_) {}
    }
    if (kid) {
      this.viewKidId = kid
      this._resolveViewName()
    }
    this.load()
  },
  methods: {
    _resolveViewName() {
      if (this.viewKidId && Array.isArray(this.list) && this.list.length) {
        const found = this.list.find((x) => String(x.id) === String(this.viewKidId))
        this.viewStudentName = (found && found.name) || ''
      } else {
        this.viewStudentName = ''
      }
    },
    async load() {
      // 2026-07-05: 必须传 student 参数, 否则后端 fallback 到 req.activeStudentId (错的 kid)
      // R-2079 controller: student=req.activeStudentId, ...req.query → query.student 覆盖
      if (!this.viewKidId) {
        this.items = []
        return
      }
      this.loading = true
      try {
        const res = await studentProductApi.me({ student: this.viewKidId })
        // [memory: http-interceptor-actually-unpacked] http 已解包, res 即业务字段
        const list = Array.isArray(res) ? res : res?.items || res?.data || []
        this.items = list.map((x) => ({ ...x, _id: x._id || x.id }))
      } catch (e) {
        console.warn('[studentProduct.list]', e)
        this.items = []
      } finally {
        this.loading = false
      }
    },
    async onPullDown() {
      this.refreshing = true
      await this.load()
      this.refreshing = false
    },
    percent(sp) {
      const t = sp.totalLessons || 0
      if (t <= 0) return 0
      return Math.max(0, Math.min(100, Math.round((sp.remainingLessons / t) * 100)))
    },
    // 过期天数 (>=0 未过期, 负数已过期)
    expiringDays(sp) {
      if (!sp.expireDate) return 9999
      const diff = new Date(sp.expireDate).getTime() - Date.now()
      return Math.floor(diff / (1000 * 60 * 60 * 24))
    },
    isExpired(sp) {
      return this.expiringDays(sp) < 0
    },
    formatDate(d) {
      if (!d) return '—'
      return date.fmtDate(d)
    },
    // 弹层用, "2026-07-13 16:00"
    formatDateTime(d) {
      if (!d) return '—'
      return date.fmt(d)
    },
    // 弹层用, "07-09 17:30"
    formatDateTimeMini(d) {
      if (!d) return '—'
      return date.fmtTime(d)
    },
    shortOrderId(order) {
      const id = typeof order === 'string' ? order : order?._id
      if (!id) return ''
      const s = String(id)
      return s.length > 8 ? s.slice(-8).toUpperCase() : s.toUpperCase()
    },
    sourceLabel(sp) {
      if (sp.source === 'gift') return '赠课'
      if (sp.source === 'order') return '购买'
      return sp.source || '其他'
    },
    // 弹层用, 与 admin StudentProducts.vue#USAGE_STATUS_LABELS 对齐
    usageStatusLabel(s) {
      const map = {
        scheduled: '待上课',
        checked_in: '已签到',
        completed: '已消课',
        no_show: '未到',
        leave: '请假',
        madeup: '已补课'
      }
      return map[s] || s || '—'
    },
    noop() {},
    // 2026-07-10: 点课包 → 弹层 (替换之前的 toast)
    async openUsage(sp) {
      haptic.tap()
      this.usageTarget = {
        id: sp._id,
        courseProductName: (sp.courseProduct && sp.courseProduct.name) || '—',
        remainingLessons: sp.remainingLessons,
        totalLessons: sp.totalLessons,
        source: sp.source,
        expireDate: sp.expireDate
      }
      this.usageData = { summary: null, items: [] }
      this.usageOpen = true
      this.usageLoading = true
      try {
        // R-2080 (2026-07-10): C 端单课包消费明细
        //   服务端强制校验 student == activeStudentId, 不存在的课包直接 403
        const payload = await studentProductApi.usageMe(sp._id)
        // [memory: http-interceptor-actually-unpacked] http 已解包, payload 即 { studentProduct, summary, items }
        const data = payload && typeof payload === 'object' ? payload : {}
        this.usageData = {
          summary: data.summary || null,
          items: Array.isArray(data.items) ? data.items : []
        }
        // 用后端精确值覆盖顶部概要 (学员 name / 课程名 / 课包总额 等)
        const spFromApi = data.studentProduct
        if (spFromApi) {
          this.usageTarget = {
            ...this.usageTarget,
            remainingLessons: spFromApi.remainingLessons,
            totalLessons: spFromApi.totalLessons,
            source: spFromApi.source,
            expireDate: spFromApi.expireDate
          }
        }
      } catch (e) {
        console.warn('[studentProduct.usageMe]', e)
        toast.error(e?.message || '加载消费明细失败')
      } finally {
        this.usageLoading = false
      }
    },
    closeUsage() {
      this.usageOpen = false
      this.usageTarget = null
      this.usageData = { summary: null, items: [] }
    },
    goCourses() {
      haptic.tap()
      uni.switchTab({ url: '/pages/tabbar/explore' })
    }
  }
}
</script>

<style lang="scss" scoped>
.sp {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);

  // 顶部 hero: 总剩余/可用课包/7天内到期
  &__hero {
    position: relative;
    overflow: hidden;
    padding: $spacing-md 0 $spacing-lg;
  }
  &__hero-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, $primary-lighter 0%, #FFE4D3 60%, $bg-page 100%);
    z-index: 0;
  }
  &__hero-inner {
    position: relative;
    z-index: 1;
    padding: 0 $spacing-lg;
  }
  &__hero-label {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }
  &__hero-row {
    display: flex;
    align-items: flex-end;
    gap: $spacing-md;
  }
  &__hero-num {
    display: flex;
    align-items: baseline;
    gap: 4rpx;
    flex: 1;
  }
  &__hero-num-val {
    font-size: 72rpx;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1;
  }
  &__hero-num-unit {
    font-size: $font-base;
    color: $text-secondary;
  }
  &__hero-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 120rpx;
  }
  &__hero-stat-val {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.2;
  }
  &__hero-stat-lbl {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 2rpx;
  }

  // 学生切换 (放在 hero 之后, 在列表之前)
  &__sub {
    padding: $spacing-sm $spacing-lg $spacing-md;
    background: $bg-page;
    position: relative;
    z-index: 2;
  }

  // 滚动区
  &__scroll {
    flex: 1;
    height: 0;
  }
  &__list-inner {
    padding: 0 $spacing-lg $spacing-xl;
  }

  // 骨架
  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }
  &__skeleton-card {
    height: 220rpx;
    background: linear-gradient(90deg, $divider-light 0%, #f8f4ee 50%, $divider-light 100%);
    background-size: 200% 100%;
    border-radius: $radius-md;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  // 空
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-xl $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    margin-top: $spacing-md;
  }
  &__empty-emoji { font-size: 96rpx; margin-bottom: $spacing-sm; }
  &__empty-title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__empty-desc {
    font-size: $font-sm;
    color: $primary;
  }

  // 列表
  &__list {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }

  // 卡片
  &__card {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    position: relative;
    overflow: hidden;
    transition: all $transition-fast;
    &:active {
      transform: scale(0.99);
    }
    &--inactive {
      opacity: 0.55;
    }
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 8rpx;
      background: $primary;
    }
    &--inactive::before {
      background: $text-tertiary;
    }
  }
  &__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
    margin-bottom: $spacing-md;
  }
  &__card-name {
    flex: 1;
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.3;
    @include multi-ellipsis(1);
  }
  &__card-source {
    flex-shrink: 0;
    font-size: $font-xs;
    padding: 4rpx 12rpx;
    border-radius: $radius-pill;
    font-weight: $font-weight-medium;
    &--order {
      color: $primary-dark;
      background: $primary-lighter;
    }
    &--gift {
      color: #B45309;
      background: #FEF3C7;
    }
  }

  // 进度
  &__progress {
    margin-bottom: $spacing-md;
  }
  &__progress-bar {
    height: 16rpx;
    background: $divider-light;
    border-radius: $radius-pill;
    overflow: hidden;
    margin-bottom: $spacing-xs;
  }
  &__progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, $primary, $primary-light);
    border-radius: $radius-pill;
    transition: width 0.3s ease;
  }
  &__progress-text {
    font-size: $font-xs;
    color: $text-secondary;
  }
  &__progress-text-em {
    color: $primary;
    font-weight: $font-weight-bold;
    font-size: $font-sm;
  }

  // meta
  &__meta {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    margin-bottom: $spacing-sm;
  }
  &__meta-item {
    display: flex;
    align-items: center;
    gap: 6rpx;
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.4;
  }
  &__meta-item--reason {
    color: #92400E;
  }
  &__meta-icon {
    flex-shrink: 0;
    font-size: $font-sm;
  }

  // tags
  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
  }
  &__tag {
    font-size: $font-xs;
    padding: 2rpx 12rpx;
    border-radius: $radius-pill;
    line-height: 1.6;
    &--warn {
      color: #fff;
      background: $warning;
    }
    &--ghost {
      color: $text-tertiary;
      background: $divider-light;
    }
    &--info {
      color: $primary-dark;
      background: $primary-lighter;
    }
    // 2026-07-10: 提示文案 (深灰底 + › 箭头), 区别于以上 state 类
    &--hint {
      color: $text-secondary;
      background: $bg-page;
      margin-left: auto;
    }
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }

  // 悬浮按钮 (2026-07-05: 删除去买课 FAB, 暂不接入线上支付)
  // &__fab 注释略 — 避免 SCSS 把注释里的花括号算成 opening brace
}

// 2026-07-10: 「课包消费明细」弹层 (R-2080)
//   全屏 sheet: 遮罩 + 底部弹出 panel (高度 85vh), 适配小程序/H5/App
//   结构: 头部标题 + 滚动主体 (summary / KPI / 明细列表)
//   顶级类, 不嵌在 .sp 里 — 避免嵌套 BEM 在 sass 解析时脆弱
.sp-sheet {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: flex-end;
}
.sp-sheet__mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  animation: fade-in 0.18s ease-out;
}
.sp-sheet__panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-height: 85vh;
  background: $bg-card;
  border-radius: 24rpx 24rpx 0 0;
  display: flex;
  flex-direction: column;
  animation: slide-up 0.22s ease-out;
  padding-bottom: env(safe-area-inset-bottom);
}
.sp-sheet__header {
  display: flex;
  align-items: center;
  padding: $spacing-md $spacing-lg;
  border-bottom: 1rpx solid $divider-light;
  flex-shrink: 0;
}
.sp-sheet__title-wrap {
  flex: 1;
  min-width: 0;
}
.sp-sheet__title {
  display: block;
  font-size: $font-lg;
  font-weight: $font-weight-bold;
  color: $text-primary;
}
.sp-sheet__subtitle {
  display: block;
  font-size: $font-sm;
  color: $text-secondary;
  margin-top: 2rpx;
  @include multi-ellipsis(1);
}
.sp-sheet__close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: $bg-page;
  @include flex-center;
  flex-shrink: 0;
  & > text {
    color: $text-secondary;
    font-size: 36rpx;
    line-height: 1;
  }
}
.sp-sheet__scroll {
  flex: 1;
  height: 0;
}
.sp-sheet__body {
  padding: $spacing-md $spacing-lg $spacing-2xl;
}
.sp-sheet__loading {
  @include flex-center;
  padding: $spacing-xl 0;
  color: $text-tertiary;
  font-size: $font-sm;
}

.sp-sheet__summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: $spacing-md;
  background: $bg-page;
  border-radius: $radius-md;
  padding: $spacing-md;
  margin-bottom: $spacing-md;
}
.sp-sheet__summary-item {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.sp-sheet__summary-label {
  font-size: $font-xs;
  color: $text-tertiary;
}
.sp-sheet__summary-val {
  font-size: $font-md;
  color: $text-primary;
  font-weight: $font-weight-medium;
}
.sp-sheet__summary-val--strong {
  color: $primary;
  font-weight: $font-weight-bold;
}
.sp-sheet__summary-val--expired {
  color: #FF4D4F;
  font-weight: $font-weight-bold;
}
.sp-sheet__summary-val--expiring {
  color: #FAAD14;
  font-weight: $font-weight-bold;
}
.sp-sheet__tag {
  display: inline-block;
  font-size: $font-xs;
  padding: 2rpx 12rpx;
  border-radius: $radius-pill;
}
.sp-sheet__tag--gift {
  color: #B45309;
  background: #FEF3C7;
}
.sp-sheet__tag--order {
  color: $primary-dark;
  background: $primary-lighter;
}

.sp-sheet__kpi {
  display: flex;
  background: $bg-card;
  border-radius: $radius-md;
  border: 1rpx solid $divider-light;
  overflow: hidden;
  margin-bottom: $spacing-md;
}
.sp-sheet__kpi-cell {
  flex: 1;
  @include flex-center;
  flex-direction: column;
  padding: $spacing-sm 0;
  border-right: 1rpx solid $divider-light;
  &:last-child { border-right: none; }
}
.sp-sheet__kpi-num {
  font-size: $font-xl;
  font-weight: $font-weight-bold;
  color: $primary;
  line-height: 1.2;
}
.sp-sheet__kpi-num--warn { color: #FF4D4F; }
.sp-sheet__kpi-num--gold { color: #FAAD14; }
.sp-sheet__kpi-lbl {
  font-size: $font-xs;
  color: $text-tertiary;
  margin-top: 2rpx;
}

.sp-sheet__empty {
  @include flex-center;
  flex-direction: column;
  padding: $spacing-2xl $spacing-md;
}
.sp-sheet__empty-emoji {
  font-size: 96rpx;
  margin-bottom: $spacing-md;
}
.sp-sheet__empty-text {
  font-size: $font-base;
  color: $text-primary;
  font-weight: $font-weight-medium;
}
.sp-sheet__empty-hint {
  font-size: $font-sm;
  color: $text-tertiary;
  margin-top: $spacing-xs;
}

.sp-sheet__list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}
.sp-sheet__row {
  background: $bg-card;
  border: 1rpx solid $divider-light;
  border-radius: $radius-md;
  padding: $spacing-md;
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}
.sp-sheet__row-main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.sp-sheet__row-when {
  font-size: $font-xs;
  color: $text-tertiary;
  &--muted { color: $text-tertiary; opacity: 0.5; }
}
.sp-sheet__row-what {
  font-size: $font-md;
  font-weight: $font-weight-semibold;
  color: $text-primary;
  @include multi-ellipsis(1);
}
.sp-sheet__row-what--muted {
  color: $text-tertiary;
  font-weight: 400;
}
.sp-sheet__row-what-sep {
  color: $text-tertiary;
  font-weight: 400;
  margin: 0 4rpx;
}
.sp-sheet__row-tags {
  display: flex;
  gap: 6rpx;
  margin-top: 4rpx;
}
.sp-sheet__row-status {
  display: inline-block;
  font-size: $font-xs;
  padding: 2rpx 12rpx;
  border-radius: $radius-pill;
  line-height: 1.6;
  border: 1rpx solid currentColor;
}
.sp-sheet__row-status--scheduled { color: #909399; background: #F4F4F5; }
.sp-sheet__row-status--checked_in { color: #E6A23C; background: #FDF6EC; }
.sp-sheet__row-status--completed { color: #67C23A; background: #F0F9EB; }
.sp-sheet__row-status--no_show { color: #F56C6C; background: #FEF0F0; }
.sp-sheet__row-status--leave { color: #909399; background: #F4F4F5; }
.sp-sheet__row-status--madeup { color: #B89AE6; background: #F5EDFD; }
.sp-sheet__row-makeup {
  display: inline-block;
  font-size: $font-xs;
  padding: 2rpx 12rpx;
  border-radius: $radius-pill;
  color: #fff;
  background: #F56C6C;
}
.sp-sheet__row-sub {
  display: flex;
  gap: $spacing-md;
  padding-top: $spacing-xs;
  border-top: 1rpx dashed $divider-light;
}
.sp-sheet__row-sub-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.sp-sheet__row-sub-lbl {
  font-size: $font-xs;
  color: $text-tertiary;
}
.sp-sheet__row-sub-val {
  font-size: $font-sm;
  color: $text-primary;
}
.sp-sheet__row-sub-val--muted { color: $text-tertiary; }
.sp-sheet__row-sub-val--strong { color: $primary; font-weight: $font-weight-bold; }

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
</style>
