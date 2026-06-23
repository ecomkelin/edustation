<template>
  <div class="display-page">
    <!-- 顶栏 -->
    <div class="top-bar">
      <div class="title">
        <span class="student-name">{{ pet?.studentName || '加载中...' }}</span>
        <span class="tier-badge" :class="tierClass">{{ tierLabel }}</span>
        <span class="level">Lv.{{ pet?.level || 0 }}</span>
        <el-tag v-if="pet?.state === 'egg'" type="warning" size="large">蛋</el-tag>
        <el-tag v-if="pet?.state === 'alive'" type="success" size="large">存活</el-tag>
        <!-- 2026-06-22: 学生剩余积分 — 代买食物/装饰前必看 -->
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

    <!-- 主体：左大图 + 右数据 -->
    <div class="main">
      <div class="pet-display">
        <!-- 2026-06-23: 背景层提到 pet-display 容器 — 铺满整个红框区域，而非只贴在宠物图后面 -->
        <div
          v-if="pet?.equipped?.background && itemMap[pet.equipped.background]"
          class="pet-display-bg"
          :class="`bg-${pet.equipped.background}`"
        >
          <span v-if="itemMap[pet.equipped.background].visualType === 'svg'" v-html="itemMap[pet.equipped.background].svgContent" />
          <img v-else-if="itemMap[pet.equipped.background].imageFile?.url" :src="itemMap[pet.equipped.background].imageFile.url" />
        </div>

        <!-- 2026-06-23: 蛋态 + 破壳特效 — 4 阶段精简版（用户反馈）：
             T+0s 锤子砸下 → T+0.4s 蛋壳裂痕 → T+1s 蛋晃动 → T+2s 金光（蛋在金光中淡出）→ T+3s 宠物出现 -->
        <div v-if="pet?.state === 'egg' || hatchActive" class="pet-img hatch-stage" :class="`phase-${hatchPhase}`">
          <!-- 锤子：T+0s ~ T+0.4s 从顶部砸下 -->
          <div class="hatch-hammer" :class="{ active: hatchPhase === 'hammer' }">🔨</div>

          <!-- 蛋 + 裂痕（SVG path）+ gold 阶段在金光中淡出 -->
          <div class="pet-frame egg-frame" :class="{ fading: hatchPhase === 'gold' }">
            <div class="egg-emoji" :class="{ cracking: ['cracks','shake','gold'].includes(hatchPhase) }">🥚</div>
            <!-- 裂痕：cracks/shake/gold 阶段都显示 -->
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

          <!-- 金光：T+2s 径向高光扩张（蛋在 .egg-frame.fading 中同步淡出） -->
          <div class="hatch-gold" :class="{ active: hatchPhase === 'gold' }"></div>

          <!-- 蛋态按钮：仅 idle 时显示 + canWrite 时 -->
          <el-button v-if="canWrite && hatchPhase === 'idle'" type="success" size="large" class="pet-bottom-btn" @click="onHatch">
            代破壳
          </el-button>
        </div>
        <!-- 2026-06-22: 宠物图 + 装备叠加层 抽到 PetEquipmentOverlay 组件复用 -->
        <template v-else-if="pet?.speciesRecord">
          <PetEquipmentOverlay
            :species-record="pet.speciesRecord"
            :equipped="pet.equipped || {}"
            :item-map="itemMap"
            mode="classroom"
            :fallback-emoji="speciesEmoji"
          />
          <!-- 存活态：底部中央按钮（满级时可升阶；非满级时显示置换） -->
          <template v-if="canWrite">
            <!-- 满级 + 经验达标 → 升阶按钮（橙色突出） -->
            <el-button v-if="canTierUpNow" type="danger" size="large" class="pet-bottom-btn tier-up-btn" @click="onTierUp" :loading="actioning">
              升 {{ nextTierLabel }} 阶 ⬆
            </el-button>
            <!-- 否则显示置换 -->
            <el-button v-else type="warning" size="large" class="pet-bottom-btn" @click="onSwap" :loading="actioning">置换</el-button>
          </template>
        </template>
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
            <template v-if="canTierUpNow">
              满级 + 经验达标（{{ pet.experience || 0 }}/{{ pet.tierUpThreshold }})，点下方「升阶」按钮
            </template>
            <template v-else>
              满级！累计经验需 ≥ {{ pet.tierUpThreshold }} 才能升阶（当前 {{ pet.experience || 0 }}）
            </template>
          </div>
        </div>

        <div class="stat-card">
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

        <!-- 2026-06-22: 装饰区 — SVG chip 点击 toggle 装备
             有框 = 已装备；无框 = 已解锁但未装备；点 chip 在 equip / unequip 间切
             蛋态不显示（蛋在概念上没有装饰）-->
        <div class="stat-card" v-if="pet?.state === 'alive'">
          <div class="label">装饰 · 点 SVG 切换装备</div>
          <div class="equip-categories">
            <div v-for="slot in PET_ITEM_SLOTS" :key="slot" class="cat-row">
              <div class="cat-label">{{ PET_ITEM_SLOT_LABELS[slot] }}</div>
              <div class="cat-chips">
                <div
                  v-for="entry in unlockedEntriesBySlot[slot]"
                  :key="slot + ':' + entry.key"
                  class="equip-chip"
                  :class="{ framed: pet?.equipped?.[slot] === entry.key }"
                  :title="entry.name + (pet?.equipped?.[slot] === entry.key ? ' (已装备，点击卸下)' : ' (点击装备)')"
                  @click="onToggleEquip(slot, entry.key)"
                >
                  <img v-if="entry.visualType === 'image' && entry.imageFile?.url" :src="entry.imageFile.url" :alt="entry.name" />
                  <span v-else-if="entry.visualType === 'svg' && entry.svgContent" class="chip-svg" v-html="entry.svgContent" />
                  <span v-else class="chip-emoji">🎁</span>
                </div>
                <span v-if="!unlockedEntriesBySlot[slot] || unlockedEntriesBySlot[slot].length === 0" class="slot-empty">未解锁</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2026-06-22: 食物区 — SVG chip 显示积分 + +exp + +hunger；点击代买 -->
        <div class="stat-card" v-if="canWrite && pet?.state === 'alive'">
          <div class="label">食物 · 点 SVG 代买喂食</div>
          <div class="food-grid">
            <div
              v-for="c in consumableEntries"
              :key="c.key"
              class="food-chip"
              :class="{ unaffordable: studentPoints != null && c.priceForTier != null && studentPoints < c.priceForTier }"
              :title="`${c.name} · ${c.priceForTier ?? '?'} 积分 · +${c.expGain}经验 +${c.hungerRestore}饱腹`"
              @click="onBuyConsumable(c.key)"
            >
              <span class="food-thumb">
                <img v-if="c.visualType === 'image' && c.imageFile?.url" :src="c.imageFile.url" :alt="c.name" />
                <span v-else-if="c.visualType === 'svg' && c.svgContent" class="chip-svg" v-html="c.svgContent" />
                <span v-else class="chip-emoji">🍖</span>
              </span>
              <div class="food-name">{{ c.name }}</div>
              <div class="food-meta">
                <span class="food-price">{{ c.priceForTier ?? '—' }} 积</span>
                <span class="food-eff">+{{ c.expGain }}exp +{{ c.hungerRestore }}饱</span>
              </div>
            </div>
            <span v-if="consumableEntries.length === 0" class="slot-empty">无可购食物</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 2026-06-22: action-bar 已删除 — 置换按钮迁到宠物下方，代买食物走下方食物 chip，点击装备走装饰 chip -->

    <!-- dialogs -->
    <!-- 2026-06-22: 与 PetDetailDialog 共用 GrantOnBehalfDialog kind=consumable；不再用 FeedOnBehalfDialog -->
    <GrantOnBehalfDialog
      v-model="grantConsumableDialog"
      kind="consumable"
      :pet-account-id="pet?._id"
      :student-tier="pet?.tier || pet?.eggTier || null"
      @success="onConsumableBought"
    />
    <!-- EquipOnBehalfDialog 已不再需要 — 装饰点击 inline toggle 装备 -->
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, ShoppingCart, Coin } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'
import { petCatalogApi } from '@/api/petCatalog'
import { pointsAdminApi } from '@/api/pointsAdmin'
import { effectiveHungerDecayMinutes } from '@/utils/pet'
import GrantOnBehalfDialog from '@/components/Pet/GrantOnBehalfDialog.vue'
import PetEquipmentOverlay from '@/components/Pet/PetEquipmentOverlay.vue'
import { useUserPerms } from '@/composables/useUserPerms'
import { formatDate } from '@/utils/format'
import {
  PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS
} from '@/utils/constants'

