<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :title="`代喂食 · ${studentName || ''}`"
    width="520px"
  >
    <div v-loading="loading">
      <div v-if="!pet" class="empty">该学员尚未领养宠物</div>
      <div v-else>
        <el-alert :title="`当前阶 ${pet.tier} · Lv.${pet.level}`" type="info" :closable="false" style="margin-bottom:16px" />
        <el-form>
          <el-form-item label="选择消耗品">
            <el-select v-model="selectedKey" placeholder="选择食物 / 玩具" filterable style="width:100%">
              <el-option-group v-for="kind in PET_CONSUMABLE_KINDS" :key="kind" :label="PET_CONSUMABLE_KIND_LABELS[kind]">
                <el-option
                  v-for="c in consumables.filter(x => x.kind === kind)"
                  :key="c._id"
                  :label="`${c.name} (${formatPrice(c, pet.tier)})`"
                  :value="c.key"
                />
              </el-option-group>
            </el-select>
          </el-form-item>
        </el-form>
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!selectedKey" @click="onSubmit">确认喂食</el-button>
    </template>
  </el-dialog>
</template>

<script>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { petAdminApi } from '@/api/pet'
import { petCatalogApi } from '@/api/petCatalog'
import { PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS } from '@/utils/constants'

export default {
  name: 'FeedOnBehalfDialog',
  props: {
    visible: { type: Boolean, default: false },
    pet: { type: Object, default: null },
    studentName: { type: String, default: '' }
  },
  emits: ['update:visible', 'success'],
  setup(props, { emit }) {
    const loading = ref(false)
    const submitting = ref(false)
    const consumables = ref([])
    const selectedKey = ref('')

    async function load() {
      if (!props.pet) return
      loading.value = true
      try {
        const { data } = await petCatalogApi.listConsumables({ isActive: true, applicableTier: props.pet.tier || props.pet.eggTier })
        consumables.value = (data.items || []).filter(c => {
          if (c.applicableTier === 'all') return true
          return c.applicableTier === (props.pet.tier || props.pet.eggTier)
        })
      } catch (e) {
        consumables.value = []
      } finally {
        loading.value = false
      }
    }

    watch(() => props.visible, (v) => {
      if (v) {
        selectedKey.value = ''
        load()
      }
    })

    function formatPrice(c, tier) {
      const cfg = c.perTier && (c.perTier[tier] || c.perTier.all)
      if (!cfg) return '不可用'
      return `${cfg.pointCost}积分 / +${cfg.hungerRestore}饱 / +${cfg.expGain}exp`
    }

    async function onSubmit() {
      if (!props.pet || !selectedKey.value) return
      submitting.value = true
      try {
        await petAdminApi.feedOnBehalf(props.pet._id, { consumableKey: selectedKey.value })
        ElMessage.success('已喂食')
        emit('success')
        emit('update:visible', false)
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '喂食失败')
      } finally {
        submitting.value = false
      }
    }

    return {
      loading, submitting, consumables, selectedKey,
      PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS,
      formatPrice, onSubmit
    }
  }
}
</script>

<style scoped>
.empty { text-align: center; padding: 32px; color: #999; }
</style>