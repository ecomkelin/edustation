<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="装备管理 · 代换装"
    width="640px"
    :close-on-click-modal="false"
  >
    <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>点击背包中的物品即可装备到对应槽位；点击已装备的物品可卸下。装备 0 积分，仅写 equip/unequip 事件。</template>
    </el-alert>

    <div v-loading="loading" class="equip-grid">
      <div v-for="slot in PET_ITEM_SLOTS" :key="slot" class="slot-row">
        <div class="slot-label">
          {{ PET_ITEM_SLOT_LABELS[slot] }}
          <el-tag v-if="pet?.equipped?.[slot]" type="success" effect="dark" size="small" style="margin-left:6px">
            当前：{{ itemMap[pet.equipped[slot]]?.name || pet.equipped[slot] }}
          </el-tag>
          <el-tag v-else type="info" effect="plain" size="small" style="margin-left:6px">空</el-tag>
        </div>
        <div class="slot-items">
          <div
            v-for="entry in unlockedEntriesBySlot[slot]"
            :key="slot + ':' + entry.key"
            class="item-chip"
            :class="{ active: pet?.equipped?.[slot] === entry.key, dim: pet?.equipped?.[slot] && pet?.equipped?.[slot] !== entry.key }"
            :title="`${entry.name} (${entry.pointCost} 积分已购买)`"
            @click="onToggleEquip(slot, entry.key)"
          >
            <div class="chip-svg">
              <img v-if="entry.visualType === 'image' && entry.imageFile?.url" :src="entry.imageFile.url" :alt="entry.name" />
              <div v-else-if="entry.visualType === 'svg' && entry.svgContent" class="svg-wrap" v-html="entry.svgContent" />
              <div v-else class="no-svg">🎁</div>
            </div>
            <div class="chip-name">{{ entry.name }}</div>
            <div v-if="pet?.equipped?.[slot] === entry.key" class="chip-mark">✓ 已装备</div>
          </div>
          <span v-if="!unlockedEntriesBySlot[slot] || unlockedEntriesBySlot[slot].length === 0" class="empty">该槽位暂无已解锁物品</span>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { petAdminApi } from '@/api/pet'
import { petCatalogApi } from '@/api/petCatalog'
import { PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS } from '@/utils/constants'

/**
 * 装备管理弹窗（admin 端代换装；2026-06-22）
 *
 * props:
 *   - modelValue: 显示
 *   - pet: 必填；读 pet.unlocked / pet.equipped
 *   - petId: 必填；调 equipOnBehalf 时用
 *
 * 行为：
 *   - 打开时拉一次 items 列表（itemMap），用 key 查 name/visualType/svgContent/imageFile
 *   - 点击 chip：若未装备 → 装备；若是当前装备 → 卸下（itemKey=null）
 *   - 任何操作 emit 'changed' 让父组件 reload pet
 */
export default {
  name: 'EquipOnBehalfDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    pet: { type: Object, default: null },
    petId: { type: String, default: null }
  },
  emits: ['update:modelValue', 'changed'],
  setup(props, { emit }) {
    const loading = ref(false)
    // itemMap: { [key]: { name, slot, visualType, svgContent, imageFile, pointCost } }
    const itemMap = ref({})

    /**
     * 按 slot 汇总 pet.unlocked[slot]，每项带 name/visualType/svgContent/imageFile
     */
    const unlockedEntriesBySlot = computed(() => {
      const out = {}
      for (const slot of PET_ITEM_SLOTS) out[slot] = []
      const unlocked = props.pet?.unlocked || {}
      for (const slot of PET_ITEM_SLOTS) {
        const arr = Array.isArray(unlocked[slot]) ? unlocked[slot] : []
        out[slot] = arr
          .map(key => {
            const it = itemMap.value[key]
            if (!it) return null  // 过滤 catalog 里已下架/缺失的
            return {
              key,
              name: it.name,
              visualType: it.visualType,
              svgContent: it.svgContent || null,
              imageFile: it.imageFile || null,
              pointCost: it.pointCost
            }
          })
          .filter(Boolean)
      }
      return out
    })

    async function loadItemMap() {
      if (Object.keys(itemMap.value).length > 0) return  // 已有 cache
      loading.value = true
      try {
        // 平台 catalog 无 org；pageSize 拉满
        const { data } = await petCatalogApi.listItems({ pageSize: 100 })
        const map = {}
        for (const it of (data.items || [])) {
          map[it.key] = {
            name: it.name,
            slot: it.slot,
            visualType: it.visualType,
            svgContent: it.svgContent || null,
            imageFile: it.imageFile || null,
            pointCost: it.pointCost
          }
        }
        itemMap.value = map
      } catch (e) {
        itemMap.value = {}
      } finally {
        loading.value = false
      }
    }

    async function onToggleEquip(slot, key) {
      if (!props.petId) return
      const currentKey = props.pet?.equipped?.[slot] || null
      const isEquipped = currentKey === key
      const nextItemKey = isEquipped ? null : key
      const itemName = itemMap.value[key]?.name || key
      try {
        await petAdminApi.equipOnBehalf(props.petId, { slot, itemKey: nextItemKey })
        ElMessage.success(isEquipped ? `已卸下 ${itemName}` : `已装备 ${itemName}`)
        emit('changed')
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || (isEquipped ? '卸下失败' : '装备失败'))
      }
    }

    watch(() => props.modelValue, (v) => {
      if (v) loadItemMap()
    })

    return {
      loading, itemMap,
      PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS,
      unlockedEntriesBySlot,
      onToggleEquip
    }
  }
}
</script>

<style scoped>
.equip-grid { display: flex; flex-direction: column; gap: 12px; }
.slot-row {
  background: rgba(0,0,0,0.02);
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
}
.slot-label {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #303133;
}
.slot-items {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 64px;
}
.item-chip {
  position: relative;
  width: 96px;
  border: 2px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
  padding-bottom: 4px;
}
.item-chip:hover { border-color: #409eff; transform: translateY(-2px); }
.item-chip.active {
  border-color: #67c23a;
  background: #f0f9eb;
  box-shadow: 0 0 0 2px rgba(103, 194, 58, 0.2);
}
.item-chip.dim { opacity: 0.5; }
.item-chip .chip-svg {
  width: 96px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(135deg, #fafbfc, #f0f2f5);
}
.item-chip .chip-svg :deep(svg) {
  width: 100%;
  height: 100%;
  max-width: 80px;
  max-height: 56px;
}
.item-chip .chip-svg img {
  max-width: 80px;
  max-height: 56px;
  object-fit: contain;
}
.item-chip .chip-svg .no-svg { font-size: 32px; }
.item-chip .chip-name {
  font-size: 12px;
  color: #606266;
  margin-top: 4px;
  padding: 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-chip .chip-mark {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #67c23a;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
}
.empty { color: #c0c4cc; font-size: 12px; align-self: center; }
</style>