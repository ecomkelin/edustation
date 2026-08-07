<!--
  tabs/RelatedSection.vue (2026-08-07)

  用户详情页各业务板块的通用外壳: 一张卡 = 一个 R-0218 domain。
  自己管 loading / 分页 / 空态 / 403 降级, 调用方只用 #columns 插槽声明列。

  用法:
    <RelatedSection :user-id="id" domain="students" title="监护的学生">
      <template #columns>
        <el-table-column prop="name" label="姓名" />
      </template>
    </RelatedSection>
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
import { userApi } from '@/api/user'

const props = defineProps({
  userId: { type: String, required: true },
  domain: { type: String, required: true },
  title: { type: String, required: true },
  emptyText: { type: String, default: '暂无数据' },
  pageSize: { type: Number, default: 10 }
})

const items = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
// 后端对 sessions / audit 两个域返 403 (非平台超管)。正常情况下父组件已经
// 按 scope 隐藏了整个 tab, 这里只是兜底: 不弹红条, 降级成一句说明。
const PLATFORM_ONLY = new Set(['sessions', 'audit'])
const forbidden = ref(false)

async function load() {
  if (!props.userId) return
  loading.value = true
  try {
    const r = await userApi.related(
      props.userId,
      props.domain,
      { page: page.value, pageSize: props.pageSize },
      // 这两个域的 403 是预期分支, 交给下面 catch 降级, 别让拦截器弹 toast
      PLATFORM_ONLY.has(props.domain) ? { silent: true } : {}
    )
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
  () => [props.userId, props.domain],
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
