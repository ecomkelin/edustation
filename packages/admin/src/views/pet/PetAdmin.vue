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
      <el-table-column label="饱腹度" width="140">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.state === 'alive'"
            :content="`每 ${rowEffectiveDecay(row)} 分钟 -1; 剩 ${row.currentHunger}/${row.maxHunger || 1000}`"
            placement="top"
          >
            <el-progress
              :percentage="Math.round((row.currentHunger / (row.maxHunger || 1000)) * 100)"
              :stroke-width="8"
              :show-text="true"
              :format="() => `${row.currentHunger}/${row.maxHunger || 1000}`"
              :color="hungerColor(row.currentHunger, row.maxHunger || 1000)"
            />
          </el-tooltip>
          <span v-else-if="row.state === 'egg'" style="color:#909399;font-size:12px">🥚 蛋态</span>
          <span v-else style="color:#909399;font-size:12px">💀 已死亡</span>
        </template>
      </el-table-column>
      <el-table-column label="最后喂食" width="160">
        <template #default="{ row }">
          {{ formatDate(row.lastFedAt) }}
        </template>
      </el-table-column>
      <!-- 2026-06-22: 代喂食 + 课堂展示 + 事件 放到列表行 (与详情并列)；代买装饰/食物仍走详情弹窗 -->
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-tooltip content="详情/破壳/置换/降阶/代买装饰/代买食物" placement="top">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
          </el-tooltip>
          <el-tooltip :disabled="row.state === 'alive'" content="仅存活状态可喂食" placement="top">
            <el-button size="small" type="primary" :disabled="row.state !== 'alive'" @click="openFeedDialog(row)">
              <el-icon style="margin-right:2px;vertical-align:-2px"><Bowl /></el-icon>代喂食
            </el-button>
          </el-tooltip>
          <el-tooltip content="新窗口打开课堂展示页（老师投影给全班看）" placement="top">
            <el-button size="small" type="primary" plain @click="openClassroom(row)">课堂展示</el-button>
          </el-tooltip>
          <el-tooltip content="查看该宠物的事件流" placement="top">
            <el-button size="small" type="info" plain @click="openEventsDialog(row)">
              <el-icon style="margin-right:2px;vertical-align:-2px"><Tickets /></el-icon>事件
            </el-button>
          </el-tooltip>
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
    <PetDetailDialog v-model="detailVisible" :pet-id="selectedPetId" @updated="onDetailUpdated" />

    <!-- 代喂食弹窗（每行点击触发，复用 FeedOnBehalfDialog 组件） -->
    <FeedOnBehalfDialog
      v-model:visible="feedDialogVisible"
      :pet="feedPet"
      :student-name="feedStudentName"
      @success="onFeedSuccess"
    />

    <!-- 单宠物事件流弹窗（2026-06-22 调整：列表行按钮触发） -->
    <PetEventsDialog
      v-model="eventsDialogVisible"
      :pet-account-id="eventsPetId"
      :student-name="eventsStudentName"
    />

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
            <!-- 2026-06-22: 列表已过滤 hasPet=false，「是否有宠物」列无意义删除 -->
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
import { Plus, Bowl, Tickets } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import { studentApi } from '@/api/student'
import { effectiveHungerDecayMinutes } from '@/utils/pet'
import { formatDate } from '@/utils/format'
import PetDetailDialog from './PetDetailDialog.vue'
import FeedOnBehalfDialog from '@/components/Pet/FeedOnBehalfDialog.vue'
import PetEventsDialog from '@/components/Pet/PetEventsDialog.vue'

export default {
  name: 'PetAdmin',
  components: { PetDetailDialog, FeedOnBehalfDialog, PetEventsDialog },
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
      studentSearchTimer: null,

      // 代喂食弹窗状态（2026-06-22: 从详情移过来）
      feedDialogVisible: false,
      feedPet: null,
      feedStudentName: '',

      // 单宠物事件流弹窗状态（2026-06-22: 列表行按钮触发）
      eventsDialogVisible: false,
      eventsPetId: null,
      eventsStudentName: ''
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

    // ─── 代喂食（列表行） ───
    async openFeedDialog(row) {
      // 列表行只有 summary 字段；调一次详情接口拿完整 pet（含 unlocked/equipped）
      try {
        const r = await petAdminApi.get(row._id)
        const payload = r?.data?.pet ? r.data : r
        this.feedPet = payload?.pet || null
        this.feedStudentName = row.studentName || ''
        this.feedDialogVisible = true
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '加载宠物失败')
      }
    },
    onFeedSuccess() {
      this.fetchList()
    },

    // ─── 课堂展示（列表行） ───
    openClassroom(row) {
      const url = `/class/pet-display?studentId=${row.student}`
      window.open(url, '_blank')
    },

    // ─── 事件流（列表行）：弹 PetEventsDialog ───
    openEventsDialog(row) {
      this.eventsPetId = row._id
      this.eventsStudentName = row.studentName || ''
      this.eventsDialogVisible = true
    },

    // ─── 详情 dialog 关闭后刷新 ───
    onDetailUpdated() {
      this.fetchList()
    },

    // ─── 代领养（保留） ───
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
          // 2026-06-22: 代领养弹窗默认只显示未领养学员；后端也校验防绕过
          hasPet: 'false',
          pageSize: 20,
          page: 1
        })
        this.studentOptions = r.data?.items || []
      } catch (e) {
        this.studentOptions = []
      } finally {
        this.studentsLoading = false
      }
    },
    onStudentKeywordInput() {
      if (this.studentSearchTimer) clearTimeout(this.studentSearchTimer)
      this.studentSearchTimer = setTimeout(() => this.fetchStudents(), 300)
    },
    onStudentRadio(row) {
      this.pickedStudentId = row._id
      this.pickedStudent = row
    },
    onStudentPick(row) {
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
      // 2026-06-22: 列表已过滤 hasPet=false；后端也 422 兜底。移除"已有宠物仍强建"确认。
      this.adopting = true
      try {
        const r = await petAdminApi.adoptOnBehalf(this.pickedStudentId)
        ElMessage.success(`已为【${this.pickedStudent?.name}】领养宠物（蛋状态），可在列表查看`)
        this.adoptDialogVisible = false
        await this.fetchList()
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
      // el-tag 的 type 校验只接受 primary/success/info/warning/danger，
      // fallback 不能用空串，否则脏 tier 数据会触发 Invalid prop 警告。
      return { C: 'info', B: 'primary', A: 'warning', S: 'danger' }[t] || 'info'
    },
    hungerColor(h, max = 1000) {
      // 2026-06-23: maxHunger 改 1000，按百分比判断颜色（保持视觉一致）
      const p = max > 0 ? (h / max) * 100 : 0
      if (p < 30) return '#F56C6C'
      if (p < 60) return '#E6A23C'
      return '#67C23A'
    },
    // 2026-06-23: 行级有效衰减（species 决定）
    rowEffectiveDecay(row) {
      return effectiveHungerDecayMinutes(row, 60)
    }
  }
}
</script>

<style scoped>
.page { padding: 0; }
</style>