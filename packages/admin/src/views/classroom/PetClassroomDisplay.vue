<template>
  <div class="display-page">
    <!-- 顶栏 -->
    <div class="top-bar">
      <div class="title">
        <span class="student-name">{{ pet?.studentName || (pets.length ? '' : '加载中...') }}</span>
        <span class="level" v-if="pet">Lv.{{ pet?.level || 0 }}</span>
        <el-tag v-if="pet?.state === 'egg'" type="warning" size="large">蛋</el-tag>
        <el-tag v-if="pet?.state === 'alive'" type="success" size="large">存活</el-tag>
        <el-tag type="warning" size="large" effect="dark" v-if="studentPoints != null">
          <el-icon style="margin-right:2px;vertical-align:-2px"><Coin /></el-icon>
          {{ studentPoints }} 积分
        </el-tag>
      </div>
      <div class="online-indicator">
        <span class="dot" :class="{ online: !!pollTimer }"></span>
        实时同步
      </div>
      <el-button type="danger" plain @click="onClose">[关闭]</el-button>
    </div>

    <!-- 主体：左默认宠物大图 + 右数据 -->
    <div class="main">
      <div class="pet-display">
        <!-- 蛋态 + 破壳特效 -->
        <div v-if="pet?.state === 'egg' || hatchActive" class="pet-img hatch-stage" :class="`phase-${hatchPhase}`">
          <div class="hatch-hammer" :class="{ active: hatchPhase === 'hammer' }">🔨</div>
          <div class="pet-frame egg-frame" :class="{ fading: hatchPhase === 'gold' }">
            <div class="egg-emoji" :class="{ cracking: ['cracks','shake','gold'].includes(hatchPhase) }">🥚</div>
            <svg
              v-if="['cracks','shake','gold'].includes(hatchPhase)"
              class="egg-cracks"
              :class="{ deep: hatchPhase === 'gold' }"
              viewBox="0 0 200 240"
              preserveAspectRatio="xMidYMid meet"
            >
              <path d="M 100 60 L 95 90 L 110 110 L 95 140 L 115 165 L 100 200" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" />
              <path d="M 70 90 L 80 115 L 65 145" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" />
              <path d="M 130 90 L 125 120 L 140 150" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" />
              <path d="M 80 180 L 100 200 L 120 180" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
            </svg>
          </div>
          <div class="hatch-gold" :class="{ active: hatchPhase === 'gold' }"></div>
          <el-button v-if="canWrite && hatchPhase === 'idle'" type="success" size="large" class="pet-bottom-btn" @click="onHatch(pet)">
            代破壳
          </el-button>
        </div>
        <!-- 存活态：默认宠物本体（PetEquipmentOverlay 现在只渲染 species 视频） -->
        <template v-else-if="pet?.speciesRecord">
          <PetEquipmentOverlay
            :species-record="pet.speciesRecord"
            mode="classroom"
            :fallback-emoji="speciesEmoji"
          />
        </template>
        <div v-else class="pet-empty">
          <el-icon :size="120"><Picture /></el-icon>
          <div class="hint">{{ pet ? (pet.species || '未破壳') : '该学员暂无宠物' }}</div>
        </div>
      </div>

      <div class="pet-stats">
        <div class="stat-card" v-if="pet">
          <div class="label">经验</div>
          <el-progress
            :percentage="expPercent"
            :stroke-width="32"
            :format="() => pet?.nextExpToLevel != null ? `${pet?.experience || 0} / ${pet.nextExpToLevel}` : `满级 Lv.${pet?.level || 0}`"
            :status="expPercent >= 100 ? 'success' : ''"
          />
        </div>

        <div class="stat-card" v-if="pet">
          <div class="label">
            饱腹度
            <span v-if="pet?.state === 'alive'" class="hunger-meta">
              每 {{ hungerDecayMinutes }} 分钟 -1 · 剩 {{ formatTimeLeft(hungerMinutesLeft) }} 归零
            </span>
            <span v-else-if="pet?.state === 'egg'" class="hunger-meta">蛋态不减</span>
          </div>
          <el-progress
            :percentage="hungerPercent"
            :stroke-width="32"
            :format="() => `${pet?.currentHunger || 0} / ${pet?.maxHunger || 1000}`"
            :status="hungerPercent < 20 ? 'warning' : hungerPercent === 0 ? 'exception' : ''"
          />
        </div>

        <!-- 食物区 — 点击代买喂食（默认宠物） -->
        <div class="stat-card" v-if="canWrite && pet?.state === 'alive'">
          <div class="label">食物 · 点击代买喂食</div>
          <div class="food-grid">
            <div
              v-for="c in consumableEntries"
              :key="c.key"
              class="food-chip"
              :class="{ unaffordable: studentPoints != null && studentPoints < c.pointCost }"
              :title="`${c.name} · ${c.pointCost} 积分 · +${c.expGain}经验 +${c.hungerRestore}饱腹`"
              @click="onBuyConsumable(c.key)"
            >
              <span class="food-thumb">
                <span v-if="c.visualType === 'svg' && c.svgContent" class="chip-svg" v-html="c.svgContent" />
                <video v-else-if="c.visualType === 'video' && c.videoFile?.url" :src="c.videoFile.url" autoplay loop muted playsinline />
                <span v-else class="chip-emoji">🍖</span>
              </span>
              <div class="food-name">{{ c.name }}</div>
              <div class="food-meta">
                <span class="food-price">{{ c.pointCost }} 积</span>
                <span class="food-eff">+{{ c.expGain }}exp +{{ c.hungerRestore }}饱</span>
              </div>
            </div>
            <span v-if="consumableEntries.length === 0" class="slot-empty">无可购食物</span>
          </div>
        </div>

        <!-- 其他领养的宠物 — 9:16 视频卡片；点「设为默认」切主图 / 蛋可代破壳 -->
        <div class="stat-card">
          <div class="label">
            其他领养的宠物（{{ otherPets.length }} 只 · 共 {{ pets.length }}/{{ MAX_PETS }}）
            <span v-if="pets.length >= MAX_PETS" class="max-hint">已达上限, 需先弃养腾位</span>
          </div>
          <div class="other-pets-grid">
            <div v-for="p in otherPets" :key="p._id" class="other-pet-card">
              <div class="other-pet-media">
                <video
                  v-if="p.state === 'alive' && p.speciesRecord?.visualType === 'video' && p.speciesRecord.videoFile?.url"
                  :src="p.speciesRecord.videoFile.url" autoplay loop muted playsinline class="other-pet-video"
                />
                <span v-else-if="p.state === 'alive' && p.speciesRecord?.visualType === 'svg'" class="other-pet-svg" v-html="p.speciesRecord.svgContent" />
                <span v-else class="other-pet-emoji">{{ p.state === 'egg' ? '🥚' : '🐾' }}</span>
              </div>
              <div class="other-pet-name">{{ p.speciesRecord?.name || (p.state === 'egg' ? '待破壳' : p.species || '—') }} · Lv.{{ p.level }}</div>
              <div class="other-pet-actions" v-if="canWrite">
                <el-button size="small" type="success" plain @click="onSetDefault(p)">设为默认</el-button>
                <el-button v-if="p.state === 'egg'" size="small" type="warning" plain @click="onHatchOther(p)">代破壳</el-button>
                <!-- 2026-07-16 弃养 (§8.1 三重防护: 平台超管 + pet.write + 密码 + removable-check 预检) -->
                <DestructiveConfirm
                  :target="`${p.speciesRecord?.name || (p.state==='egg' ? '待破壳' : p.species || '宠物')} · Lv.${p.level}`"
                  warning="中风险"
                  reason="该操作会物理删除这只宠物及其等级经验，操作后无法恢复。如该宠物是默认宠物，弃养后会自动切到剩余最早领养的一只。"
                  :precheck="() => precheckAbandon(p)"
                  @confirm="(evt) => onAbandon(p, evt)"
                >
                  <el-button size="small" type="danger" plain :disabled="pets.length <= 1">弃养</el-button>
                </DestructiveConfirm>
              </div>
            </div>
            <!-- 已达上限: 显示禁用的「上限占位卡」提示, 不要让 + 直接消失 (2026-07-16 UX 修复) -->
            <div v-if="canWrite && pets.length >= MAX_PETS" class="other-pet-card adopt-card adopt-card--full" title="已达上限, 请先弃养一只">
              <div class="adopt-plus">×</div>
              <div class="other-pet-name">已达上限</div>
            </div>
            <div v-else-if="canWrite" class="other-pet-card adopt-card" @click="onAdopt">
              <div class="adopt-plus">＋</div>
              <div class="other-pet-name">代领养</div>
            </div>
            <span v-if="otherPets.length === 0 && pets.length >= MAX_PETS" class="slot-empty">无其他宠物</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, Coin } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import { petCatalogApi } from '@/api/petCatalog'
