<template>
  <div class="display-page">
    <!-- 顶栏 -->
    <div class="top-bar">
      <div class="title">
        <span class="student-name">{{ pet?.student?.name || '加载中...' }}</span>
        <span class="tier-badge" :class="tierClass">{{ tierLabel }}</span>
        <span class="level">Lv.{{ pet?.level || 0 }}</span>
        <el-tag v-if="pet?.state === 'egg'" type="warning" size="large">蛋</el-tag>
        <el-tag v-if="pet?.state === 'alive'" type="success" size="large">存活</el-tag>
      </div>
      <div class="online-indicator">
        <span class="dot" :class="{ online: !!pollTimer }"></span>
        实时同步
      </div>
      <el-button type="danger" plain @click="onClose">[关闭]</el-button>
    </div>

    <!-- 主体：左大图 + 右数据 -->
    <div class="main">
      <div class="pet-display">
        <div v-if="pet?.state === 'egg'" class="pet-egg">
          🥚
          <div class="hint">蛋</div>
          <el-button v-if="canWrite" type="success" size="large" @click="onHatch" :loading="actioning">代破壳</el-button>
        </div>
        <div v-else-if="pet?.speciesRecord" class="pet-img">
          <img v-if="pet.speciesRecord.visualType === 'image' && pet.speciesRecord.imageFile" :src="pet.speciesRecord.imageFile.url" :alt="pet.speciesRecord.name" />
          <div v-else-if="pet.speciesRecord.visualType === 'svg'" class="svg-wrap" v-html="pet.speciesRecord.svgContent" />
          <div v-else class="emoji-fallback">{{ speciesEmoji }}</div>
          <div class="species-name">{{ pet.speciesRecord.name }}</div>
        </div>
        <div v-else class="pet-empty">
          <el-icon :size="120"><Picture /></el-icon>
          <div class="hint">{{ pet?.species || '无' }}</div>
        </div>
      </div>

      <div class="pet-stats">
        <div class="stat-card">
          <div class="label">经验</div>
          <el-progress
            :percentage="expPercent"
            :stroke-width="32"
            :format="() => `${pet?.experience || 0} / ${pet?.nextExpToLevel || pet?.tierUpThreshold || '?'}`"
            :status="expPercent >= 100 ? 'success' : ''"
          />
          <div v-if="pet?.tierUpThreshold && pet?.level >= 10" class="tierup-hint">
            满级！累计经验 ≥ {{ pet.tierUpThreshold }} 触发升阶
          </div>
        </div>

        <div class="stat-card">
          <div class="label">饱腹度</div>
          <el-progress
            :percentage="hungerPercent"
            :stroke-width="32"
            :format="() => `${pet?.currentHunger || 0} / ${pet?.maxHunger || 100}`"
            :status="hungerPercent < 20 ? 'warning' : hungerPercent === 0 ? 'exception' : ''"
          />
        </div>

        <div class="stat-card">
          <div class="label">已装备</div>
          <div class="equipped-grid">
            <div v-for="slot in PET_ITEM_SLOTS" :key="slot" class="slot-box">
              <div class="slot-label">{{ PET_ITEM_SLOT_LABELS[slot] }}</div>
              <div class="slot-value">{{ pet?.equipped?.[slot] || '—' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="action-bar" v-if="canWrite && pet?.state === 'alive'">
      <el-button type="primary" size="large" @click="feedDialog = true">喂食</el-button>
      <el-button type="success" size="large" :disabled="pet?.state !== 'alive'" @click="onHatch" :loading="actioning">破壳</el-button>
      <el-button type="warning" size="large" @click="onSwap" :loading="actioning">置换</el-button>
      <el-button type="info" size="large" :disabled="!canTierDown" @click="tierDownDialog = true">降阶</el-button>
    </div>

    <!-- 最近事件 -->
    <div class="events-bar">
      <div class="events-title">最近事件</div>
      <el-table :data="recentEvents" max-height="160" size="small" stripe>
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="payload" min-width="320">
          <template #default="{ row }">
            <code style="font-size:11px">{{ JSON.stringify(row.payload) }}</code>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- dialogs -->
    <FeedOnBehalfDialog v-model="feedDialog" :pet="pet" :student-name="pet?.student?.name" @success="refresh" />

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
        <el-button type="primary" :disabled="!tierDownTarget" @click="onTierDown">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import FeedOnBehalfDialog from '@/components/Pet/FeedOnBehalfDialog.vue'
import { useUserPerms } from '@/composables/useUserPerms'
import { formatDate } from '@/utils/format'
import {
  PET_TIERS, PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS
} from '@/utils/constants'

const SPECIES_EMOJI_FALLBACK = {
  cat_orange: '🐱', dog_puppy: '🐶', rabbit_white: '🐰', hamster_gold: '🐹',
  fox_red: '🦊', panda_baby: '🐼', penguin_baby: '🐧', owl_horned: '🦉',
  wolf_arctic: '🐺', deer_white: '🦌', hawk_red: '🦅', dolphin_blue: '🐬',
  dragon_emperor: '🐉', phoenix_fire: '🔥', unicorn_rainbow: '🦄', griffin_gold: '🦅'
}

export default {
  name: 'PetClassroomDisplay',
  components: { FeedOnBehalfDialog },
  setup() {
    const route = useRoute()
    const { can } = useUserPerms()
    const studentId = route.query.studentId
    const pet = ref(null)
    const recentEvents = ref([])
    const pollTimer = ref(null)
    const actioning = ref(false)
    const feedDialog = ref(false)
    const tierDownDialog = ref(false)
    const tierDownTarget = ref('')
    const canWrite = can('pet.write')

    const tierLabel = computed(() => PET_TIER_LABELS[pet.value?.tier] || pet.value?.eggTier || '—')
    const tierClass = computed(() => {
      const t = pet.value?.tier || pet.value?.eggTier
      return `tier-${t ? t.toLowerCase() : 'c'}`
    })
    const expPercent = computed(() => {
      if (!pet.value) return 0
      const next = pet.value.nextExpToLevel
      if (!next) return 100
      return Math.min(100, Math.round((pet.value.experience / next) * 100))
    })
    const hungerPercent = computed(() => {
      if (!pet.value) return 0
      return Math.min(100, Math.round((pet.value.currentHunger / pet.value.maxHunger) * 100))
    })
    const canTierDown = computed(() => {
      if (!pet.value?.tier) return false
      return PET_TIERS.indexOf(pet.value.tier) > 0
    })
    const lowerTiers = computed(() => {
      if (!pet.value?.tier) return []
      const idx = PET_TIERS.indexOf(pet.value.tier)
      return PET_TIERS.slice(0, idx)
    })
    const speciesEmoji = computed(() => SPECIES_EMOJI_FALLBACK[pet.value?.species] || '🐾')

    async function fetchOnce() {
      if (!studentId) {
        ElMessage.error('缺少 studentId')
        return
      }
      try {
        const r = await petAdminApi.getByStudent(studentId)
        pet.value = r.data?.pet || null
        recentEvents.value = r.data?.recentEvents || []
      } catch (e) {
        // ignore（轮询失败不阻塞）
      }
    }

    function refresh() {
      fetchOnce()
    }

    function startPolling() {
      stopPolling()
      pollTimer.value = setInterval(fetchOnce, 3000)
    }
    function stopPolling() {
      if (pollTimer.value) {
        clearInterval(pollTimer.value)
        pollTimer.value = null
      }
    }

    async function doAction(title, fn) {
      if (!pet.value) return
      try {
        await ElMessageBox.confirm(`确认执行 ${title}？`, '提示', { type: 'warning' })
      } catch (_) { return }
      actioning.value = true
      try {
        await fn()
        ElMessage.success('操作成功')
        await fetchOnce()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '操作失败')
      } finally {
        actioning.value = false
      }
    }

    async function onHatch() {
      await doAction('代破壳', () => petAdminApi.hatchOnBehalf(pet.value._id))
    }
    async function onSwap() {
      await doAction('代置换蛋（扣积分）', () => petAdminApi.swapEggOnBehalf(pet.value._id))
    }
    async function onTierDown() {
      const target = tierDownTarget.value
      if (!target) return
      tierDownDialog.value = false
      await doAction(`代降阶到 ${PET_TIER_LABELS[target]}`, () => petAdminApi.tierDownOnBehalf(pet.value._id, { targetTier: target }))
      tierDownTarget.value = ''
    }

    function onClose() {
      if (window.opener) {
        window.close()
      } else {
        // 不是 window.open 打开的 → 回上一页
        history.back()
      }
    }

    onMounted(async () => {
      await fetchOnce()
      startPolling()
    })
    onUnmounted(() => {
      stopPolling()
    })

    return {
      pet, recentEvents, pollTimer, actioning, canWrite,
      feedDialog, tierDownDialog, tierDownTarget,
      tierLabel, tierClass, expPercent, hungerPercent, canTierDown, lowerTiers, speciesEmoji,
      PET_TIERS, PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS,
      Picture,
      refresh, onHatch, onSwap, onTierDown, onClose, formatDate
    }
  }
}
</script>

<style scoped>
.display-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 24px 32px;
  box-sizing: border-box;
  gap: 16px;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px 24px;
}
.top-bar .title {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 32px;
  font-weight: bold;
}
.top-bar .student-name { color: #fff; }
.tier-badge {
  padding: 4px 16px;
  border-radius: 8px;
  font-size: 20px;
  font-weight: bold;
}
.tier-badge.tier-c { background: #909399; color: #fff; }
.tier-badge.tier-b { background: #67c23a; color: #fff; }
.tier-badge.tier-a { background: #e6a23c; color: #fff; }
.tier-badge.tier-s { background: #f56c6c; color: #fff; }
.tier-badge.tier- { background: #909399; color: #fff; }
.top-bar .level { color: #ffd04b; font-size: 24px; }

.online-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #aaa;
}
.online-indicator .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #555;
  display: inline-block;
}
.online-indicator .dot.online {
  background: #67c23a;
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
  overflow: hidden;
}
.pet-display {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}
.pet-display img {
  max-width: 80%;
  max-height: 60vh;
  object-fit: contain;
}
.pet-display .svg-wrap :deep(svg) {
  max-width: 80%;
  max-height: 60vh;
}
.pet-display .emoji-fallback {
  font-size: 280px;
  line-height: 1;
}
.pet-display .species-name {
  font-size: 36px;
  font-weight: bold;
  color: #ffd04b;
}
.pet-display .hint {
  color: #aaa;
  font-size: 16px;
}
.pet-egg { font-size: 240px; line-height: 1; }

.pet-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stat-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
}
.stat-card .label {
  color: #ccc;
  margin-bottom: 12px;
  font-size: 18px;
}
.stat-card .tierup-hint {
  color: #ffd04b;
  font-size: 14px;
  margin-top: 8px;
}
.equipped-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.slot-box {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}
.slot-box .slot-label { color: #aaa; font-size: 12px; margin-bottom: 4px; }
.slot-box .slot-value { color: #fff; font-size: 16px; font-weight: bold; }

.action-bar {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.events-bar {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
}
.events-bar .events-title {
  color: #ccc;
  margin-bottom: 12px;
  font-size: 16px;
}
</style>