<template>
  <div class="page">
    <h2>商城流水</h2>

    <el-card style="margin-top:16px">
      <el-form inline :model="filters" @submit.prevent="fetchList">
        <el-form-item label="学员">
          <el-input v-model="filters.keyword" placeholder="按学员名搜索" clearable style="width:200px" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.type" placeholder="全部" clearable style="width:160px">
            <el-option label="学生买装饰" value="purchase_item" />
            <el-option label="学生买食物" value="purchase_consumable" />
          </el-select>
        </el-form-item>
        <el-form-item label="购买人">
          <el-radio-group v-model="filters.by">
            <el-radio value="">全部</el-radio>
            <el-radio value="student">学员自主</el-radio>
            <el-radio value="admin">老师代发</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table :data="list" v-loading="loading" stripe style="margin-top:16px">
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="studentName" label="学员" width="120" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="typeTagType(row.type)">{{ typeLabel(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="购买人" width="100">
        <template #default="{ row }">
          <el-tag :type="row.payload?.by === 'admin' ? 'warning' : 'success'" size="small">
            {{ row.payload?.by === 'admin' ? '老师代发' : '学员自主' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="物品" width="160">
        <template #default="{ row }">
          {{ itemLabel(row) }}
        </template>
      </el-table-column>
      <el-table-column label="积分" width="100">
        <template #default="{ row }">
          <span style="color:#f5222d;font-weight:600">
            -{{ row.payload?.pointCost ?? row.payload?.cost ?? 0 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="详情">
        <template #default="{ row }">
          <code style="font-size:12px">{{ JSON.stringify(row.payload) }}</code>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top:16px"
      @current-change="fetchList"
    />
  </div>
</template>

<script>
import { ElMessage } from 'element-plus'
import { petAdminApi } from '@/api/pet'
import { formatDate } from '@/utils/format'

export default {
  name: 'PetShopOrders',
  data() {
    return {
      filters: { keyword: '', type: '', by: '' },
      list: [],
      page: 1,
      pageSize: 20,
      total: 0,
      loading: false
    }
  },
  mounted() {
    this.fetchList()
  },
  methods: {
    async fetchList() {
      this.loading = true
      try {
        // 用 events 接口过滤 type=purchase_item|purchase_consumable
        const r = await petAdminApi.events({
          type: 'purchase_item,purchase_consumable',
          keyword: this.filters.keyword || undefined,
          page: this.page,
          pageSize: this.pageSize
        })
        let items = r.data?.items || []
        // 前端二次过滤 by=student|admin
        if (this.filters.by) {
          items = items.filter(it => it.payload?.by === this.filters.by)
        }
        this.list = items
        this.total = r.data?.total || 0
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '加载失败')
        this.list = []
      } finally {
        this.loading = false
      }
    },
    typeLabel(t) {
      return { purchase_item: '买装饰', purchase_consumable: '买食物' }[t] || t
    },
    typeTagType(t) {
      return { purchase_item: 'warning', purchase_consumable: 'success' }[t] || ''
    },
    itemLabel(row) {
      if (row.type === 'purchase_item') return row.payload?.itemKey || '—'
      return row.payload?.consumableKey || '—'
    },
    formatDate
  }
}
</script>

<style scoped>
.page { padding: 0; }
</style>