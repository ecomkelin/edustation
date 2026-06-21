<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :title="`宠物 · ${student?.name || ''}`"
    width="640px"
  >
    <div v-loading="loading">
      <div v-if="!pet" class="empty">
        <p>该学员尚未领养宠物</p>
        <el-button v-if="canAdopt" type="primary" :loading="adopting" @click="onAdopt">代领蛋</el-button>
      </div>
      <div v-else class="pet-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="状态">{{ stateLabel(pet.state) }}</el-descriptions-item>
          <el-descriptions-item label="阶">{{ pet.tier || pet.eggTier || '—' }}</el-descriptions-item>
          <el-descriptions-item label="种类">{{ pet.speciesRecord?.name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="等级">Lv.{{ pet.level }}</el-descriptions-item>
          <el-descriptions-item label="经验">{{ pet.experience }} / {{ pet.nextExpToLevel || pet.tierUpThreshold || '—' }}</el-descriptions-item>
          <el-descriptions-item label="饱腹度">{{ pet.currentHunger }} / {{ pet.maxHunger }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">最近事件</el-divider>
        <el-table :data="events" max-height="240" size="small">
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="createdAt" label="时间" width="160">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="payload">
            <template #default="{ row }">
              <code style="font-size: 12px">{{ JSON.stringify(row.payload) }}</code>
            </template>
          </el-table-column>
        </el-table>

        <div class="action-bar">
          <el-button type="primary" @click="openClassroom">课堂展示</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import { ElMessage } from 'element-plus'
import { petAdminApi } from '@/api/pet'
import { formatDate } from '@/utils/format'
import { useUserPerms } from '@/composables/useUserPerms'

export default {
  name: 'PetPanelDialog',
  props: {
    visible: { type: Boolean, default: false },
    student: { type: Object, default: null }
  },
  emits: ['update:visible', 'updated'],
  data() {
    return {
      pet: null,
      events: [],
      loading: false,
      adopting: false
    }
  },
  setup() {
    const { can } = useUserPerms()
    return { canAdopt: can('pet.write') }
  },
  watch: {
    visible: {
      immediate: true,
      handler(v) {
        if (v && this.student?.id) this.fetchData()
      }
    }
  },
  methods: {
    async fetchData() {
      this.loading = true
      try {
        // 用 getByStudent 一次性拿到 pet + recentEvents（admin 课堂展示支持端点）
        const r = await petAdminApi.getByStudent(this.student.id)
        this.pet = r.data?.pet || null
        this.events = r.data?.recentEvents || []
        if (!this.pet) {
          // 兜底：查 events 拿历史（兼容老 path）
          const evR = await petAdminApi.events({ studentId: this.student.id, pageSize: 1 })
          if (evR.data?.items?.[0]?.petAccount) {
            const petR = await petAdminApi.get(evR.data.items[0].petAccount)
            this.pet = petR.data?.pet || null
            this.events = petR.data?.recentEvents || []
          }
        }
      } catch (e) {
        this.pet = null
        this.events = []
      } finally {
        this.loading = false
      }
    },
    async onAdopt() {
      if (!this.student?.id) return
      this.adopting = true
      try {
        await petAdminApi.adoptOnBehalf(this.student.id)
        ElMessage.success('已代领蛋')
        this.$emit('updated')
        await this.fetchData()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '代领蛋失败')
      } finally {
        this.adopting = false
      }
    },
    openClassroom() {
      if (!this.student?.id) return
      const url = `/class/pet-display?studentId=${this.student.id}`
      window.open(url, '_blank')
    },
    formatDate,
    stateLabel(s) {
      return { egg: '蛋', alive: '存活', dead: '死亡' }[s] || s
    }
  }
}
</script>

<style scoped>
.empty { text-align: center; padding: 32px; color: #999; }
.action-bar { margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end; }
</style>