const SPECIES_EMOJI_FALLBACK = {
  cat_orange: '🐱', dog_puppy: '🐶', rabbit_white: '🐰', hamster_gold: '🐹',
  fox_red: '🦊', panda_baby: '🐼', penguin_baby: '🐧', owl_horned: '🦉',
  wolf_arctic: '🐺', deer_white: '🦌', hawk_red: '🦅', dolphin_blue: '🐬',
  dragon_emperor: '🐉', phoenix_fire: '🔥', unicorn_rainbow: '🦄', griffin_gold: '🦅'
}

export default {
  name: 'PetClassroomDisplay',
  components: { GrantOnBehalfDialog, PetEquipmentOverlay },
  setup() {
    const route = useRoute()
    const { can } = useUserPerms()
    const studentId = route.query.studentId
    const pet = ref(null)
    const pollTimer = ref(null)
    const actioning = ref(false)
    // 2026-06-22: 与 PetDetailDialog 对齐，用 GrantOnBehalfDialog kind='consumable'
    const grantConsumableDialog = ref(false)
    // 2026-06-22: 装饰 key→{name,visualType,svgContent,imageFile} 翻译 map
    // 拉一次复用，避免每 3s 轮询都打 catalog；SVG/image 信息用于叠加渲染
    const itemMap = ref({})
    let itemMapLoaded = false
    // 2026-06-22: 食物 (consumable) 翻译 map — 同样拉一次，按 tier 提取价格
    const consumableMap = ref({})
    let consumableMapLoaded = false
    // 2026-06-22: 学生剩余积分（顶栏显示 + 食物 chip 灰化判定）
    const studentPoints = ref(null)
    const canWrite = can('pet.write')

    // 2026-06-23: 破壳特效状态机
    // 阶段：idle → hammer (0.4s) → cracks → shake (1s) → gold (1s) → split (1s) → flash (1s) → reveal
    // 总时长 ~5.5s；reveal 后 fetchOnce 拉新数据，宠物出现
    // hatchActive 在 reveal 前保持 true，避免 v-if='egg' 被后端 alive 切掉
    const hatchPhase = ref('idle')
    const hatchActive = ref(false)
    let hatchTimers = []

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
      // maxHunger 现在是 1000（2026-06-23 改造），进度条按比例缩放到 100%
      return Math.min(100, Math.round((pet.value.currentHunger / pet.value.maxHunger) * 100))
    })
    // 2026-06-23: 饱腹度衰减间隔 由 PetSpecies.hungerDecayMinutes 决定
    const hungerDecayMinutes = computed(() => effectiveHungerDecayMinutes(pet.value, 60))
    // 预计到 0 剩余分钟数（仅 alive 态有意义）
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

    // 2026-06-22: 背包视图 — 按 slot 汇总 pet.unlocked[slot]，每项含 name（从 itemMap 翻译）
    // 与 PetDetailDialog 的 unlockedEntriesBySlot 同款，跨页展示对齐
    const unlockedEntriesBySlot = computed(() => {
      const out = {}
      for (const slot of PET_ITEM_SLOTS) out[slot] = []
      const unlocked = pet.value?.unlocked || {}
      for (const slot of PET_ITEM_SLOTS) {
        const arr = Array.isArray(unlocked[slot]) ? unlocked[slot] : []
        out[slot] = arr.map(key => ({
          key,
          name: (itemMap.value[key] && itemMap.value[key].name) || key,
          visualType: itemMap.value[key]?.visualType,
          svgContent: itemMap.value[key]?.svgContent,
          imageFile: itemMap.value[key]?.imageFile
        }))
      }
      return out
    })

    // 2026-06-22: 已装备装饰叠加层 — 迁到 PetEquipmentOverlay 组件（内部按 slot 顺序渲染）

    async function loadItemMap() {
      // 平台共享 catalog；只拉一次（per-tab 缓存）— 避免每 3s 轮询都打 catalog
      if (itemMapLoaded) return
      itemMapLoaded = true
      try {
        const { data } = await petCatalogApi.listItems({ pageSize: 100 })
        const map = {}
        for (const it of (data.items || [])) {
          map[it.key] = {
            name: it.name,
            slot: it.slot,
            // 2026-06-22: 视觉字段补齐 — 让叠加层 (equipment-overlay) 真的能渲染
            visualType: it.visualType || 'image',
            svgContent: it.svgContent || null,
            imageFile: it.imageFile || null
          }
        }
        itemMap.value = map
      } catch (e) {
        // 拉失败 → 退化显示 key，UI 不报错
        itemMap.value = {}
      }
    }

    async function fetchOnce() {
      if (!studentId) {
        ElMessage.error('缺少 studentId')
        return
      }
      try {
        const r = await petAdminApi.getByStudent(studentId)
        pet.value = r.data?.pet || null
        // 2026-06-22: 最近事件 UI 已删除，不再保留 recentEvents 字段
      } catch (e) {
        // ignore（轮询失败不阻塞）
      }
      // 2026-06-22: 学生积分（独立 fetch，与 getByStudent 解耦）
      // 失败不报错（积分账户可能还没建），UI 不显示 chip
      try {
        const { data } = await pointsAdminApi.getAccount(studentId)
        studentPoints.value = data?.account?.balance ?? null
      } catch (_) {
        // ignore
      }
    }

    /**
     * 食物 chip 列表（2026-06-22）— 按当前 pet tier 提取 perTier 价格
     * consumableMap 缓存全量 consumable 元数据（视觉字段）
     */
    const consumableEntries = computed(() => {
      const tier = pet.value?.tier || pet.value?.eggTier || null
      const out = []
      for (const [key, c] of Object.entries(consumableMap.value)) {
        // 仅列 isActive + 当前 tier 适用
        if (c.isActive === false) continue
        if (c.applicableTier && c.applicableTier !== 'all' && c.applicableTier !== tier) continue
        const cfg = (c.perTier && (c.perTier[tier] || c.perTier.all)) || null
        const priceForTier = cfg ? cfg.pointCost : null
        const hungerRestore = cfg ? cfg.hungerRestore : 0
        const expGain = cfg ? cfg.expGain : 0
        if (priceForTier == null) continue  // 当前阶不适用
        out.push({
          key,
          name: c.name,
          visualType: c.visualType || 'image',
          svgContent: c.svgContent || null,
          imageFile: c.imageFile || null,
          priceForTier,
          hungerRestore,
          expGain
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
            applicableTier: c.applicableTier,
            perTier: c.perTier || {},
            isActive: c.isActive,
            visualType: c.visualType || 'image',
            svgContent: c.svgContent || null,
            imageFile: c.imageFile || null
          }
        }
        consumableMap.value = map
      } catch (e) {
        consumableMap.value = {}
      }
    }

    /**
     * 装饰 chip 点击 → toggle 装备（2026-06-22）
     * 已装备 → 卸下（itemKey=null）；未装备 → 装备
     */
    async function onToggleEquip(slot, key) {
      if (!pet.value?._id) return
      const currentKey = pet.value?.equipped?.[slot] || null
      const isEquipped = currentKey === key
      const nextItemKey = isEquipped ? null : key
      const itemName = itemMap.value[key]?.name || key
      try {
        await petAdminApi.equipOnBehalf(pet.value._id, { slot, itemKey: nextItemKey })
        ElMessage.success(isEquipped ? `已卸下 ${itemName}` : `已装备 ${itemName}`)
        await fetchOnce()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || (isEquipped ? '卸下失败' : '装备失败'))
      }
    }

    /**
     * 食物 chip 点击 → 代买并立即喂（2026-06-22）
     */
    async function onBuyConsumable(key) {
      if (!pet.value?._id) return
      const c = consumableMap.value[key]
      const itemName = c?.name || key
      const cfg = (c?.perTier && (c.perTier[pet.value?.tier] || c.perTier.all)) || null
      const cost = cfg?.pointCost ?? 0
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

    /**
     * 装饰代买成功（弹窗回来）→ 刷新
     */
    function onConsumableBought() {
      fetchOnce()
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
      if (hatchActive.value) return  // 防双击
      hatchActive.value = true
      // 2026-06-23 简化时序：0s 锤子 → 0.4s 裂痕 → 1s 晃动 → 2s 金光（蛋在金光中淡出）→ 3s 宠物出现
      const setP = (phase, ms) => hatchTimers.push(setTimeout(() => { hatchPhase.value = phase }, ms))
      setP('hammer', 0)
      setP('cracks', 400)
      setP('shake',  1000)
      setP('gold',   2000)
      // API 在点时并行调用（通常 < 1s 已回），UI 数据更新推迟到 gold 阶段结束
      petAdminApi.hatchOnBehalf(pet.value._id).catch(e => {
        ElMessage.error(e?.response?.data?.message || '破壳失败')
      })
      // gold 阶段 1s（蛋在金光中淡出）→ 直接 fetchOnce + 复位，PetEquipmentOverlay 接位
      hatchTimers.push(setTimeout(async () => {
        await fetchOnce()
        hatchPhase.value = 'idle'
        hatchActive.value = false
      }, 3000))
    }

    function clearHatchTimers() {
      hatchTimers.forEach(clearTimeout)
      hatchTimers = []
    }

    onUnmounted(() => {
      stopPolling()
      clearHatchTimers()
    })
    async function onSwap() {
      await doAction('代置换蛋（扣积分）', () => petAdminApi.swapEggOnBehalf(pet.value._id))
    }
    // 2026-06-22: 手动升阶（满级 + 经验达标时主动触发）
    async function onTierUp() {
      const nextLabel = nextTierLabel.value
      try {
        await ElMessageBox.confirm(
          `确认将 ${pet.value?.tier} 阶宠物升到 ${nextLabel} 阶？升阶后当前种类保留，变为新阶蛋。`,
          '升阶',
          { type: 'warning', confirmButtonText: '升阶', cancelButtonText: '取消' }
        )
      } catch (_) { return }
      actioning.value = true
      try {
        await petAdminApi.tierUpOnBehalf(pet.value._id)
        ElMessage.success(`已升到 ${nextLabel} 阶`)
        await refresh()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || '升阶失败')
      } finally {
        actioning.value = false
      }
    }

    // 2026-06-22: 是否可以手动升阶
    const canTierUpNow = computed(() => {
      if (!pet.value || pet.value.state !== 'alive') return false
      if (!pet.value.tierUpThreshold || !pet.value.level) return false
      if (pet.value.level < 10) return false  // 简化为 Lv.10 满级
      if ((pet.value.experience || 0) < pet.value.tierUpThreshold) return false
      // S 阶不能再升
      if (pet.value.tier === 'S') return false
      return true
    })

    // 下一阶 label（B/A/S 之一或 'S'）
    const nextTierLabel = computed(() => {
      const order = ['C', 'B', 'A', 'S']
      const idx = order.indexOf(pet.value?.tier)
      if (idx < 0 || idx >= order.length - 1) return ''
      return order[idx + 1]
    })

    function onClose() {
      if (window.opener) {
        window.close()
      } else {
        // 不是 window.open 打开的 → 回上一页
        history.back()
      }
    }

    onMounted(async () => {
      loadItemMap()
      loadConsumableMap()
      await fetchOnce()
      startPolling()
    })

    return {
      pet, pollTimer, actioning, canWrite,
      grantConsumableDialog,
      hatchPhase, hatchActive,
      itemMap, unlockedEntriesBySlot, consumableEntries, studentPoints,
      tierLabel, tierClass, expPercent, hungerPercent, speciesEmoji,
      PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS,
      Picture, ShoppingCart, Coin,
      // 2026-06-22: 手动升阶
      canTierUpNow, nextTierLabel, onTierUp,
      refresh, onHatch, onSwap, onClose, formatDate,
      onToggleEquip, onBuyConsumable, onConsumableBought,
      // 2026-06-23: 饱腹度衰减展示
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
  position: relative;  /* 2026-06-23: 背景层绝对定位铺满 */
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  overflow: hidden;  /* 2026-06-23: 背景 SVG 超出红框部分裁掉 */
}
/* 2026-06-23: 背景层 — 铺满整个左侧红框区，pointer-events:none 不挡背后交互 */
.pet-display-bg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: 16px;
}
.pet-display-bg span,
.pet-display-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 红框里其他元素（蛋/宠物/按钮）要在背景之上 */
.pet-display > *:not(.pet-display-bg) {
  position: relative;
  z-index: 1;
}
.pet-display .species-name {
  font-size: 36px;
  font-weight: bold;
  color: #ffd04b;
  margin-top: 8px;
}
.pet-display .hint {
  color: #aaa;
  font-size: 16px;
}

