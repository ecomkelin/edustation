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

      <!-- 2026-06-22: 最近事件板块已移除，挪到 PetAdmin.vue 列表行的「事件」按钮弹窗 -->

      <!-- 2026-06-22: 背包/已解锁 区（admin 端查学员买了哪些 / 解锁了哪些装饰的入口） -->
      <!-- 2026-06-22: 已解锁 + 已装备二态视觉对齐 — 装备中的用 dark effect + ✓ 标记,
           跨页 (详情弹窗 / 课堂展示) 用同一套 unlockedEntriesBySlot 渲染逻辑,信息保持一致 -->
      <el-divider content-position="left">已解锁 · 背包 (read-only)</el-divider>
      <div class="backpack-grid">
        <div v-for="slot in PET_ITEM_SLOTS" :key="slot" class="slot-cell">
          <div class="slot-title">
            {{ PET_ITEM_SLOT_LABELS[slot] }}
            <el-tag
              v-if="pet.equipped?.[slot]"
              type="success"
              effect="dark"
              size="small"
              style="margin-left:6px"
            >
              当前装备: {{ itemMap[pet.equipped?.[slot]]?.name || pet.equipped?.[slot] }}
            </el-tag>
          </div>
          <div class="slot-items">
            <!-- 2026-06-22: SVG/image 缩略图 + name chip -->
            <div
              v-for="entry in entriesFor[slot]"
              :key="slot + ':' + entry.key"
              class="chip"
              :class="{ active: pet.equipped?.[slot] === entry.key }"
              :title="entry.name"
            >
              <span class="chip-thumb">
                <img v-if="entry.visualType === 'image' && entry.imageFile?.url" :src="entry.imageFile.url" :alt="entry.name" />
                <span v-else-if="entry.visualType === 'svg' && entry.svgContent" class="chip-svg" v-html="entry.svgContent" />
                <span v-else class="chip-emoji">🎁</span>
              </span>
              <span class="chip-name">{{ entry.name }}</span>
              <el-tag v-if="pet.equipped?.[slot] === entry.key" type="success" size="small" effect="dark">✓ 已装备</el-tag>
            </div>
            <span v-if="!entriesFor[slot] || entriesFor[slot].length === 0" class="empty">—</span>
          </div>
        </div>
      </div>

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
        <!-- 2026-06-22: 手动升阶按钮（满级 + 经验达标时才显示） -->
        <el-tooltip :disabled="canTierUpNow" :content="canTierUpNow ? `升到 ${nextTierLabel} 阶（不扣积分）` : '需满级且经验达标'" placement="top">
          <el-button type="danger" :disabled="!canTierUpNow" @click="onTierUp">代升阶</el-button>
        </el-tooltip>
        <!-- 2026-06-22: 代喂食 已移至列表行 (PetAdmin.vue) -->
        <el-tooltip :disabled="pet.state === 'alive'" content="仅存活状态可置换" placement="top">
          <el-button type="warning" :disabled="pet.state !== 'alive'" @click="onSwap">代置换</el-button>
        </el-tooltip>
        <el-tooltip :disabled="pet.state === 'alive'" content="仅存活状态可降阶（仅 B/A/S 可降）" placement="top">
          <el-button type="info" :disabled="pet.state !== 'alive' || !canTierDown" @click="tierDownDialog = true">代降阶</el-button>
        </el-tooltip>
        <!-- 2026-06-22: 代喂食 / 课堂展示 已移至列表行 (PetAdmin.vue) -->
        <!-- 2026-06-22 pet-shop：代买装饰/代买食物（扣学员积分） -->
        <el-tooltip :disabled="pet.state === 'dead'" content="从学员积分扣费购买装饰（解锁进背包）" placement="top">
          <el-button type="warning" :disabled="pet.state === 'dead'" @click="grantItemDialog = true">
            <el-icon style="margin-right:4px;vertical-align:-2px"><ShoppingCart /></el-icon>代买装饰
          </el-button>
        </el-tooltip>
        <el-tooltip :disabled="pet.state === 'alive'" content="从学员积分扣费购买食物/玩具（立即喂一次）" placement="top">
          <el-button type="success" :disabled="pet.state !== 'alive'" @click="grantConsumableDialog = true">
            <el-icon style="margin-right:4px;vertical-align:-2px"><ShoppingCart /></el-icon>代买食物
          </el-button>
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

    <!-- 2026-06-22: 代喂食 dialog 已移至列表行 (PetAdmin.vue)，此处不再渲染 -->

    <!-- 代降阶 dialog -->
    <el-dialog v-model="tierDownDialog" title="代降阶" width="420px">
      <el-form>
        <el-form-item label="目标阶">
          <el-radio-group v-model="tierDownTarget">
            <el-radio v-for="t in lowerTiers" :key="t" :value="t">{{ PET_TIER_LABELS[t] }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tierDownDialog = false">取消</el-button>
        <el-button type="primary" :loading="actioning" :disabled="!tierDownTarget" @click="onTierDown">确认</el-button>
      </template>
    </el-dialog>

    <!-- 2026-06-22 pet-shop：代买装饰/代买食物 -->
    <GrantOnBehalfDialog
      v-model="grantItemDialog"
      kind="item"
      :pet-account-id="petId"
      :student-tier="pet?.tier || pet?.eggTier || null"
      @success="onActionSuccess"
    />
    <GrantOnBehalfDialog
      v-model="grantConsumableDialog"
      kind="consumable"
      :pet-account-id="petId"
      :student-tier="pet?.tier || pet?.eggTier || null"
      @success="onActionSuccess"
    />

    <!-- 2026-06-22: 破壳特效覆盖层 -->
    <HatchAnimation
      v-model:visible="hatchAnimVisible"
      :species-record="hatchResultSpecies"
      :equipped="hatchResultEquipped"
      :item-map="hatchResultItemMap"
      @close="onHatchAnimClose"
    />
  </el-dialog>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { ShoppingCart } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import { petCatalogApi } from '@/api/petCatalog'
import * as petUtil from '@/utils/pet'
import GrantOnBehalfDialog from '@/components/Pet/GrantOnBehalfDialog.vue'
import PetEquipmentOverlay from '@/components/Pet/PetEquipmentOverlay.vue'
import HatchAnimation from '@/components/Pet/HatchAnimation.vue'
import { formatDate } from '@/utils/format'
import { PET_TIERS, PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS } from '@/utils/constants'

export default {
  name: 'PetDetailDialog',
  components: { GrantOnBehalfDialog, PetEquipmentOverlay, HatchAnimation, ShoppingCart },
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
      tierDownDialog: false,
      tierDownTarget: '',
      grantItemDialog: false,
      grantConsumableDialog: false,
      actioning: false,
      // 2026-06-22: 背包 lookup（key → name/slot）；一次拉取，多次复用
      itemMap: {},
      // 2026-06-22: 破壳特效
      hatchAnimVisible: false,
      hatchResultSpecies: null,
      hatchResultEquipped: {},
      hatchResultItemMap: {},
      // 2026-06-23 fix #3: 背包条目数组对象，按 slot 键存数组，由 watch 派生。
      // 原因: 用 computed + [slot] 索引的写法被 vite 6 + vue 3.5 编译成 $options.xxx[slot],
      //       $options.xxx 是 computed 函数本体,函数[slot] = undefined → 后续 .hat 崩。
      //       method 路径 $options.xxx(slot) 调用时 Vue runtime 不会自动 bind this,
      //       method body 内 this.pet 也是 undefined。
      //       用 data 字段对象(非函数)最稳,模板走 $data.entriesFor[slot] → 正常返回数组。
      entriesFor: { hat: [], scarf: [], clothes: [], accessory: [], halo: [], background: [] },
      PET_TIERS, PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS
    }
  },
  computed: {
    canTierDown() {
      if (!this.pet?.tier) return false
      const idx = PET_TIERS.indexOf(this.pet.tier)
      return idx > 0
    },
    // 2026-06-22: 手动升阶前置条件
    canTierUpNow() {
      if (!this.pet || this.pet.state !== 'alive') return false
      if (!this.pet.tierUpThreshold || !this.pet.level) return false
      if (this.pet.level < 10) return false
      if ((this.pet.experience || 0) < this.pet.tierUpThreshold) return false
      if (this.pet.tier === 'S') return false
      return true
    },
    nextTierLabel() {
      const order = ['C', 'B', 'A', 'S']
      const idx = order.indexOf(this.pet?.tier)
      if (idx < 0 || idx >= order.length - 1) return ''
      return order[idx + 1]
    },
    lowerTiers() {
      if (!this.pet?.tier) return []
      const idx = PET_TIERS.indexOf(this.pet.tier)
      return PET_TIERS.slice(0, idx)
    },
    /**
     * 2026-06-22: 背包视图 — 按 slot 汇总 pet.unlocked[slot]，每项含 name/key
     * 已装备的用 success tag 高亮
     *
     * ⚠️ 2026-06-23 fix #3: 全部改用 data 字段 + watch 派生
     * 原因: vue3 SFC compiler 在 options API 下把模板里的 computed 索引访问编译成
     *       `$options.xxx[slot]`,而 $options.xxx 是 computed 函数本体(非 getter),
     *       导致 `function()[slot]` 是 undefined → `undefined.hat` 崩。
     *       method 路径 `$options.xxx(slot)` 调用时 Vue runtime 不会自动 bind this,
     *       method body 内 `this.pet` 也是 undefined。
     *       唯一稳的方案: 把派生结果存到 data 字段,模板走 `$data.entriesForHat` (data 字段)
     *       编译器不会用 $options 替代,绝对安全。
     */
  },
  watch: {
    petId: {
      immediate: true,
      handler(id) {
        if (id) this.fetchDetail()
      }
    },
    // 2026-06-23 fix #3: 监听 pet.unlocked + itemMap 重新派生 6 个 entriesFor* 数组
    'pet.unlocked': {
      immediate: true,
      deep: true,
      handler() { this.recomputeEntries() }
    },
    itemMap: {
      immediate: true,
      deep: true,
      handler() { this.recomputeEntries() }
    }
  },
  computed: {
    hungerMinutesLeft() {
      if (!this.pet || this.pet.state !== 'alive') return null
      return Math.max(0, (this.pet.currentHunger || 0) * this.effectiveHungerDecayMinutes)
    },
    // 2026-06-23: 三级优先级 (pet > species > 平台)
    effectiveHungerDecayMinutes() {
      // 2026-06-23: species 决定；platformDefault=60 是兜底（species 一定有值）
      // 三重 optional chaining 防止 pet/speciesRecord 在异步加载瞬间是 undefined
      try {
        const v = petUtil.effectiveHungerDecayMinutes(this.pet, 60)
        return (v && v > 0) ? v : 60
      } catch (_) {
        return 60
      }
    }
  },
  methods: {
    // 2026-06-23 fix #3: 由 watch('pet.unlocked' + itemMap) 触发
    recomputeEntries() {
      const unlocked = this.pet?.unlocked || {}
      const out = this.entriesFor || {}
      for (const slot of PET_ITEM_SLOTS) {
        const arr = Array.isArray(unlocked[slot]) ? unlocked[slot] : []
        out[slot] = arr.map(key => {
          const it = this.itemMap[key]
          return {
            key,
            name: (it && it.name) || key,
            visualType: it?.visualType,
            svgContent: it?.svgContent || null,
            imageFile: it?.imageFile || null
          }
        })
      }
      this.entriesFor = { ...out }
    },
    formatMinutesLeft(min) {
      if (min == null) return '—'
      if (min < 60) return `${min} 分钟`
      if (min < 1440) return `${(min / 60).toFixed(1)} 小时`
      return `${(min / 1440).toFixed(1)} 天`
    },
    async fetchDetail() {
      // 背包区需要 item.name → 一次性拉 items 建 map
      if (Object.keys(this.itemMap).length === 0) {
        this.loadItemMap()
      }
      try {
        const r = await petAdminApi.get(this.petId)
        // 兼容 http 拦截器两种状态：return body（不 unpack）/ return body.data（unpack）
        const payload = r?.data?.pet ? r.data : r
        this.pet = payload?.pet || null
        this.editForm = {
          currentHunger: this.pet?.currentHunger ?? 100,
          nickname: this.pet?.nickname || '',
          lastFedAt: this.pet?.lastFedAt ? new Date(this.pet.lastFedAt) : null,
          reason: ''
        }
        // 2026-06-23 fix #3: fetchDetail 完成后立即重派生（不依赖 watch 时序）
        this.recomputeEntries()
      } catch (e) {
        this.pet = null
      }
    },
    async loadItemMap() {
      // 平台共享 catalog，无需 org；拉全量后建 key→{name,slot,visualType,svgContent,imageFile} map
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
      } catch (e) {
        // 拉失败 → 退化显示 key，UI 不报错
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
    async onHatch() {
      try {
        await ElMessageBox.confirm(
          `确认执行 代破壳？蛋会随机孵化出 ${this.pet?.eggTier || '当前阶'} 阶宠物。`,
          '提示',
          { type: 'success', confirmButtonText: '开始破壳', cancelButtonText: '取消' }
        )
      } catch (_) { return }
      this.actioning = true
      try {
        // 先调接口拿到新 species，再播动画（让蹦出来的宠物是真实结果）
        const r = await petAdminApi.hatchOnBehalf(this.petId)
        // 兼容 http 拦截器两种状态
        const payload = r?.data?.petAccount ? r.data : r
        const newPet = payload?.petAccount || null
        if (!newPet) throw new Error('接口返回无 petAccount')

        // 准备 speciesRecord：从 _petCatalog 静态数据查（或后端返回带 speciesRecord 字段）
        // hatch 返回里通常只有 species key，需要查一次 species 详情
        // 简单方案：调一次 detail 拿完整 speciesRecord
        const detail = await petAdminApi.get(this.petId)
        const detailPayload = detail?.data?.pet ? detail.data : detail
        const decoratedPet = detailPayload?.pet || newPet

        // 准备动画所需：speciesRecord + equipped + itemMap
        this.hatchResultSpecies = decoratedPet.speciesRecord || null
        this.hatchResultEquipped = decoratedPet.equipped || {}
        this.hatchResultItemMap = this.itemMap || {}

        // 播放特效
        this.hatchAnimVisible = true
      } catch (e) {
        if (e === 'cancel') return
        ElMessage.error(e?.response?.data?.message || e?.message || '破壳失败')
      } finally {
        this.actioning = false
      }
    },
    onHatchAnimClose() {
      // 动画结束：刷新详情 + 通知父组件
      this.hatchResultSpecies = null
      this.hatchResultEquipped = {}
      this.onActionSuccess()
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
    // 2026-06-22: 手动升阶（满级 + 经验达标时主动触发；不扣积分）
    async onTierUp() {
      const nextLabel = PET_TIER_LABELS[this.nextTierLabel] || this.nextTierLabel
      await this.confirmAction(`代升阶到 ${nextLabel}（0 积分，种类保留）`, async () => {
        await petAdminApi.tierUpOnBehalf(this.petId)
      })
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
.backpack-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.backpack-grid .slot-cell {
  background: rgba(0,0,0,0.02);
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
}
.backpack-grid .slot-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}
.backpack-grid .slot-items { min-height: 24px; line-height: 22px; }
.backpack-grid .empty { color: #c0c4cc; font-size: 12px; }

/* 2026-06-22: 背包 chip (缩略图 + 名称) */
.backpack-grid .chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 2px;
  margin: 2px;
  border: 1px solid #dcdfe6;
  border-radius: 14px;
  background: #fff;
  vertical-align: middle;
}
.backpack-grid .chip.active {
  border-color: #67c23a;
  background: #f0f9eb;
}
.backpack-grid .chip-thumb {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fafbfc, #f0f2f5);
  border-radius: 50%;
  overflow: hidden;
}
.backpack-grid .chip-thumb img,
.backpack-grid .chip-thumb .chip-svg :deep(svg) {
  max-width: 18px;
  max-height: 18px;
  object-fit: contain;
}
.backpack-grid .chip-thumb .chip-emoji { font-size: 12px; }
.backpack-grid .chip-name { font-size: 12px; color: #303133; }
</style>
