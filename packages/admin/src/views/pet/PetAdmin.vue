<!--
  PetAdmin.vue (2026-07-17 重构)

  拆 2 个 tab：
    - 「宠物列表」(name=list): 一行 = 一学员 (聚合其所有 pet); 默认默认宠物。
                          行操作 3 个: 详情 / 课堂展示 / 流水 (跳当前页 Tab2 自动预填 studentId)
    - 「宠物流水」(name=flow): 跨学员全量 PetEvent 流水平台 (搬并扩展原 PetShopOrders.vue)。
                          4 重过滤: 学员 / 宠物 (按 studentId 拉取该学员所有 pet 列表) /
                                    事件类型 (合并 student+admin 8 类) / 操作人。
                          涵盖 领养/破壳/喂食/弃养/设默认/升级/死亡+复活/买食物/admin 调整。
                          ?studentId=&petId=&keyword= 深链预填; 单宠物视角被宠物下拉覆盖 (替代原 PetEventsDialog 弹窗)。

  URL 持久化：activeTab 写回 ?tab=flow (默认隐藏 query, 路径保持 /pet)。
  路由保留 /pet/shop-orders → /pet?tab=flow redirect 以兼容历史链接。
-->
<template>
  <div class="page">
    <h2>宠物管理</h2>

    <el-tabs v-model="activeTab" class="page__tabs">
      <!-- ═══════ Tab 1 · 宠物列表 ═══════ -->
      <el-tab-pane label="宠物列表" name="list">
        <el-card style="margin-top: 16px">
          <el-form inline :model="listFilters" @submit.prevent="fetchList">
            <el-form-item label="学员">
              <el-input v-model="listFilters.keyword" placeholder="按学员名搜索" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item label="含宠物状态">
              <el-select v-model="listFilters.state" placeholder="全部" clearable style="width: 120px">
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
          <!-- 种类列里 inline 显示「N 只 / M 种」 + 去重种类 tag -->
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
          <!-- 操作: 一行 = 一学员 -->
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button size="small" :disabled="!row.defaultPet" @click="openDetail(row.defaultPet)">详情</el-button>
              <el-tooltip content="新窗口打开课堂展示页（老师投影给全班看，含喂食操作）" placement="top">
                <el-button size="small" type="primary" plain @click="openClassroom(row)">课堂展示</el-button>
              </el-tooltip>
              <el-button size="small" plain @click="goFlowByStudent(row)">
                <el-icon style="margin-right:2px;vertical-align:-2px"><Tickets /></el-icon>流水
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="listPage"
          v-model:page-size="listPageSize"
          :total="listTotal"
          layout="total, prev, pager, next"
          style="margin-top: 16px"
          @current-change="fetchList"
        />

        <!-- 详情弹窗 -->
        <PetDetailDialog v-model="detailVisible" :pet-id="selectedPetId" @updated="onDetailUpdated" />

        <!-- 代领养弹窗 -->
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
      </el-tab-pane>

      <!-- ═══════ Tab 2 · 宠物流水 (2026-07-17 搬并扩展自 PetShopOrders.vue) ═══════ -->
      <el-tab-pane label="宠物流水" name="flow">
        <el-card style="margin-top: 16px">
          <el-form inline :model="flowFilters" @submit.prevent="fetchFlow">
            <el-form-item label="学员">
              <el-input
                v-model="flowFilters.keyword"
                placeholder="按学员名搜索"
                clearable
                style="width: 200px"
                @clear="fetchFlow"
              />
            </el-form-item>
            <el-form-item label="事件类型">
              <el-select
                v-model="flowFilters.typeGroup"
                placeholder="全部"
                clearable
                style="width: 160px"
                @change="fetchFlow"
              >
                <el-option label="领养"           value="adopt" />
                <el-option label="破壳"           value="hatch" />
                <el-option label="喂食"           value="feed" />
                <el-option label="弃养"           value="abandon" />
                <el-option label="设为默认"       value="set_default" />
                <el-option label="升级"           value="levelup" />
                <el-option label="死亡/复活"      value="death_rebirth" />
                <el-option label="买食物"         value="purchase_consumable" />
                <el-option label="admin 字段调整" value="admin_override" />
              </el-select>
            </el-form-item>
            <el-form-item label="宠物">
              <el-select
                v-model="flowFilters.petId"
                placeholder="全部宠物"
                clearable
                :disabled="!flowFilters.studentId || studentPets.length === 0"
                style="width: 200px"
                @change="fetchFlow"
              >
                <el-option
                  v-for="p in studentPets"
                  :key="p._id"
                  :value="p._id"
                  :label="petOptionLabel(p)"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="操作人">
              <el-radio-group v-model="flowFilters.by" @change="fetchFlow">
                <el-radio value="">全部</el-radio>
                <el-radio value="student">学员/家长</el-radio>
                <el-radio value="admin">老师代发</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="fetchFlow">查询</el-button>
              <el-button @click="resetFlowFilter">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-table :data="flowList" v-loading="flowLoading" stripe style="margin-top: 16px">
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <!-- 2026-07-17: 学员列 优先 payload.studentName (snapshot, 写时已注入) → populate 拍平字段 (老事件无 snapshot 走这条) → 老 fallback -->
          <el-table-column label="学员" width="120">
            <template #default="{ row }">
              <span v-if="row.payload?.studentName">{{ row.payload.studentName }}</span>
              <span v-else-if="row.populatedStudentName">{{ row.populatedStudentName }}</span>
              <span v-else-if="row.student?.name">{{ row.student.name }}</span>
              <span v-else-if="row.studentName">{{ row.studentName }}</span>
              <span v-else style="color:#909399">学员已删</span>
            </template>
          </el-table-column>
          <!-- 2026-07-17: 目标宠物列 — 7 层兜底 (snapshot → 拍平 populate → 子文档 populate → ObjectId → 已弃养) -->
          <el-table-column label="目标宠物" width="180">
            <template #default="{ row }">
              <div class="flow-target-pet">
                <span v-if="petLabel(row)" class="flow-target-pet__name">{{ petLabel(row) }}</span>
                <span v-else class="flow-target-pet__abandoned">已弃养</span>
                <code class="flow-target-pet__id">{{ shortId(row.petAccount?._id || row.petAccount) }}</code>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="事件类型" width="120">
            <template #default="{ row }">
              <el-tag :type="typeTagType(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作人" width="100">
            <template #default="{ row }">
              <el-tag
                :type="row.payload?.by === 'admin' ? 'warning' : 'success'"
                size="small"
              >{{ row.payload?.by === 'admin' ? '老师/admin' : '学员/家长' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="项目/积分" width="180">
            <template #default="{ row }">
              <!-- 2026-07-17: 兼容 admin_feed / admin_purchase_consumable (admin/老师代喂食物也是同种事件, 只是 by=admin) -->
              <span v-if="(row.type === 'purchase_consumable' || row.type === 'admin_purchase_consumable') && row.payload?.consumableKey">
                <el-tag size="small" effect="plain">买</el-tag> {{ foodLabel(row.payload.consumableKey) }}
              </span>
              <span v-else-if="(row.type === 'feed' || row.type === 'admin_feed') && row.payload?.consumableKey">
                <el-tag size="small" type="success" effect="plain">喂</el-tag> {{ foodLabel(row.payload.consumableKey) }}
              </span>
              <span v-else-if="row.type === 'levelup'">
                Lv.{{ row.payload?.fromLevel }} → Lv.{{ row.payload?.toLevel }}
              </span>
              <span v-else-if="row.type === 'admin_override'">
                {{ row.payload?.field }} · {{ row.payload?.reason || '—' }}
              </span>
              <span v-else style="color:#909399">—</span>
            </template>
          </el-table-column>
          <el-table-column label="积分" width="80">
            <template #default="{ row }">
              <span
                v-if="row.payload?.pointCost != null || row.payload?.cost != null"
                style="color:#f5222d;font-weight:600"
              >-{{ row.payload.pointCost ?? row.payload.cost }}</span>
              <span v-else style="color:#c0c4cc">—</span>
            </template>
          </el-table-column>
          <el-table-column label="详情" min-width="260">
            <template #default="{ row }">
              <!-- eslint-disable-next-line vue/no-v-html -- 2026-07-17: payloadSummary() 内部已 escape 所有字符串字段, 安全; 否则不能渲染多行 -->
              <div class="flow-detail" v-html="payloadSummary(row)" />
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="flowPage"
          v-model:page-size="flowPageSize"
          :total="flowTotal"
          layout="total, prev, pager, next"
          style="margin-top: 16px"
          @current-change="fetchFlow"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
import { ElMessage } from 'element-plus'
import { Plus, Tickets } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import { studentApi } from '@/api/student'
import { effectiveHungerDecayMinutes } from '@/utils/pet'
import { formatDate } from '@/utils/format'
import PetDetailDialog from './PetDetailDialog.vue'

// ── 2026-07-17: 类型合并: 下拉 value → 多个底层 PetEvent.type (合并 student + admin 同语义)
// 后端 listEvents 接受 type=arr1,arr2 自动转 $in (见 petAdmin.service.js:140-143)
const TYPE_GROUP_MAP = {
  adopt:               ['adopt', 'admin_adopt'],
  hatch:               ['hatch', 'admin_hatch'],
  feed:                ['feed', 'admin_feed'],
  abandon:             ['abandon', 'admin_abandon'],
  set_default:         ['set_default', 'admin_set_default'],
  levelup:             ['levelup'],
  death_rebirth:       ['death', 'rebirth'],
  purchase_consumable: ['purchase_consumable'],
  admin_override:      ['admin_override']
}

export default {
  name: 'PetAdmin',
  components: { PetDetailDialog },
  data() {
    return {
      // ── Tab 切换 (URL 持久化) ──
      activeTab: 'list',

      // ── Tab 1: 宠物列表 ──
      listFilters: { keyword: '', state: '' },
      list: [],
      listPage: 1,
      listPageSize: 50,
      listTotal: 0,
      loading: false,
      detailVisible: false,
      selectedPetId: null,

      // 代领养弹窗
      adoptDialogVisible: false,
      studentKeyword: '',
      studentOptions: [],
      studentsLoading: false,
      pickedStudentId: null,
      pickedStudent: null,
      adopting: false,
      studentSearchTimer: null,

      // ── Tab 2: 宠物流水 (2026-07-17 从 PetShopOrders.vue 搬入) ──
      flowFilters: { keyword: '', typeGroup: '', by: '', studentId: '', petId: '' },
      // Tab2 当按学员筛时, 该学员的 pets[] 走 getByStudent 拉取 (覆盖"单宠物"场景, 替代 PetEventsDialog)
      studentPets: [],
      studentPetsLoading: false,
      flowList: [],
      flowPage: 1,
      flowPageSize: 30,
      flowTotal: 0,
      flowLoading: false
    }
  },
  computed: {
    /**
     * 2026-07-17: 一行 = 一学员（不是一宠物）。
     * 把后端 petAdminApi.list 返回的 pets 按 student 聚合。
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
        // 默认宠物优先; 否则取 updatedAt 最早那只
        const def = v.pets.find(x => x.isDefault) ||
                    v.pets.slice().sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0))[0] ||
                    null
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
      rows.sort((a, b) => {
        const aUpd = a.defaultPet ? new Date(a.defaultPet.updatedAt || 0).getTime() : 0
        const bUpd = b.defaultPet ? new Date(b.defaultPet.updatedAt || 0).getTime() : 0
        return bUpd - aUpd
      })
      return rows
    }
  },
  watch: {
    // Tab 切换时把 activeTab 同步到 ?tab=flow (list 时清空 query, URL 保持 /pet)
    activeTab(v) {
      const q = { ...this.$route.query }
      if (v === 'flow') q.tab = 'flow'
      else delete q.tab
      this.$router.replace({ path: '/pet', query: q })
    },
    // 监听路由 query.tab (兼容浏览器前进后退)
    '$route.query.tab'(v) {
      const want = v === 'flow' ? 'flow' : 'list'
      if (want !== this.activeTab) this.activeTab = want
    },
    // 2026-07-17: flowFilters.studentId 变化 → 拉该学员所有 pets[] 供宠物下拉; 同时清 petId
    'flowFilters.studentId'(v, old) {
      if (v === old) return
      this.flowFilters.petId = ''
      this.loadStudentPets()
    }
  },
  mounted() {
    // 1) 从 URL ?tab= 还原 activeTab
    if (this.$route.query.tab === 'flow') this.activeTab = 'flow'

    // 2) URL ?studentId= / ?petId= / ?keyword= 预填 flow 筛选 (从 list 行点「流水」跳过来)
    if (this.$route.query.studentId) this.flowFilters.studentId = String(this.$route.query.studentId)
    if (this.$route.query.petId) this.flowFilters.petId = String(this.$route.query.petId)
    if (this.$route.query.keyword) this.flowFilters.keyword = String(this.$route.query.keyword)

    // 3) 默认拉数据
    this.fetchList()
    if (this.activeTab === 'flow') {
      this.fetchFlow()
      if (this.flowFilters.studentId) this.loadStudentPets()
    }
  },
  methods: {
    // ═══════ Tab 1: 宠物列表 ═══════
    async fetchList() {
      this.loading = true
      try {
        const params = {
          page: this.listPage,
          pageSize: this.listPageSize
        }
        if (this.listFilters.keyword) params.keyword = this.listFilters.keyword
        if (this.listFilters.state) params.state = this.listFilters.state
        const r = await petAdminApi.list(params)
        this.list = r.data?.items || []
        this.listTotal = r.data?.total || 0
      } finally {
        this.loading = false
      }
    },
    openDetail(row) {
      this.selectedPetId = row._id
      this.detailVisible = true
    },
    openClassroom(row) {
      const url = `/class/pet-display?studentId=${row.student}`
      window.open(url, '_blank')
    },
    /**
     * 2026-07-17: 行内「流水」按钮 → 跳当前页 Tab2, 预填 studentId+name
     * 用 router.replace (留历史; 同页 query 改 EP 渲染不重建)
     */
    goFlowByStudent(row) {
      this.$router.replace({
        path: '/pet',
        query: { tab: 'flow', studentId: String(row.student), keyword: row.studentName || '' }
      })
      this.activeTab = 'flow'
      // watch.activeTab 已负责 URL; 这里直接拉数据
      this.fetchFlow()
      this.loadStudentPets()
    },
    onDetailUpdated() {
      this.fetchList()
    },

    // 代领养
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

    // ═══════ Tab 2: 宠物流水 ═══════
    async fetchFlow() {
      this.flowLoading = true
      try {
        const params = {
          page: this.flowPage,
          pageSize: this.flowPageSize
        }
        if (this.flowFilters.keyword) params.keyword = this.flowFilters.keyword
        // 类型合并: 1 个 group 值对应 1-2 个底层 type, 后端转 $in
        if (this.flowFilters.typeGroup) {
          const types = TYPE_GROUP_MAP[this.flowFilters.typeGroup]
          if (types && types.length) params.type = types.join(',')
        }
        // 2026-07-17: Tab2 真正成为单点入口 — studentId+petId 取代 PetEventsDialog 弹窗
        if (this.flowFilters.studentId) params.studentId = this.flowFilters.studentId
        if (this.flowFilters.petId) params.petAccountId = this.flowFilters.petId

        const r = await petAdminApi.events(params)
        let items = r.data?.items || []
        // 前端二次过滤 by=student|admin (payload.by)
        if (this.flowFilters.by) {
          items = items.filter(it => it.payload?.by === this.flowFilters.by)
        }
        this.flowList = items
        this.flowTotal = r.data?.total || 0
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '加载失败')
        this.flowList = []
      } finally {
        this.flowLoading = false
      }
    },
    /**
     * 2026-07-17: 加载当前 flowFilters.studentId 对应的所有宠物
     * (Tab2 "宠物" 下拉数据源; 取代 PetEventsDialog 的单宠物视图)
     */
    async loadStudentPets() {
      if (!this.flowFilters.studentId) {
        this.studentPets = []
        return
      }
      this.studentPetsLoading = true
      try {
        const r = await petAdminApi.getByStudent(this.flowFilters.studentId)
        // 后端返 {pet, pets, recentEvents}
        this.studentPets = r.data?.pets || r.data?.items || (Array.isArray(r.data) ? r.data : [])
      } catch (e) {
        this.studentPets = []
      } finally {
        this.studentPetsLoading = false
      }
    },
    petOptionLabel(pet) {
      // 种类名 (种蛋还是 Lv.几) — 让用户从下拉就能区分
      const state = pet.state
      if (state === 'egg') return '🥚 蛋'
      const name = pet.speciesRecord?.name || pet.species || '—'
      return `${name} · Lv.${pet.level || 1}${pet.isDefault ? ' (默认)' : ''}`
    },
    resetFlowFilter() {
      this.flowFilters = { keyword: '', typeGroup: '', by: '', studentId: '', petId: '' }
      this.studentPets = []
      this.flowPage = 1
      this.fetchFlow()
    },
    // 8 个 group 对应 human-readable 标签
    typeLabel(t) {
      const labels = {
        adopt: '领养', admin_adopt: '领养',
        hatch: '破壳', admin_hatch: '破壳',
        feed: '喂食', admin_feed: '喂食',
        abandon: '弃养', admin_abandon: '弃养',
        set_default: '设默认', admin_set_default: '设默认',
        levelup: '升级',
        death: '死亡', rebirth: '复活',
        purchase_consumable: '买食物',
        admin_override: 'admin 调整'
      }
      return labels[t] || t
    },
    typeTagType(t) {
      return ({
        adopt: 'success', admin_adopt: 'warning',
        hatch: 'success', admin_hatch: 'warning',
        feed: 'success', admin_feed: 'warning',
        abandon: 'danger', admin_abandon: 'danger',
        set_default: 'info', admin_set_default: 'info',
        levelup: 'success',
        death: 'danger', rebirth: 'info',
        purchase_consumable: 'warning',
        admin_override: 'info'
      })[t] || ''
    },
    /**
     * 2026-07-17: 目标宠物显示文本 — 多源回退 (snapshot 优先, 兜底 populate, 再兜底 key)
     * payload.petNickname 是用户改的昵称, petSpecies 是种子 key
     * row.petAccount 是 populate 出来的 (活宠物)
     * row.payload.petAccount (ObjectId) 在旧事件可能有, 但 schema 里 petAccount 在事件顶层, 不在 payload
     *
     * 弃养后 PetAccount 已删: row.petAccount=null, 走 payload snapshot
     */
    petLabel(row) {
      const p = row.payload || {}
      const pa = row.petAccount && typeof row.petAccount === 'object' ? row.petAccount : null
      const nickname = p.petNickname || pa?.nickname || row.populatedPetNickname || null
      const speciesKey = p.petSpecies || pa?.species || row.populatedPetSpecies || null
      const level = p.petLevel ?? pa?.level ?? row.populatedPetLevel ?? null

      if (!nickname && !speciesKey) return ''
      const name = nickname || this.speciesLabel(speciesKey)
      if (level != null && Number.isFinite(level)) return `${name} · Lv.${level}`
      return name
    },
    /**
     * 2026-07-17: species key → 中文名 (静态, 与 seed 3 条对齐)
     * 用户手动添加的 species 仍 fallback 到 key 字符串
     */
    speciesLabel(key) {
      const map = { cat_orange: '橘猫', dog_puppy: '小奶狗', dolphin_blue: '蓝海豚' }
      return map[key] || key || '—'
    },
    /**
     * 2026-07-17: pet id 缩略显示 (ObjectId 24 字符截中间 8 位)
     */
    shortId(idOrObj) {
      const s = idOrObj && typeof idOrObj === 'object' && idOrObj.toHexString
        ? idOrObj.toHexString()
        : (idOrObj == null ? '' : String(idOrObj))
      if (s.length >= 24) return `${s.slice(0, 4)}…${s.slice(-4)}`
      return s || '—'
    },
    /**
     * 2026-07-17: 把 PetEvent.payload 翻译成中文人话摘要, 给"详情"列渲染
     * 不再返 raw JSON; 各类型独立结构化:
     *   feed             → 饱腹变化 + 经验变化 (含食物名)
     *   levelup          → 等级前后
     *   hatch/admin_hatch→ 物种名 + Lv
     *   adopt/admin_adopt→ 蛋状态说明
     *   death            → 死因细节
     *   rebirth          → 复活说明
     *   set_default*     → 设默认说明
     *   abandon*         → 弃养说明
     *   purchase_consumable → 买食物说明
     *   admin_override   → 字段变更前后 + 原因
     *
     * 用 v-html 渲染: <div class="flow-detail-line">...</div>
     */
    payloadSummary(row) {
      const p = row.payload || {}
      const t = row.type
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]))
      const ln = (text, cls = '') =>
        `<div class="flow-detail__line${cls ? ` ${cls}` : ''}">${esc(text)}</div>`

      switch (t) {
        case 'feed':
        case 'admin_feed': {
          const lines = []
          if (p.consumableKey) lines.push(ln(`食物: ${this.foodLabel(p.consumableKey)}`, 'flow-detail__main'))
          if (p.hungerBefore != null && p.hungerAfter != null) {
            lines.push(ln(`饱腹 ${p.hungerBefore} → ${p.hungerAfter}`))
          }
          if (p.expBefore != null && p.expAfter != null) {
            const delta = p.expGain != null ? ` (+${p.expGain})` : ''
            lines.push(ln(`经验 ${p.expBefore} → ${p.expAfter}${delta}`))
          }
          if (p.level != null) lines.push(ln(`当前等级 Lv.${p.level}`))
          return lines.join('') || ln('喂食', 'flow-detail__main')
        }
        case 'levelup': {
          if (p.fromLevel != null && p.toLevel != null) {
            return ln(`从 Lv.${p.fromLevel} 升到 Lv.${p.toLevel}`, 'flow-detail__main')
          }
          return ln('宠物升级', 'flow-detail__main')
        }
        case 'hatch':
        case 'admin_hatch': {
          const species = p.species ? `${p.species}${p.level != null ? ` · Lv.${p.level}` : ''}` : ''
          return ln(species ? `破壳成为 ${species}` : '蛋已破壳', 'flow-detail__main')
        }
        case 'adopt':
        case 'admin_adopt': {
          return ln(p.initialTier ? `领养成功 (初始 TIER-${p.initialTier})` : '领养成功 · 蛋状态', 'flow-detail__main')
        }
        case 'abandon':
        case 'admin_abandon': {
          return ln('该宠物已被弃养 (从本机构永久移除)', 'flow-detail__danger')
        }
        case 'set_default':
        case 'admin_set_default': {
          return ln('设为该学员的默认展示宠物', 'flow-detail__main')
        }
        case 'death': {
          const parts = ['宠物死亡']
          if (p.daysAtZero != null) parts.push(`饱腹归零持续 ${p.daysAtZero} 天`)
          if (p.reason) parts.push(`原因: ${p.reason}`)
          return ln(parts.join(' · '), 'flow-detail__danger')
        }
        case 'rebirth': {
          return ln('死而复生 · 回到蛋状态等待下一次破壳', 'flow-detail__main')
        }
        case 'purchase_consumable': {
          const parts = [`购买 ${p.consumableKey ? this.foodLabel(p.consumableKey) : '消耗品'}`]
          if (p.pointCost != null) parts.push(`消耗 ${p.pointCost} 积分`)
          return ln(parts.join(' · '), 'flow-detail__main')
        }
        case 'admin_override': {
          const field = p.field ? `${p.field}: ` : ''
          const change = (p.oldValue !== undefined && p.newValue !== undefined)
            ? `${p.oldValue} → ${p.newValue}`
            : (p.newValue !== undefined ? `设为 ${p.newValue}` : '')
          const reason = p.reason ? ` (原因: ${p.reason})` : ''
          return ln(`${field}${change}${reason}`, 'flow-detail__main')
        }
        default:
          return ln('—')
      }
    },
    /**
     * 2026-07-17: 消耗品 key → 中文名 (静态映射, 走兜底不返前端未知 key)
     * 与 petCatalog/consumables.js seed 6 条对齐; 新增条目需同步 (理论上 admin CRUD 创建)
     */
    foodLabel(key) {
      const map = {
        food_normal: '普通食物',
        food_premium: '高级食物',
        food_super: '特级食物',
        toy_ball: '小毛球',
        toy_feather: '羽毛逗猫棒',
        toy_musicbox: '八音盒'
      }
      return map[key] || key
    },

    // ─── 工具 ───
    formatDate,
    hungerColor(h, max = 1000) {
      const p = max > 0 ? (h / max) * 100 : 0
      if (p < 30) return '#F56C6C'
      if (p < 60) return '#E6A23C'
      return '#67C23A'
    },
    rowEffectiveDecay(row) {
      return effectiveHungerDecayMinutes(row, 60)
    }
  }
}
</script>

<style scoped>
.page { padding: 0; }
.page__tabs {
  /* 2026-07-17: 让 tabs 和 h2 共行, 紧凑 */
  margin-top: -8px;
}
.page__tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
</style>

<style scoped>
/* 2026-07-17: 流水"详情"列 — 多行布局, 主行加粗, 危险事件红色 */
.flow-detail {
  font-size: 13px;
  line-height: 1.55;
  color: #606266;
}
.flow-detail__line + .flow-detail__line {
  margin-top: 2px;
}
.flow-detail__main {
  color: #303133;
  font-weight: 500;
}
.flow-detail__danger {
  color: #f56c6c;
  font-weight: 500;
}

/* 2026-07-17: 流水"目标宠物"列 — 名字 + 缩略 id, 已弃养文字变灰 */
.flow-target-pet {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  line-height: 1.45;
}
.flow-target-pet__name {
  color: #303133;
  font-weight: 500;
}
.flow-target-pet__abandoned {
  color: #c0c4cc;
  font-style: italic;
}
.flow-target-pet__id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #909399;
  background: #f5f7fa;
  padding: 1px 4px;
  border-radius: 3px;
  align-self: flex-start;
  margin-top: 1px;
}
</style>
