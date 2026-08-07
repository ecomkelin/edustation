<!--
  RelatedSection.vue (2026-08-07 抽出共用)

  详情页各业务板块的通用外壳: 一张卡 = 一个 related domain。
  自己管 loading / 分页 / 空态 / 403 降级, 调用方只用 #columns 插槽声明列。

  用法 (UserDetail / StudentDetail 通用):
    <RelatedSection
      :fetch="(params, opts) => userApi.related(userId, 'students', params, opts)"
      :watch-key="userId"
      title="监护的学生"
      empty-text="该账号不是任何学员的监护人"
    >
      <template #columns>
        <el-table-column prop="name" label="姓名" />
      </template>
    </RelatedSection>

  抽出动机 (2026-08-07):
    - UserDetail 的 tabs/RelatedSection.vue 写死了 userApi.related
    - StudentDetail 也要复用同一外壳; 抽出后两边都 import 这一个组件
-->
<template>
  <el-card class="block" shadow="never">
    <template #header>
      <div class="card-head">
        <b>{{ title }}</b>
        <span class="count">
          <template v-if="forbidden">仅平台超管可见</template>
          <template v-else>共 {{ total }} 条</template>
        </span>
      </div>
    </template>

    <el-alert
      v-if="forbidden"
      type="info"
      :closable="false"
      show-icon
      title="无权查看"
      description="该板块的数据没有机构维度（天然跨机构），仅平台超管可查看。"
    />

    <template v-else>
      <el-table v-loading="loading" :data="items" border size="small" :empty-text="emptyText">
        <slot name="columns" />
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        size="small"
        style="margin-top: 10px"
        @current-change="load"
      />
    </template>
  </el-card>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  // 拉数据的函数: (params, opts) => Promise<AxiosResponse>
  //   params: {page, pageSize}
  //   opts:   透传给 http.js (例如 { silent: true } 兜底 403 不弹 toast)
  fetch: { type: Function, required: true },
  // watchKey: 任一变化即重置分页并 reload (典型: userId / studentId)
  watchKey: { type: [String, Number], default: '' },
  title: { type: String, required: true },
  emptyText: { type: String, default: '暂无数据' },
  pageSize: { type: Number, default: 10 },
  // domain 名: 仅用于 403 兜底 silent 判断; 不传则不启用 silent
  // (例如 UserDetail 的 sessions/audit 域 403 是预期分支)
  domain: { type: String, default: '' }
})

const items = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const forbidden = ref(false)

// 仅 UserDetail 用到: sessions / audit 域 403 是预期分支, 交给 catch 降级, 别让拦截器弹 toast
// StudentDetail 用不到 (它的 7 个域都不存在 PLATFORM_ONLY); 不传 domain 即可禁用
function isSilent() {
  if (!props.domain) return false
  return ['sessions', 'audit'].includes(props.domain)
}

async function load() {
  loading.value = true
  try {
    const opts = isSilent() ? { silent: true } : {}
    const r = await props.fetch({ page: page.value, pageSize: props.pageSize }, opts)
    items.value = r.data.items
    total.value = r.data.total
    forbidden.value = false
  } catch (e) {
    if (e?.response?.status === 403) {
      forbidden.value = true
      items.value = []
      total.value = 0
    } else {
      // 其余错误已由 http.js 拦截器 toast
      items.value = []
      total.value = 0
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => props.watchKey,
  () => {
    page.value = 1
    load()
  },
  { immediate: true }
)

defineExpose({ reload: () => { page.value = 1; load() } })
</script>

<style scoped>
.block { margin-bottom: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; }
.count { color: #909399; font-size: 12px; font-weight: normal; }
</style>
