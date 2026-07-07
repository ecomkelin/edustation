<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="宠物详情"
    width="720px"
  >
    <div v-if="pet" class="detail-content">
      <!-- 2026-06-22: 顶部加宠物图 + 装备叠加层 — 与课堂展示页面对齐
           蛋/死态走 emoji 占位；存活态用 PetEquipmentOverlay 渲染物种图 + 已装备装饰 -->
      <div v-if="pet.state === 'alive' && pet.speciesRecord" class="pet-preview">
        <PetEquipmentOverlay
          :species-record="pet.speciesRecord"
          :equipped="pet.equipped || {}"
          :item-map="itemMap"
          mode="dialog"
          fallback-emoji="🐾"
        />
      </div>
      <div v-else-if="pet.state === 'egg'" class="pet-preview-pet">
        🥚
        <div class="hint">蛋</div>
      </div>
      <div v-else-if="pet.state === 'dead'" class="pet-preview-pet dead">
        💀
        <div class="hint">已死亡</div>
      </div>

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
        <el-descriptions-item label="饱腹度">
          {{ pet.currentHunger }} / {{ pet.maxHunger }}
          <span v-if="pet.state === 'alive'" style="color:#909399;font-size:12px;margin-left:6px">
            (每 {{ effectiveHungerDecayMinutes }} 分钟 -1, 剩 {{ formatMinutesLeft(hungerMinutesLeft) }})
          </span>
          <span v-else-if="pet.state === 'egg'" style="color:#909399;font-size:12px;margin-left:6px">(蛋态不减)</span>
        </el-descriptions-item>
        <el-descriptions-item label="最后喂食">{{ formatDate(pet.lastFedAt) }}</el-descriptions-item>
        <el-descriptions-item label="死亡阈值">{{ pet.deathThresholdDays }} 天</el-descriptions-item>
      </el-descriptions>

      <!-- 2026-07-07: 删除「已解锁·背包」+「代操作」两块 (代喂食在课堂展示里, 详情弹窗只展示不可写) -->

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
  </el-dialog>
</template>

<script>
import { ElMessage } from 'element-plus'
import { petAdminApi } from '@/api/pet'
import { petCatalogApi } from '@/api/petCatalog'
import * as petUtil from '@/utils/pet'
import PetEquipmentOverlay from '@/components/Pet/PetEquipmentOverlay.vue'
import { formatDate } from '@/utils/format'

export default {
  name: 'PetDetailDialog',
  components: { PetEquipmentOverlay },
  props: {
    modelValue: { type: Boolean, default: false },
    petId: { type: String, default: null }
  },
  emits: ['update:modelValue', 'updated'],
  data() {
    return {
      pet: null,
      editForm: { currentHunger: 100, nickname: '', lastFedAt: null, reason: '' },
      saving: false,
      // 2026-06-22: itemMap 给 PetEquipmentOverlay 装备叠加层用 (key → {name, svgContent, imageFile})
      itemMap: {}
    }
  },
  computed: {
    hungerMinutesLeft() {
      if (!this.pet || this.pet.state !== 'alive') return null
      return Math.max(0, (this.pet.currentHunger || 0) * this.effectiveHungerDecayMinutes)
    },
    // 2026-06-23: 三级优先级 (pet > species > 平台)
    effectiveHungerDecayMinutes() {
      try {
        const v = petUtil.effectiveHungerDecayMinutes(this.pet, 60)
        return (v && v > 0) ? v : 60
      } catch (_) {
        return 60
      }
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
    formatMinutesLeft(min) {
      if (min == null) return '—'
      if (min < 60) return `${min} 分钟`
      if (min < 1440) return `${(min / 60).toFixed(1)} 小时`
      return `${(min / 1440).toFixed(1)} 天`
    },
    async fetchDetail() {
      // 顶部装备叠加层需要 item.svgContent/imageFile → 一次性拉 items 建 map
      if (Object.keys(this.itemMap).length === 0) {
        this.loadItemMap()
      }
      try {
        const r = await petAdminApi.get(this.petId)
        const payload = r?.data?.pet ? r.data : r
        this.pet = payload?.pet || null
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
    async loadItemMap() {
      // 平台共享 catalog，无需 org；拉全量后建 key → {name, slot, visualType, svgContent, imageFile} map
      try {
        const { data } = await petCatalogApi.listItems({ pageSize: 100 })
        const map = {}
        for (const it of (data.items || [])) {
          map[it.key] = {
            name: it.name,
            slot: it.slot,
            visualType: it.visualType,
            svgContent: it.svgContent || null,
            imageFile: it.imageFile || null
          }
        }
        this.itemMap = map
      } catch (_) {
        this.itemMap = {}
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
    formatDate,
    stateLabel(s) {
      return { egg: '蛋', alive: '存活', dead: '死亡' }[s] || s
    }
  }
}
</script>

<style scoped>
.detail-content { padding: 0 16px; }

/* 2026-06-22: 顶部宠物图预览区 — 与课堂展示共享 PetEquipmentOverlay */
.pet-preview {
  display: flex;
  justify-content: center;
  padding: 16px 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
  border-radius: 8px;
  margin-bottom: 12px;
}
.pet-preview-pet {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 0;
  font-size: 120px;
  line-height: 1;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  margin-bottom: 12px;
  color: #aaa;
}
.pet-preview-pet.dead { opacity: 0.5; }
.pet-preview-pet .hint { font-size: 14px; margin-top: 8px; }
</style>
