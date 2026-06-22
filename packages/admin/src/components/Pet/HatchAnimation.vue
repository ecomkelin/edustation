<template>
  <div v-if="visible" class="hatch-overlay" @click.stop>
    <div class="hatch-stage">
      <!-- 阶段1: 蛋震动 (0-600ms) -->
      <div v-show="phase === 'shake' || phase === 'crack'" class="egg-wrap" :class="{ shaking: phase === 'shake' }">
        <div class="egg" :class="{ cracking: phase === 'crack' }">🥚</div>
        <!-- 裂缝 (crack 阶段显示) -->
        <div v-if="phase === 'crack'" class="cracks">
          <div class="crack c1"></div>
          <div class="crack c2"></div>
          <div class="crack c3"></div>
        </div>
      </div>

      <!-- 阶段3: 闪光 (overlap with bounce) -->
      <div v-if="phase === 'flash' || phase === 'bounce'" class="flash"></div>

      <!-- 阶段4: 宠物蹦出 -->
      <div v-if="phase === 'bounce'" class="pet-reveal" :class="{ bouncing: phase === 'bounce' }">
        <PetEquipmentOverlay
          v-if="speciesRecord"
          :species-record="speciesRecord"
          :equipped="equipped"
          :item-map="itemMap"
          mode="dialog"
          fallback-emoji="🐾"
        />
        <div v-else class="pet-fallback">🐾</div>
        <div class="reveal-text">{{ speciesRecord?.name || '宠物' }} 出壳啦！</div>
      </div>

      <!-- 底部文案 -->
      <div class="hint-text">
        <span v-if="phase === 'shake'">蛋开始震动……</span>
        <span v-else-if="phase === 'crack'">裂缝出现了！</span>
        <span v-else-if="phase === 'flash'">✨</span>
        <span v-else-if="phase === 'bounce'">&nbsp;</span>
      </div>
    </div>
  </div>
</template>

<script>
import PetEquipmentOverlay from '@/components/Pet/PetEquipmentOverlay.vue'

/**
 * 破壳特效（2026-06-22）
 *
 * 4 阶段动画：
 *   1. shake (0-600ms)    蛋左右震动
 *   2. crack (600-1000ms) 蛋缩小淡出 + 出现裂缝
 *   3. flash (1000-1300ms) 中央闪光
 *   4. bounce (1300-1900ms) 宠物从上方弹跳落入
 *
 * 用法：
 *   <HatchAnimation
 *     v-model:visible="hatchAnimVisible"
 *     :species-record="hatchedSpecies"
 *     :equipped="hatchedEquipped"
 *     :item-map="hatchedItemMap"
 *     @close="onHatchAnimClose"
 *   />
 */
export default {
  name: 'HatchAnimation',
  components: { PetEquipmentOverlay },
  props: {
    visible: { type: Boolean, default: false },
    speciesRecord: { type: Object, default: null },
    equipped: { type: Object, default: () => ({}) },
    itemMap: { type: Object, default: () => ({}) }
  },
  emits: ['update:visible', 'close'],
  data() {
    return {
      phase: 'idle',  // idle | shake | crack | flash | bounce
      timers: []
    }
  },
  watch: {
    visible(v) {
      if (v) this.play()
      else this.reset()
    }
  },
  beforeUnmount() {
    this.clearTimers()
  },
  methods: {
    play() {
      this.clearTimers()
      this.phase = 'shake'
      this.timers.push(setTimeout(() => { this.phase = 'crack' }, 600))
      this.timers.push(setTimeout(() => { this.phase = 'flash' }, 1000))
      this.timers.push(setTimeout(() => { this.phase = 'bounce' }, 1300))
      this.timers.push(setTimeout(() => {
        this.phase = 'idle'
        this.$emit('close')
        this.$emit('update:visible', false)
      }, 1900))
    },
    reset() {
      this.clearTimers()
      this.phase = 'idle'
    },
    clearTimers() {
      this.timers.forEach(t => clearTimeout(t))
      this.timers = []
    }
  }
}
</script>

<style scoped>
.hatch-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;  /* 不挡住背后 dialog 的关闭按钮等 */
}

.hatch-stage {
  width: 320px;
  height: 360px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* ── 蛋 ── */
.egg-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.egg {
  font-size: 180px;
  line-height: 1;
  filter: drop-shadow(0 8px 24px rgba(255, 200, 80, 0.5));
  transition: transform 0.4s ease-in, opacity 0.4s ease-in;
}

.shaking .egg {
  animation: shake 0.6s linear infinite;
}

.cracking {
  transform: scale(0.3) rotate(45deg);
  opacity: 0;
}

@keyframes shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  10% { transform: translateX(-12px) rotate(-8deg); }
  20% { transform: translateX(12px) rotate(8deg); }
  30% { transform: translateX(-10px) rotate(-6deg); }
  40% { transform: translateX(10px) rotate(6deg); }
  50% { transform: translateX(-8px) rotate(-4deg); }
  60% { transform: translateX(8px) rotate(4deg); }
  70% { transform: translateX(-6px) rotate(-3deg); }
  80% { transform: translateX(6px) rotate(3deg); }
  90% { transform: translateX(-3px) rotate(-1deg); }
}

/* ── 裂缝 ── */
.cracks {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.crack {
  position: absolute;
  width: 4px;
  height: 60px;
  background: linear-gradient(180deg, transparent, #fff, transparent);
  border-radius: 2px;
  box-shadow: 0 0 12px #fff;
  opacity: 0.9;
}
.crack.c1 { transform: rotate(20deg) translateY(-30px); animation: crack-shine 0.4s ease-out; }
.crack.c2 { transform: rotate(-30deg) translateY(10px); animation: crack-shine 0.4s ease-out 0.05s; }
.crack.c3 { transform: rotate(60deg) translateY(-10px); animation: crack-shine 0.4s ease-out 0.1s; }

@keyframes crack-shine {
  0% { opacity: 0; transform: scale(0.5) rotate(var(--r, 0deg)); }
  100% { opacity: 1; transform: scale(1.2) rotate(var(--r, 0deg)); }
}

/* ── 闪光 ── */
.flash {
  position: absolute;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0%, #fff 30%, transparent 70%);
  animation: flash-burst 0.3s ease-out forwards;
  pointer-events: none;
}

@keyframes flash-burst {
  0% { transform: scale(0); opacity: 1; }
  100% { transform: scale(8); opacity: 0; }
}

/* ── 宠物蹦出 ── */
.pet-reveal {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.bouncing {
  animation: bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes bounce-in {
  0% {
    transform: translateY(-200px) scale(0.3);
    opacity: 0;
  }
  60% {
    transform: translateY(0) scale(1.1);
    opacity: 1;
  }
  80% {
    transform: translateY(-20px) scale(0.95);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

.pet-fallback {
  font-size: 120px;
  line-height: 1;
}

.reveal-text {
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 2px 12px rgba(255, 100, 50, 0.8);
  margin-top: 12px;
  animation: text-fade 0.5s ease-out 0.3s both;
}

@keyframes text-fade {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* ── 底部提示 ── */
.hint-text {
  position: absolute;
  bottom: 40px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 1px;
  height: 20px;
}
</style>