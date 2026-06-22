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
          <el-button type="success" @click="openAdoptDialog">
            <el-icon style="margin-right:4px;vertical-align:-2px"><Plus /></el-icon>代领养
          </el-button>
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

    <!-- 代领养弹窗：选择学员 → 调 adoptOnBehalf -->
    <el-dialog v-model="adoptDialogVisible" title="代领养宠物" width="560px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
        <template #title>为指定学员代领养一只宠物（生成蛋状态，需破壳后才显示种类）</template>
      </el-alert>

      <el-form label-width="80px">
        <el-form-item label="搜索学员">
          <el-input v-model="studentKeyword" placeholder="按姓名/手机号搜索" clearable @input="onStudentKeywordInput" @clear="fetchStudents" />
        </el-form-item>

        <el-form-item label="选择学员" required>
          <el-table
            ref="studentTableRef"
            :data="studentOptions"
            v-loading="studentsLoading"
            highlight-current-row
            @current-change="onStudentPick"
            max-height="280"
            style="width:100%"
            empty-text="输入关键字搜索学员"
          >
            <el-table-column label="" width="50">
              <template #default="{ row }">
                <el-radio v-model="pickedStudentId" :value="row._id" @change="onStudentRadio(row)">
                  <span></span>
                </el-radio>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="姓名" min-width="100" />
            <el-table-column prop="mobile" label="手机号" min-width="120" />
            <el-table-column label="是否有宠物" width="120">
              <template #default="{ row }">
                <el-tag v-if="row.hasPet" type="success" size="small">已有</el-tag>
                <el-tag v-else type="info" size="small">未领养</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="adoptDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="adopting" :disabled="!pickedStudentId" @click="submitAdopt">
          确认领养
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import { studentApi } from '@/api/student'
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
      selectedPetId: null,

      // 代领养弹窗状态
      adoptDialogVisible: false,
      studentKeyword: '',
      studentOptions: [],
      studentsLoading: false,
      pickedStudentId: null,
      pickedStudent: null,
      adopting: false,
      studentSearchTimer: null
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
        // ⚠️ 当前 http.js 第 125 行 return body (未真正解包)，r 是 {success, code, message, data}
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

    // ─── 代领养 ───
    openAdoptDialog() {
      this.adoptDialogVisible = true
      this.studentKeyword = ''
      this.pickedStudentId = null
      this.pickedStudent = null
      this.fetchStudents()
    },
    async fetchStudents() {
      this.studentsLoading = true
      try {
        const r = await studentApi.list({
          keyword: this.studentKeyword || undefined,
          pageSize: 20,
          page: 1
        })
        // ⚠️ 当前 http.js 第 125 行 return body（未真正解包），r 是 {success, data: {items}}
        this.studentOptions = r.data?.items || []
      } catch (e) {
        this.studentOptions = []
      } finally {
        this.studentsLoading = false
      }
    },
    onStudentKeywordInput() {
      // 300ms 防抖
      if (this.studentSearchTimer) clearTimeout(this.studentSearchTimer)
      this.studentSearchTimer = setTimeout(() => this.fetchStudents(), 300)
    },
    onStudentRadio(row) {
      this.pickedStudentId = row._id
      this.pickedStudent = row
    },
    onStudentPick(row) {
      // 表格行点击选择
      if (row) {
        this.pickedStudentId = row._id
        this.pickedStudent = row
      }
    },
    async submitAdopt() {
      if (!this.pickedStudentId) {
        ElMessage.warning('请先选择学员')
        return
      }
      if (this.pickedStudent && this.pickedStudent.hasPet) {
        try {
          await ElMessageBox.confirm(
            `学员【${this.pickedStudent.name}】已有宠物，继续将创建第二个宠物账号（与原宠物独立）。是否继续？`,
            '提示',
            { type: 'warning', confirmButtonText: '继续领养', cancelButtonText: '取消' }
          )
        } catch (_) {
          return
        }
      }
      this.adopting = true
      try {
        const r = await petAdminApi.adoptOnBehalf(this.pickedStudentId)
        ElMessage.success(`已为【${this.pickedStudent?.name}】领养宠物（蛋状态），可在列表查看`)
        this.adoptDialogVisible = false
        await this.fetchList()
        // 当前 http.js return body；r.data 即业务对象（petAccount）
        const newId = r.data?._id
        if (newId) {
          this.selectedPetId = newId
          this.detailVisible = true
        }
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || '领养失败')
      } finally {
        this.adopting = false
      }
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
