<template>
  <div class="page">
    <h2>宠物管理</h2>

    <el-card style="margin-top: 16px">
      <el-form inline :model="filters" @submit.prevent="fetchList">
        <el-form-item label="学员">
          <el-input v-model="filters.keyword" placeholder="按学员名搜索" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="含宠物状态">
          <el-select v-model="filters.state" placeholder="全部" clearable style="width: 120px">
            <el-option label="含蛋态" value="egg" />
            <el-option label="含存活" value="alive" />
            <el-option label="含死亡" value="dead" />
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

    <el-table :data="studentRows" v-loading="loading" style="margin-top: 16px" stripe>
      <el-table-column prop="studentName" label="学员" width="120" />
      <!-- 2026-07-17: 种类列里 inline 显示「N 只 / M 种」 + 去重种类 tag -->
      <el-table-column label="种类" min-width="240">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="row.petCount > 0 ? 'success' : 'info'"
            style="margin-right:8px"
          >{{ row.petCount }} 只 / {{ row.speciesCount }} 种</el-tag>
          <span v-if="row.speciesList.length === 0" style="color:#c0c4cc">—</span>
          <template v-else>
            <el-tag
              v-for="(s, idx) in row.speciesList"
              :key="idx"
              size="small"
              effect="plain"
              style="margin-right:4px"
            >{{ s.name }}</el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="默认宠物" width="140">
        <template #default="{ row }">
          <template v-if="row.defaultPet">
            <el-tag v-if="row.defaultPet.state === 'alive'" type="success" size="small">{{ row.defaultPet.speciesRecord?.name || '—' }} · Lv.{{ row.defaultPet.level }}</el-tag>
            <el-tag v-else-if="row.defaultPet.state === 'egg'" type="warning" size="small">🥚 蛋</el-tag>
            <el-tag v-else size="small" type="info">—</el-tag>
          </template>
          <span v-else style="color:#c0c4cc">未领养</span>
        </template>
      </el-table-column>
      <el-table-column label="饱腹度" width="160">
        <template #default="{ row }">
          <template v-if="row.defaultPet">
            <el-progress
              v-if="row.defaultPet.state === 'alive'"
              :percentage="Math.round((row.defaultPet.currentHunger / (row.defaultPet.maxHunger || 1000)) * 100)"
              :stroke-width="8"
              :show-text="true"
              :format="() => `${row.defaultPet.currentHunger}/${row.defaultPet.maxHunger || 1000}`"
              :color="hungerColor(row.defaultPet.currentHunger, row.defaultPet.maxHunger || 1000)"
            />
            <span v-else-if="row.defaultPet.state === 'egg'" style="color:#909399;font-size:12px">🥚 蛋态</span>
            <span v-else style="color:#909399;font-size:12px">💀 已死亡</span>
          </template>
          <span v-else style="color:#c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column label="最后喂食" width="160">
        <template #default="{ row }">
          {{ row.defaultPet ? formatDate(row.defaultPet.lastFedAt) : '—' }}
        </template>
      </el-table-column>
      <!-- 操作: 一行 = 一学员，绑默认 pet (若有) -->
      <el-table-column label="操作" width="340" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :disabled="!row.defaultPet" @click="openDetail(row.defaultPet)">详情</el-button>
          <el-tooltip content="新窗口打开课堂展示页（老师投影给全班看，含喂食操作）" placement="top">
            <el-button size="small" type="primary" plain @click="openClassroom(row)">课堂展示</el-button>
          </el-tooltip>
          <el-button size="small" :disabled="!row.defaultPet" @click="openEventsDialog(row.defaultPet)">
            <el-icon style="margin-right:2px;vertical-align:-2px"><Tickets /></el-icon>事件
          </el-button>
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
import { Plus, Tickets } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import { studentApi } from '@/api/student'
import { effectiveHungerDecayMinutes } from '@/utils/pet'
import { formatDate } from '@/utils/format'
import PetDetailDialog from './PetDetailDialog.vue'
import PetEventsDialog from '@/components/Pet/PetEventsDialog.vue'

export default {
  name: 'PetAdmin',
  components: { PetDetailDialog, PetEventsDialog },
  data() {
    return {
      filters: { keyword: '', state: '' },
      list: [],
      page: 1,
      pageSize: 50, // 2026-07-17: 一行=一学员后, 拉更多 pet 才能聚合更多学员
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

      // 单宠物事件流弹窗状态（2026-06-22: 列表行按钮触发）
      eventsDialogVisible: false,
      eventsPetId: null,
      eventsStudentName: ''
    }
  },
  computed: {
    /**
     * 2026-07-17: 一行 = 一学员（不是一宠物）。
     * 把后端 petAdminApi.list 返回的 pets 按 student 聚合：
     *   - 默认宠物 (isDefault=true) 优先；都没有则取最早领养的
     *   - petCount: 该学员的宠物总数
     *   - speciesCount: 去重的种类数
     *   - speciesList: [{key, name}] 去重排序
     */
    studentRows() {
      const map = new Map()
      for (const p of this.list) {
        const sid = String(p.student)
        if (!map.has(sid)) {
          map.set(sid, {
            student: p.student,
            studentName: p.studentName,
            studentGender: p.studentGender,
            pets: []
          })
        }
        map.get(sid).pets.push(p)
      }
      const rows = []
      for (const v of map.values()) {
        // 1) 默认宠物优先；2) 否则取 updatedAt 最早那只
        const def = v.pets.find(x => x.isDefault) ||
                    v.pets.slice().sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0))[0] ||
                    null
        // 3) 种类去重
        const seen = new Set()
        const speciesList = []
        for (const p of v.pets) {
          if (!p.species || seen.has(p.species)) continue
          seen.add(p.species)
          speciesList.push({ key: p.species, name: p.speciesRecord?.name || p.species })
        }
        rows.push({
          student: v.student,
          studentName: v.studentName,
          studentGender: v.studentGender,
          defaultPet: def,
          petCount: v.pets.length,
          speciesCount: speciesList.length,
          speciesList
        })
      }
      // 默认宠物放在第一位，其余按更新时间倒序
      rows.sort((a, b) => {
        const aUpd = a.defaultPet ? new Date(a.defaultPet.updatedAt || 0).getTime() : 0
        const bUpd = b.defaultPet ? new Date(b.defaultPet.updatedAt || 0).getTime() : 0
        return bUpd - aUpd
      })
      return rows
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

    // ─── 课堂展示（列表行） ───
    openClassroom(row) {
      const url = `/class/pet-display?studentId=${row.student}`
      window.open(url, '_blank')
    },

    // ─── 设为默认宠物 ───
    async onSetDefault(row) {
      try {
        await petAdminApi.setDefaultOnBehalf(row._id)
        ElMessage.success(`已将【${row.studentName || '该学员'}】的默认宠物设为此只`)
        await this.fetchList()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || '设置失败')
      }
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