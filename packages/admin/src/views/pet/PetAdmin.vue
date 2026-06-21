<template>
  <div class="page">
    <h2>宠物管理</h2>

    <el-card style="margin-top: 16px">
      <el-form inline :model="filters" @submit.prevent="fetchList">
        <el-form-item label="学员">
          <el-input v-model="filters.keyword" placeholder="按学员名搜索" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.state" placeholder="全部" clearable style="width: 120px">
            <el-option label="蛋" value="egg" />
            <el-option label="存活" value="alive" />
            <el-option label="死亡" value="dead" />
          </el-select>
        </el-form-item>
        <el-form-item label="阶">
          <el-select v-model="filters.tier" placeholder="全部" clearable style="width: 100px">
            <el-option label="C" value="C" />
            <el-option label="B" value="B" />
            <el-option label="A" value="A" />
            <el-option label="S" value="S" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table :data="list" v-loading="loading" style="margin-top: 16px" stripe>
      <el-table-column prop="studentName" label="学员" width="120" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="stateTagType(row.state)">{{ stateLabel(row.state) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="种类" width="100">
        <template #default="{ row }">
          {{ row.speciesRecord?.name || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="阶" width="60">
        <template #default="{ row }">
          <el-tag v-if="row.tier" :type="tierTagType(row.tier)" size="small">{{ row.tier }}</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="等级" width="80">
        <template #default="{ row }">
          Lv.{{ row.level }}
        </template>
      </el-table-column>
      <el-table-column label="经验" width="100">
        <template #default="{ row }">
          {{ row.experience }}
        </template>
      </el-table-column>
      <el-table-column label="饱腹度" width="100">
        <template #default="{ row }">
          <el-progress :percentage="row.currentHunger" :stroke-width="8" :show-text="false" :color="hungerColor(row.currentHunger)" />
        </template>
      </el-table-column>
      <el-table-column label="最后喂食" width="160">
        <template #default="{ row }">
          {{ formatDate(row.lastFedAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 16px"
      @current-change="fetchList"
    />

    <!-- 详情弹窗 -->
    <PetDetailDialog v-model="detailVisible" :pet-id="selectedPetId" @updated="fetchList" />
  </div>
</template>

<script>
import { petAdminApi } from '@/api/pet'
import { formatDate } from '@/utils/format'
import PetDetailDialog from './PetDetailDialog.vue'

export default {
  name: 'PetAdmin',
  components: { PetDetailDialog },
  data() {
    return {
      filters: { keyword: '', state: '', tier: '' },
      list: [],
      page: 1,
      pageSize: 20,
      total: 0,
      loading: false,
      detailVisible: false,
      selectedPetId: null
    }
  },
  mounted() {
    this.fetchList()
  },
  methods: {
    async fetchList() {
      this.loading = true
      try {
        const params = {
          page: this.page,
          pageSize: this.pageSize
        }
        if (this.filters.keyword) params.keyword = this.filters.keyword
        if (this.filters.state) params.state = this.filters.state
        if (this.filters.tier) params.tier = this.filters.tier
        const r = await petAdminApi.list(params)
        this.list = r.data?.items || []
        this.total = r.data?.total || 0
      } finally {
        this.loading = false
      }
    },
    openDetail(row) {
      this.selectedPetId = row._id
      this.detailVisible = true
    },
    formatDate,
    stateLabel(s) {
      return { egg: '蛋', alive: '存活', dead: '死亡' }[s] || s
    },
    stateTagType(s) {
      return { egg: 'info', alive: 'success', dead: 'danger' }[s] || ''
    },
    tierTagType(t) {
      return { C: 'info', B: 'primary', A: 'warning', S: 'danger' }[t] || ''
    },
    hungerColor(h) {
      if (h < 30) return '#F56C6C'
      if (h < 60) return '#E6A23C'
      return '#67C23A'
    }
  }
}
</script>

<style scoped>
.page { padding: 0; }
</style>
