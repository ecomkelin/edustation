<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="宠物详情"
    width="720px"
  >
    <div v-if="pet" class="detail-content">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="学员">{{ pet.studentName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="昵称">
          {{ pet.nickname || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">{{ stateLabel(pet.state) }}</el-descriptions-item>
        <el-descriptions-item label="阶">{{ pet.tier || pet.eggTier || '—' }}</el-descriptions-item>
        <el-descriptions-item label="种类">{{ pet.speciesRecord?.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="等级">Lv.{{ pet.level }}</el-descriptions-item>
        <el-descriptions-item label="经验">{{ pet.experience }} / {{ pet.nextExpToLevel || pet.tierUpThreshold || '—' }}</el-descriptions-item>
        <el-descriptions-item label="饱腹度">{{ pet.currentHunger }} / {{ pet.maxHunger }}</el-descriptions-item>
        <el-descriptions-item label="最后喂食">{{ formatDate(pet.lastFedAt) }}</el-descriptions-item>
        <el-descriptions-item label="死亡阈值">{{ pet.deathThresholdDays }} 天</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="left">最近事件</el-divider>
      <el-table :data="recentEvents" max-height="240" size="small">
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

      <el-divider content-position="left">代操作 (pet.write · 老师/admin 用)</el-divider>
      <div v-if="pet.state === 'egg'" style="margin-bottom:8px">
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>宠物当前为蛋状态，仅「代破壳」可用。破壳后才会随机出一个种类并解锁「喂食/置换/降阶」。</template>
        </el-alert>
      </div>
      <div v-else-if="pet.state === 'dead'" style="margin-bottom:8px">
        <el-alert type="error" :closable="false" show-icon>
          <template #title>宠物已死亡，所有代操作不可用（仅查看）</template>
        </el-alert>
      </div>
      <div class="action-bar">
        <el-tooltip :disabled="pet.state === 'egg'" content="仅蛋状态可破壳" placement="top">
          <el-button type="success" :disabled="pet.state !== 'egg'" @click="onHatch">代破壳</el-button>
        </el-tooltip>
        <el-tooltip :disabled="pet.state === 'alive'" content="仅存活状态可喂食" placement="top">
          <el-button type="primary" :disabled="pet.state !== 'alive'" @click="feedDialog = true">代喂食</el-button>
        </el-tooltip>
        <el-tooltip :disabled="pet.state === 'alive'" content="仅存活状态可置换" placement="top">
          <el-button type="warning" :disabled="pet.state !== 'alive'" @click="onSwap">代置换</el-button>
        </el-tooltip>
        <el-tooltip :disabled="pet.state === 'alive'" content="仅存活状态可降阶（仅 B/A/S 可降）" placement="top">
          <el-button type="info" :disabled="pet.state !== 'alive' || !canTierDown" @click="tierDownDialog = true">代降阶</el-button>
        </el-tooltip>
        <el-tooltip content="新窗口打开课堂展示页（老师投影给全班看）" placement="top">
          <el-button type="primary" plain @click="openClassroom">课堂展示</el-button>
        </el-tooltip>
      </div>

      <el-divider content-position="left">字段调整 (pet.write)</el-divider>
      <el-form :model="editForm" inline label-width="80px" size="small">
        <el-form-item label="饱腹度">
          <el-input-number v-model="editForm.currentHunger" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickname" maxlength="32" />
        </el-form-item>
        <el-form-item label="最后喂食">
          <el-date-picker v-model="editForm.lastFedAt" type="datetime" />
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input v-model="editForm.reason" placeholder="选填" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSave" :loading="saving">保存</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 代喂食 dialog -->
    <FeedOnBehalfDialog v-model="feedDialog" :pet="pet || null" :student-name="(pet && pet.studentName) || ''" @success="onActionSuccess" />

    <!-- 代降阶 dialog -->
    <el-dialog v-model="tierDownDialog" title="代降阶" width="420px">
      <el-form>
        <el-form-item label="目标阶">
          <el-radio-group v-model="tierDownTarget">
            <el-radio v-for="t in lowerTiers" :key="t" :label="t">{{ PET_TIER_LABELS[t] }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tierDownDialog = false">取消</el-button>
        <el-button type="primary" :loading="actioning" :disabled="!tierDownTarget" @click="onTierDown">确认</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { petAdminApi } from '@/api/pet'
import FeedOnBehalfDialog from '@/components/Pet/FeedOnBehalfDialog.vue'
import { formatDate } from '@/utils/format'
import { PET_TIERS, PET_TIER_LABELS } from '@/utils/constants'

export default {
  name: 'PetDetailDialog',
  components: { FeedOnBehalfDialog },
  props: {
    modelValue: { type: Boolean, default: false },
    petId: { type: String, default: null }
  },
  emits: ['update:modelValue', 'updated'],
  data() {
    return {
      pet: null,
      recentEvents: [],
      editForm: { currentHunger: 100, nickname: '', lastFedAt: null, reason: '' },
      saving: false,
      feedDialog: false,
      tierDownDialog: false,
      tierDownTarget: '',
      actioning: false,
      PET_TIERS, PET_TIER_LABELS
    }
  },
  computed: {
    canTierDown() {
      if (!this.pet?.tier) return false
      const idx = PET_TIERS.indexOf(this.pet.tier)
      return idx > 0
    },
    lowerTiers() {
      if (!this.pet?.tier) return []
      const idx = PET_TIERS.indexOf(this.pet.tier)
      return PET_TIERS.slice(0, idx)
    }
  },
  watch: {
    petId: {
      immediate: true,
      handler(id) {
        if (id) this.fetchDetail()
      }
    }
  },
  methods: {
    async fetchDetail() {
      try {
        const r = await petAdminApi.get(this.petId)
        // 兼容 http 拦截器两种状态：return body（不 unpack）/ return body.data（unpack）
        const payload = r?.data?.pet ? r.data : r
        this.pet = payload?.pet || null
        this.recentEvents = payload?.recentEvents || []
        this.editForm = {
          currentHunger: this.pet?.currentHunger ?? 100,
          nickname: this.pet?.nickname || '',
          lastFedAt: this.pet?.lastFedAt ? new Date(this.pet.lastFedAt) : null,
          reason: ''
        }
      } catch (e) {
        this.pet = null
      }
    },
    async onSave() {
      this.saving = true
      try {
        const payload = {
          currentHunger: this.editForm.currentHunger,
          nickname: this.editForm.nickname || undefined,
          lastFedAt: this.editForm.lastFedAt ? new Date(this.editForm.lastFedAt).toISOString() : undefined,
          reason: this.editForm.reason || 'admin_adjust'
        }
        await petAdminApi.update(this.petId, payload)
        ElMessage.success('已保存')
        this.$emit('updated')
        await this.fetchDetail()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '保存失败')
      } finally {
        this.saving = false
      }
    },
    async onHatch() {
      await this.confirmAction('代破壳', async () => {
        await petAdminApi.hatchOnBehalf(this.petId)
      })
    },
    async onSwap() {
      await this.confirmAction('代置换蛋（扣积分）', async () => {
        await petAdminApi.swapEggOnBehalf(this.petId)
      })
    },
    async onTierDown() {
      if (!this.tierDownTarget) return
      const target = this.tierDownTarget
      this.tierDownDialog = false
      await this.confirmAction(`代降阶到 ${PET_TIER_LABELS[target]}（0 积分）`, async () => {
        await petAdminApi.tierDownOnBehalf(this.petId, { targetTier: target })
      })
      this.tierDownTarget = ''
    },
    async confirmAction(title, fn) {
      try {
        await ElMessageBox.confirm(`确认执行 ${title}？`, '提示', { type: 'warning' })
      } catch (_) { return }
      this.actioning = true
      try {
        await fn()
        ElMessage.success('操作成功')
        this.onActionSuccess()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '操作失败')
      } finally {
        this.actioning = false
      }
    },
    async onActionSuccess() {
      this.$emit('updated')
      await this.fetchDetail()
    },
    openClassroom() {
      if (!this.pet) return
      const stu = this.pet.student
      const studentId = typeof stu === 'object' && stu ? (stu._id || stu.id) : stu
      if (!studentId) return
      const url = `/class/pet-display?studentId=${studentId}`
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
.detail-content { padding: 0 16px; }
.action-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
</style>
