<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="代买食物/玩具（扣学员积分）"
    width="600px"
    :close-on-click-modal="false"
  >
    <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>从学员积分扣费购买食物/玩具，购买后立即为宠物喂一次。</template>
    </el-alert>

    <el-form label-width="80px">
      <el-form-item label="食物/玩具" required>
        <el-select v-model="picked" filterable :loading="loading" placeholder="输入关键字搜索" style="width:100%">
          <el-option v-for="opt in options" :key="opt.key" :label="opt.label" :value="opt.key">
            <div class="opt-row">
              <span class="opt-thumb">
                <span v-if="opt.visualType === 'svg' && opt.svgContent" class="opt-svg" v-html="opt.svgContent" />
                <video v-else-if="opt.visualType === 'video' && opt.videoFile?.url" :src="opt.videoFile.url" muted preload="metadata" />
                <span v-else class="opt-emoji">🍖</span>
              </span>
              <span class="opt-label">{{ opt.label }}</span>
              <span class="opt-price">{{ opt.priceText }}</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item v-if="pickedOpt" label="积分">
        <el-tag type="danger">{{ pickedOpt.pointCost }} 积分</el-tag>
        <span style="margin-left:12px;color:#909399;font-size:12px">{{ pickedOpt.hint }}</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!picked" @click="submit">
        <el-icon style="margin-right:4px"><ShoppingCart /></el-icon>确认代买
      </el-button>
    </template>
  </el-dialog>
</template>

<script>
import { ElMessage } from 'element-plus'
import { ShoppingCart } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'

/**
 * 代买 dialog（admin 端，2026-07-15 重构后仅消耗品）
 *
 * props:
 *   - petAccountId
 */
export default {
  name: 'GrantOnBehalfDialog',
  components: { ShoppingCart },
  props: {
    modelValue: { type: Boolean, default: false },
    kind: { type: String, default: 'consumable' },
    petAccountId: { type: String, default: null }
  },
  emits: ['update:modelValue', 'success'],
  data() {
    return {
      picked: null,
      options: [],
      loading: false,
      submitting: false,
      ShoppingCart
    }
  },
  computed: {
    pickedOpt() {
      return this.options.find(o => o.key === this.picked)
    }
  },
  watch: {
    modelValue(v) {
      if (v) {
        this.picked = null
        this.load()
      }
    }
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const r = await petAdminApi.shopList({})
        const data = r.data || {}
        this.options = (data.consumables || []).map(it => ({
          key: it.key,
          label: `${it.name}（${this.kindLabel(it.kind)}）`,
          pointCost: it.pointCost,
          priceText: `${it.pointCost} 积分`,
          hint: `+${it.expGain}经验 / +${it.hungerRestore}饱腹`,
          visualType: it.visualType || 'svg',
          svgContent: it.svgContent || null,
          videoFile: it.videoFile || null
        }))
      } catch (e) {
        this.options = []
      } finally {
        this.loading = false
      }
    },
    async submit() {
      if (!this.picked || !this.petAccountId) return
      this.submitting = true
      try {
        await petAdminApi.grantConsumable(this.petAccountId, { consumableKey: this.picked })
        ElMessage.success('已代买并喂食')
        this.$emit('success')
        this.$emit('update:modelValue', false)
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || '代买失败')
      } finally {
        this.submitting = false
      }
    },
    kindLabel(k) { return k === 'food' ? '食物' : k === 'toy' ? '玩具' : k }
  }
}
</script>

<style scoped>
.opt-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.opt-thumb {
  width: 32px; height: 32px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #fafbfc, #f0f2f5); border-radius: 4px; overflow: hidden;
}
.opt-thumb img, .opt-thumb video, .opt-thumb .opt-svg :deep(svg) { max-width: 28px; max-height: 28px; object-fit: contain; }
.opt-thumb .opt-emoji { font-size: 20px; }
.opt-label { flex: 1; font-size: 13px; }
.opt-price { color: #f5222d; font-size: 12px; font-weight: 600; }
</style>