import { pointsAdminApi } from '@/api/pointsAdmin'
import { effectiveHungerDecayMinutes } from '@/utils/pet'
import PetEquipmentOverlay from '@/components/Pet/PetEquipmentOverlay.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { useUserPerms } from '@/composables/useUserPerms'
import { handleRemoveError } from '@/utils/removable'
import { formatDate } from '@/utils/format'

const MAX_PETS = 5  // 2026-07-16: 与 shared/petConfig.MAX_PETS_PER_STUDENT 同步

const SPECIES_EMOJI_FALLBACK = {
  cat_orange: '🐱', dog_puppy: '🐶', rabbit_white: '🐰', hamster_gold: '🐹',
  fox_red: '🦊', panda_baby: '🐼', penguin_baby: '🐧', owl_horned: '🦉',
  dragon_emperor: '🐉', phoenix_fire: '🔥', unicorn_rainbow: '🦄', griffin_gold: '🦅'
}

export default {
  name: 'PetClassroomDisplay',
  components: { PetEquipmentOverlay, DestructiveConfirm },
  setup() {
    const route = useRoute()
    const { can } = useUserPerms()
    const studentId = route.query.studentId
    const pet = ref(null)          // 默认宠物
    const pets = ref([])           // 该学员全部宠物
    const pollTimer = ref(null)
    const actioning = ref(false)
    const consumableMap = ref({})
    let consumableMapLoaded = false
    const studentPoints = ref(null)
    const canWrite = can('pet.write')

    const hatchPhase = ref('idle')
    const hatchActive = ref(false)
    let hatchTimers = []

    const otherPets = computed(() => pets.value.filter(p => !pet.value || String(p._id) !== String(pet.value._id)))

    const expPercent = computed(() => {
      if (!pet.value) return 0
      const next = pet.value.nextExpToLevel
      if (next == null) return 100
      return Math.min(100, Math.round((pet.value.experience / next) * 100))
    })
    const hungerPercent = computed(() => {
      if (!pet.value) return 0
      return Math.min(100, Math.round((pet.value.currentHunger / pet.value.maxHunger) * 100))
    })
    const hungerDecayMinutes = computed(() => effectiveHungerDecayMinutes(pet.value, 60))
    const hungerMinutesLeft = computed(() => {
      if (!pet.value || pet.value.state !== 'alive') return null
      return Math.max(0, (pet.value.currentHunger || 0) * hungerDecayMinutes.value)
    })
    function formatTimeLeft(minutes) {
      if (minutes == null) return '—'
      if (minutes < 60) return `${minutes} 分钟`
      if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} 小时`
      return `${(minutes / 60 / 24).toFixed(1)} 天`
    }
    const speciesEmoji = computed(() => SPECIES_EMOJI_FALLBACK[pet.value?.species] || '🐾')

    async function fetchOnce() {
      if (!studentId) {
        ElMessage.error('缺少 studentId')
        return
      }
      try {
        const r = await petAdminApi.getByStudent(studentId)
        pet.value = r.data?.pet || null
        pets.value = r.data?.pets || (r.data?.pet ? [r.data.pet] : [])
      } catch (e) {
        // ignore（轮询失败不阻塞）
      }
      try {
        const { data } = await pointsAdminApi.getAccount(studentId)
        studentPoints.value = data?.account?.balance ?? null
      } catch (_) {
        // ignore
      }
    }

    // 食物 chip（扁平数值，无 tier）
    const consumableEntries = computed(() => {
      const out = []
      for (const [key, c] of Object.entries(consumableMap.value)) {
        if (c.isActive === false) continue
        out.push({
          key,
          name: c.name,
          visualType: c.visualType || 'svg',
          svgContent: c.svgContent || null,
          videoFile: c.videoFile || null,
          pointCost: c.pointCost || 0,
          hungerRestore: c.hungerRestore || 0,
          expGain: c.expGain || 0
        })
      }
      return out
    })

    async function loadConsumableMap() {
      if (consumableMapLoaded) return
      consumableMapLoaded = true
      try {
        const { data } = await petCatalogApi.listConsumables({ pageSize: 100 })
        const map = {}
        for (const c of (data.items || [])) {
          map[c.key] = {
            name: c.name,
            kind: c.kind,
            isActive: c.isActive,
            pointCost: c.pointCost,
            hungerRestore: c.hungerRestore,
            expGain: c.expGain,
            visualType: c.visualType || 'svg',
            svgContent: c.svgContent || null,
            videoFile: c.videoFile || null
          }
        }
        consumableMap.value = map
      } catch (e) {
        consumableMap.value = {}
      }
    }

    // 食物 chip 点击 → 代买并立即喂（默认宠物）
    async function onBuyConsumable(key) {
      if (!pet.value?._id) return
      const c = consumableMap.value[key]
      const itemName = c?.name || key
      const cost = c?.pointCost ?? 0
      if (studentPoints.value != null && studentPoints.value < cost) {
        ElMessage.warning(`积分不足：当前 ${studentPoints.value}，需要 ${cost}`)
        return
      }
      try {
        await ElMessageBox.confirm(`确认代买 ${itemName}（扣 ${cost} 积分）并立即喂食？`, '代买食物', { type: 'warning' })
      } catch (_) { return }
      try {
        await petAdminApi.grantConsumable(pet.value._id, { consumableKey: key })
        ElMessage.success(`已代买并喂食 ${itemName}`)
        await fetchOnce()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '代买失败')
      }
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

    // 破壳动画（默认宠物在左侧大图区触发）
    async function onHatch(target) {
      if (hatchActive.value) return
      if (!target?._id) return
      hatchActive.value = true
      const setP = (phase, ms) => hatchTimers.push(setTimeout(() => { hatchPhase.value = phase }, ms))
      setP('hammer', 0)
      setP('cracks', 400)
      setP('shake', 1000)
      setP('gold', 2000)
      petAdminApi.hatchOnBehalf(target._id).catch(e => {
        ElMessage.error(e?.response?.data?.message || '破壳失败')
      })
      hatchTimers.push(setTimeout(async () => {
        await fetchOnce()
        hatchPhase.value = 'idle'
        hatchActive.value = false
      }, 3000))
    }

    // 其他宠物代破壳（无动画，直接调用后刷新）
    async function onHatchOther(p) {
      if (!p?._id) return
      try {
        await petAdminApi.hatchOnBehalf(p._id)
        ElMessage.success('已破壳')
        await fetchOnce()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '破壳失败')
      }
    }

    // 设为默认宠物
    async function onSetDefault(p) {
      if (!p?._id) return
      try {
        await petAdminApi.setDefaultOnBehalf(p._id)
        ElMessage.success('已设为默认宠物')
        await fetchOnce()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '设置失败')
      }
    }

    // 代领养一只新宠物
    async function onAdopt() {
      if (!studentId) return
      if (pets.value.length >= MAX_PETS) {
        ElMessage.warning(`最多领养 ${MAX_PETS} 只`)
        return
      }
      try {
        await petAdminApi.adoptOnBehalf(studentId)
        ElMessage.success('已代领养（蛋态）')
        await fetchOnce()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || '领养失败')
      }
    }

    // 2026-07-16 弃养 (§8.1 防护: DestructiveConfirm 已走 密码 + 预检)
    // precheck 必须在 setup 里包一层 (template 闭包拿不到模块级 import)
    function precheckAbandon(p) {
      return petAdminApi.removableCheckPetAccount(p._id).then((r) => r.data || r)
    }
    async function onAbandon(p, { password }) {
      if (!p?._id) return
      const name = p.speciesRecord?.name || (p.state === 'egg' ? '待破壳' : (p.species || '宠物'))
      try {
        await petAdminApi.removePetAccount(p._id, { password })
        ElMessage.success(`已弃养「${name}」`)
        await fetchOnce()
      } catch (e) {
        await handleRemoveError(e, '无法弃养 · 中风险', name)
      }
    }

    function clearHatchTimers() {
      hatchTimers.forEach(clearTimeout)
      hatchTimers = []
    }

    function onClose() {
      if (window.opener) {
        window.close()
      } else {
        history.back()
      }
    }

    onMounted(async () => {
      loadConsumableMap()
      await fetchOnce()
      startPolling()
    })
    onUnmounted(() => {
      stopPolling()
      clearHatchTimers()
    })

    return {
      pet, pets, otherPets, pollTimer, actioning, canWrite, MAX_PETS,
      hatchPhase, hatchActive,
      consumableEntries, studentPoints,
      expPercent, hungerPercent, speciesEmoji,
      Picture, Coin,
      onHatch, onHatchOther, onSetDefault, onAdopt, precheckAbandon, onAbandon, onBuyConsumable, onClose, formatDate,
      hungerDecayMinutes, hungerMinutesLeft, formatTimeLeft
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
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  overflow: hidden;
}
.pet-display .hint {
  color: #aaa;
  font-size: 16px;
}
.pet-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #888;
}

/* 蛋 frame */
.egg-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  max-height: 60vh;
  background: radial-gradient(circle at 50% 40%, rgba(255, 240, 200, 0.10), transparent 70%);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
}
.egg-emoji {
  font-size: clamp(180px, 30vw, 280px);
  line-height: 1;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.4));
  transition: transform 0.2s, filter 0.3s;
}
.egg-emoji.cracking { filter: drop-shadow(0 6px 12px rgba(0,0,0,0.4)) brightness(1.05); }

.egg-cracks {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  animation: crack-appear 0.3s ease-out;
}
.egg-cracks.deep { filter: drop-shadow(0 0 8px rgba(255,255,200,0.8)); }
@keyframes crack-appear {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}

.hatch-stage {
  position: relative;
  overflow: visible;
}
.hatch-hammer {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -300px) rotate(-30deg);
  font-size: 80px;
  opacity: 0;
  pointer-events: none;
  z-index: 10;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
}
.hatch-hammer.active {
  animation: hammer-fall 0.4s ease-in forwards;
}
@keyframes hammer-fall {
  0%   { transform: translate(-50%, -300px) rotate(-30deg); opacity: 0; }
  20%  { transform: translate(-50%, -200px) rotate(-25deg); opacity: 1; }
  60%  { transform: translate(-50%, 0)     rotate(0deg);   opacity: 1; }
  80%  { transform: translate(-50%, 0)     rotate(0deg);   opacity: 1; }
  100% { transform: translate(-50%, 200px) rotate(15deg);  opacity: 0; }
}
.hatch-stage.phase-shake .egg-frame {
  animation: hatch-shake 0.12s ease-in-out infinite;
}
@keyframes hatch-shake {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20% { transform: translate(-4px, -2px) rotate(-2deg); }
  40% { transform: translate(5px, 1px)  rotate(2deg); }
  60% { transform: translate(-3px, 3px) rotate(-1deg); }
  80% { transform: translate(3px, -2px) rotate(1deg); }
}
.hatch-gold {
  position: absolute;
  inset: -20%;
  pointer-events: none;
  background: radial-gradient(circle at 50% 50%,
    rgba(255, 240, 130, 0.95) 0%,
    rgba(255, 200, 60, 0.7) 20%,
    rgba(255, 180, 40, 0.4) 45%,
    transparent 70%);
  opacity: 0;
  mix-blend-mode: screen;
  border-radius: 50%;
  z-index: 5;
}
.hatch-gold.active {
  animation: gold-flash 1s ease-out forwards;
}
@keyframes gold-flash {
  0%   { opacity: 0; transform: scale(0.4); }
  30%  { opacity: 1; transform: scale(1.0); }
  100% { opacity: 0; transform: scale(1.8); }
}
.egg-frame.fading {
  animation: egg-fade-in-gold 1s ease-out forwards;
}
@keyframes egg-fade-in-gold {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.15); }
}

.pet-img {
  position: relative;
  width: 100%;
  max-width: 80%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pet-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
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
.stat-card .label .hunger-meta {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
  font-weight: normal;
}
.slot-empty { color: #666; font-size: 12px; }

/* 食物 chip */
.food-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
}
.food-chip {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s;
}
.food-chip:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.12); }
.food-chip.unaffordable { opacity: 0.4; cursor: not-allowed; }
.food-chip .food-thumb {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fafbfc, #f0f2f5);
  border-radius: 8px;
  overflow: hidden;
}
.food-chip .food-thumb img,
.food-chip .food-thumb video,
.food-chip .food-thumb .chip-svg {
  display: block;
  max-width: 52px;
  max-height: 52px;
  width: 52px;
  height: 52px;
  object-fit: contain;
}
.food-chip .food-thumb .chip-svg :deep(svg) {
  width: 52px !important;
  height: 52px !important;
  display: block;
}
.food-chip .food-thumb .chip-emoji { font-size: 32px; }
.food-chip .food-name { font-size: 12px; color: #fff; font-weight: 600; }
.food-chip .food-meta { font-size: 10px; color: #aaa; text-align: center; }
.food-chip .food-price { color: #e6a23c; font-weight: 600; }

/* 其他领养的宠物 grid */
.other-pets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.other-pet-card {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.other-pet-media {
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 8px;
  position: relative;
  background: rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 9:16 视频裁成正方形 */
.other-pet-video {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 177.78%;
  transform: translateY(-50%);
  object-fit: cover;
}
.other-pet-svg :deep(svg) { width: 100%; height: 100%; }
.other-pet-img { width: 100%; height: 100%; object-fit: contain; }
.other-pet-emoji { font-size: 56px; }
.other-pet-name { font-size: 12px; color: #fff; text-align: center; }
.other-pet-actions { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.other-pet-actions .el-button { margin-left: 0; }
.adopt-card {
  cursor: pointer;
  justify-content: center;
  border: 1px dashed rgba(255,255,255,0.3);
  transition: background 0.15s;
}
.adopt-card:hover { background: rgba(255,255,255,0.12); }
/* 2026-07-16 已达上限占位卡: 灰色 + 不可点 */
.adopt-card--full {
  cursor: not-allowed;
  border-style: solid;
  border-color: rgba(255,255,255,0.15);
  opacity: 0.5;
}
.adopt-card--full:hover { background: rgba(255,255,255,0.06); }
.adopt-card--full .adopt-plus { color: #888; }
.adopt-plus { font-size: 40px; color: #67c23a; line-height: 1; }
.max-hint { font-size: 12px; color: #e6a23c; margin-left: 8px; font-weight: normal; }

.pet-bottom-btn {
  margin-top: 16px;
  min-width: 160px;
}
</style>