/* 2026-06-23: 蛋 frame — 与 PetEquipmentOverlay 同尺寸结构 */
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
/* 蛋壳变脆（裂缝期开始）：微黄 + 抖动提示 */
.egg-emoji.cracking { filter: drop-shadow(0 6px 12px rgba(0,0,0,0.4)) brightness(1.05); }

/* 蛋裂痕 SVG：铺满 egg-frame 之上 */
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

/* 破壳 stage 容器（pet-img.hatch-stage）*/
.hatch-stage {
  position: relative;
  overflow: visible;
}

/* ─── T+0s ~ T+0.4s 锤子砸下 ─── */
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

/* ─── T+1s ~ T+2s 蛋晃动 ─── */
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

/* ─── T+2s ~ T+3s 金光 + 蛋在金光中淡出 ─── */
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
/* 蛋 frame 在 gold 阶段：opacity 1→0 + 微微 scale up，"在金光中慢慢消失" */
.egg-frame.fading {
  animation: egg-fade-in-gold 1s ease-out forwards;
}
@keyframes egg-fade-in-gold {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.15); }
}

/* 2026-06-22: 宠物展示框 — 限宽,作为叠加层定位基准
   避免 .pet-img 被 species-name 拉伸,让叠加层与图本身对齐 */
.pet-img {
  position: relative;
  width: 100%;
  max-width: 80%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pet-img > img,
.pet-img > .svg-wrap,
.pet-img > .emoji-fallback {
  width: 100%;
  max-height: 60vh;
  object-fit: contain;
  display: block;
}
.pet-img > .svg-wrap :deep(svg) {
  width: 100%;
  max-height: 60vh;
  display: block;
}
.pet-img > .emoji-fallback {
  font-size: 280px;
  line-height: 1;
  text-align: center;
}

/* 2026-06-22: 已装备装饰叠加层（absolute 在 .pet-img 内，覆盖图片区域）
   注：inset:0 相对 .pet-img，不含底部 species-name（species-name 不在框内） */
.equipment-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.overlay-slot {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}
.overlay-slot img,
.overlay-slot .svg-wrap :deep(svg) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
}

