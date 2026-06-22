<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="`${studentName || ''} 的宠物事件`"
    width="780px"
    :close-on-click-modal="false"
  >
    <!-- 2026-06-22 增：顶部筛选条（类型多选 / 来源 / 时间范围 / 关键字） -->
    <el-form inline :model="filters" size="small" @submit.prevent>
      <el-form-item label="类型">
        <el-select
          v-model="filters.types"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="全部类型"
          clearable
          style="width: 220px"
        >
          <el-option v-for="opt in TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="来源">
        <el-select v-model="filters.source" placeholder="全部" clearable style="width: 110px">
          <el-option label="老师代" value="admin" />
          <el-option label="学员自" value="self" />
        </el-select>
      </el-form-item>
      <el-form-item label="时间">
        <el-date-picker
          v-model="filters.dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 340px"
        />
      </el-form-item>
      <el-form-item label="关键字">
        <el-input v-model="filters.keyword" placeholder="搜 payload JSON" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item>
        <el-button @click="resetFilters">重置</el-button>
      </el-form-item>
    </el-form>

    <div v-loading="loading" style="margin-top: 4px">
      <el-empty v-if="!loading && events.length === 0" description="暂无事件" />
      <el-empty v-else-if="!loading && filteredEvents.length === 0" description="无符合筛选条件的事件">
        <el-button size="small" @click="resetFilters">清空筛选</el-button>
      </el-empty>
      <el-table v-else :data="filteredEvents" max-height="440" size="small" stripe>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="typeTagType(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="80">
          <template #default="{ row }">
            <el-tag :type="row.payload?.by === 'admin' ? 'warning' : 'primary'" size="small">
              {{ row.payload?.by === 'admin' ? '老师代' : '学员自' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="详情">
          <template #default="{ row }">
            <code style="font-size:12px">
              <span v-html="highlight(payloadSummary(row))" />
            </code>
          </template>
        </el-table-column>
      </el-table>

      <!-- 2026-06-22 增：cursor 加载更多 -->
      <div v-if="hasMore" style="text-align:center;margin-top:8px">
        <el-button :loading="loadingMore" size="small" plain @click="loadMore">
          加载更多（已加载 {{ events.length }} 条）
        </el-button>
      </div>
      <div v-else-if="events.length > 0 && !loading" style="text-align:center;margin-top:8px;color:#909399;font-size:12px">
        — 已加载全部 {{ events.length }} 条 —
      </div>
    </div>

    <template #footer>
      <span style="margin-right: 12px; color: #909399; font-size: 12px">
        已加载 {{ events.length }} 条 · 当前显示 {{ filteredEvents.length }} 条
      </span>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script>
import { ElMessage } from 'element-plus'
import { petAdminApi } from '@/api/pet'
import { formatDate } from '@/utils/format'

const TYPE_LABELS = {
  adopt: '领养', hatch: '破壳', feed: '喂食',
  levelup: '升级', tierup: '升阶', tierdown: '降阶',
  swap: '置换', equip: '装备', unequip: '卸下',
  death: '死亡', rebirth: '重生',
  purchase_item: '买装饰', purchase_consumable: '买食物',
  admin_override: '调整',
  admin_adopt: '老师代领', admin_feed: '老师喂', admin_hatch: '老师破壳',
  admin_swap: '老师换蛋', admin_tierdown: '老师降阶', admin_equip: '老师换装'
}

// 类型选项：跟 PetEvent.type enum 对齐（@shared/enums PET_EVENT_TYPES）
const TYPE_OPTIONS = Object.keys(TYPE_LABELS).map(value => ({ value, label: TYPE_LABELS[value] }))

const EMPTY_FILTERS = () => ({ types: [], source: '', keyword: '', dateRange: null })

/**
 * 单个宠物的事件流弹窗（2026-06-22）
 *
 * props:
 *   - modelValue: 弹窗显示
 *   - petAccountId: 必填
 *   - studentName: 学员名（标题展示用）
 *
 * 数据加载策略（2026-06-22 cursor 分页）：
 *   - 首次拉 limit=50；返回 nextCursor 时显示「加载更多」按钮
 *   - 类型多选 / 来源 / 时间范围 / 关键字 4 项筛选用 computed 在已加载数据上过滤
 *     （不重新请求，体验即时；用户主动「加载更多」可扩充窗口）
 *   - 后端 listEvents 排序键 (createdAt desc, _id desc) 必须稳定，否则翻页会丢/重
 */
export default {
  name: 'PetEventsDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    petAccountId: { type: String, default: null },
    studentName: { type: String, default: '' }
  },
  emits: ['update:modelValue'],
  data() {
    return {
      events: [],        // 已加载的事件（cursor 分页累加）
      nextCursor: null,  // 下一页游标；null = 已到末页
      hasMore: false,
      loading: false,
      loadingMore: false,
      filters: EMPTY_FILTERS(),
      TYPE_OPTIONS
    }
  },
  computed: {
    filteredEvents() {
      const { types, source, keyword, dateRange } = this.filters
      const kw = (keyword || '').trim().toLowerCase()
      const [start, end] = Array.isArray(dateRange) ? dateRange : [null, null]
      const startTs = start ? new Date(start).getTime() : null
      const endTs = end ? new Date(end).getTime() : null

      return this.events.filter(row => {
        // 1) 类型多选（空数组 = 全部）
        if (types && types.length > 0 && !types.includes(row.type)) return false

        // 2) 来源：admin = 老师代；其他（含没有 by）= 学员自
        const isAdmin = row.payload?.by === 'admin'
        if (source === 'admin' && !isAdmin) return false
        if (source === 'self' && isAdmin) return false

        // 3) 时间范围（用 createdAt 比较）
        if (startTs || endTs) {
          const ts = new Date(row.createdAt).getTime()
          if (startTs && ts < startTs) return false
          if (endTs && ts > endTs) return false
        }

        // 4) 关键字：模糊匹配 payloadSummary 渲染文本（不搜整 JSON 太噪）
        if (kw && !this.payloadSummary(row).toLowerCase().includes(kw)) return false

        return true
      })
    }
  },
  watch: {
    modelValue(v) {
      if (v) {
        this.filters = EMPTY_FILTERS()
        this.load()
      }
    }
  },
  methods: {
    async load() {
      if (!this.petAccountId) {
        this.events = []
        this.nextCursor = null
        this.hasMore = false
        return
      }
      this.loading = true
      try {
        // 2026-06-22 cursor 分页：首次拉 50，后续按 nextCursor 翻页
        const r = await petAdminApi.events({ petAccountId: this.petAccountId, limit: 50 })
        const payload = r.data || {}
        this.events = payload.items || []
        this.nextCursor = payload.nextCursor || null
        this.hasMore = !!payload.hasMore
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '加载失败')
        this.events = []
        this.nextCursor = null
        this.hasMore = false
      } finally {
        this.loading = false
      }
    },
    async loadMore() {
      if (!this.nextCursor || this.loadingMore) return
      this.loadingMore = true
      try {
        const r = await petAdminApi.events({
          petAccountId: this.petAccountId,
          limit: 50,
          cursor: this.nextCursor
        })
        const payload = r.data || {}
        this.events = this.events.concat(payload.items || [])
        this.nextCursor = payload.nextCursor || null
        this.hasMore = !!payload.hasMore
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '加载更多失败')
      } finally {
        this.loadingMore = false
      }
    },
    resetFilters() {
      this.filters = EMPTY_FILTERS()
    },
    typeLabel(t) { return TYPE_LABELS[t] || t },
    typeTagType(t) {
      if (t.startsWith('admin_')) return 'warning'
      if (t === 'death') return 'danger'
      if (t === 'purchase_item' || t === 'purchase_consumable') return 'success'
      if (t === 'rebirth' || t === 'tierup' || t === 'levelup') return 'success'
      return 'info'
    },
    payloadSummary(row) {
      const p = row.payload || {}
      if (p.consumableKey) return `${p.consumableKey} (-${p.pointCost ?? p.cost ?? 0} 积分)`
      if (p.itemKey) return `${p.itemKey} (-${p.pointCost ?? 0} 积分)`
      if (row.type === 'equip' || row.type === 'unequip') return `${p.slot}: ${p.itemKey || '—'}`
      if (row.type === 'levelup') return `→ Lv.${p.level || '?'}`
      if (row.type === 'tierup') return `→ ${p.tier || '?'} 阶`
      if (row.type === 'admin_override') return `调整 ${(p.changes || []).map(c => c.field).join(', ')}`
      const json = JSON.stringify(p)
      return json.length > 80 ? json.slice(0, 80) + '...' : json
    },
    // 关键字高亮（仅详情列）：转义 HTML + 包 <mark>
    highlight(text) {
      const kw = (this.filters.keyword || '').trim()
      if (!kw) return this.escapeHtml(text)
      const safeText = this.escapeHtml(text)
      const safeKw = this.escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return safeText.replace(new RegExp(safeKw, 'gi'), m => `<mark style="background:#FFF3A3;color:inherit;padding:0">${m}</mark>`)
    },
    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]))
    },
    formatDate
  }
}
</script>