/* ─── 6 slot 固定坐标(以 .pet-img 为 100% × 100% 框)
     思路:物种 SVG 中心约在 50%/55% 区域,头顶约 15-25%,脖子 45-55%,躯干 55-85%
     不同物种大小会略有偏移,但「明显戴头上 / 围脖子上」可达成 */
.slot-background {
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0.35;
  z-index: 0;
}
.slot-hat       { top: -2%;  left: 50%; transform: translateX(-50%); width: 50%; height: 32%; z-index: 2; }
.slot-scarf     { top: 28%;  left: 50%; transform: translateX(-50%); width: 50%; height: 18%; z-index: 2; }
.slot-clothes   { top: 38%;  left: 50%; transform: translateX(-50%); width: 60%; height: 32%; z-index: 2; }
.slot-accessory { top: 50%;  left: 50%; transform: translateX(-50%); width: 22%; height: 22%; z-index: 2; }
.slot-halo      { top: -8%;  left: 50%; transform: translateX(-50%); width: 75%; height: 50%; opacity: 0.85; z-index: 2; }

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
.stat-card .tierup-hint {
  color: #ffd04b;
  font-size: 14px;
  margin-top: 8px;
}

/* 2026-06-22: 装饰 chip 区 — 6 行 × N chip, 整行 row layout */
.equip-categories { display: flex; flex-direction: column; gap: 8px; }
.cat-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.04);
  padding: 6px 10px;
  border-radius: 6px;
}
.cat-label {
  color: #ccc;
  font-size: 13px;
  width: 56px;
  flex-shrink: 0;
  font-weight: 600;
}
.cat-chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; align-items: center; }
.slot-empty { color: #666; font-size: 12px; }

/* 装备 chip：默认无边框；装备中：success 边框 + 浅绿底 */
.equip-chip {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
  overflow: hidden;
}
.equip-chip:hover { transform: scale(1.08); background: rgba(255, 255, 255, 0.12); }
.equip-chip.framed {
  border: 2px solid #67c23a;
  background: #f0f9eb;
  box-shadow: 0 0 0 2px rgba(103, 194, 58, 0.3);
}
.equip-chip img,
.equip-chip .chip-svg {
  display: block;
  max-width: 44px;
  max-height: 44px;
  width: 44px;
  height: 44px;
  object-fit: contain;
}
/* 2026-06-22: inline SVG 没 width/height 时浏览器默认 300×150，会撑爆 chip
   必须直接给 svg 元素固定尺寸，max-width 才有用 */
.equip-chip .chip-svg :deep(svg) {
  width: 44px !important;
  height: 44px !important;
  display: block;
}
.equip-chip .chip-emoji { font-size: 24px; }

/* 食物 chip：大一些 + 显示 name + 积分 + 效果 */
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

/* 2026-06-22: 宠物底部中央按钮（蛋态代破壳 / 存活态置换 共用） */
.pet-bottom-btn {
  margin-top: 16px;
  min-width: 160px;
}
/* 2026-06-22: 升阶按钮（满级时显示） */
.tier-up-btn {
  animation: pulse-tier-up 1.5s ease-in-out infinite;
}
@keyframes pulse-tier-up {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.7); }
  50% { box-shadow: 0 0 0 12px rgba(245, 108, 108, 0); }
}
</style>