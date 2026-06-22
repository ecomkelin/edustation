<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="title"
    width="640px"
    :close-on-click-modal="false"
  >
    <el-alert v-if="kind === 'item'" type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>从学员积分扣费购买装饰，购买后放入背包。可选立即装备该学员的宠物。</template>
    </el-alert>
    <el-alert v-else type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>从学员积分扣费购买食物/玩具，购买后立即为宠物喂一次。</template>
    </el-alert>

    <el-form label-width="80px">
      <el-form-item :label="kind === 'item' ? '装饰' : '食物/玩具'" required>
        <el-select v-model="picked" filterable :loading="loading" placeholder="输入关键字搜索" style="width:100%">
          <el-option
            v-for="opt in options"
            :key="opt.key"
            :label="opt.label"
            :value="opt.key"
            :disabled="opt.disabled"
          >
            <div class="opt-row">
              <!-- 2026-06-22: SVG/image 预览 chip（listShop 已返 visualType/svgContent/imageFile） -->
              <span class="opt-thumb">
                <img v-if="opt.visualType === 'image' && opt.imageFile?.url" :src="opt.imageFile.url" :alt="opt.label" />
                <span v-else-if="opt.visualType === 'svg' && opt.svgContent" class="opt-svg" v-html="opt.svgContent" />
                <span v-else class="opt-emoji">{{ kind === 'item' ? '🎁' : '🍖' }}</span>
              </span>
              <span class="opt-label">{{ opt.label }}</span>
              <span class="opt-price">{{ opt.priceText }}</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item v-if="pickedOpt" label="预览">
        <!-- 大图预览（让用户看清买的是什么） -->
        <div class="preview-box">
          <img v-if="pickedOpt.visualType === 'image' && pickedOpt.imageFile?.url" :src="pickedOpt.imageFile.url" :alt="pickedOpt.label" />
          <div v-else-if="pickedOpt.visualType === 'svg' && pickedOpt.svgContent" class="preview-svg" v-html="pickedOpt.svgContent" />
          <div v-else class="preview-empty">无预览</div>
        </div>
      </el-form-item>
      <el-form-item v-if="pickedOpt" label="积分">
        <el-tag type="danger">{{ pickedOpt.pointCost ?? pickedOpt.priceForTier }} 积分</el-tag>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { ShoppingCart } from '@element-plus/icons-vue'
import { petAdminApi } from '@/api/pet'

/**
 * 代买 dialog（admin 端通用：item / consumable）
 *
 * props:
 *   - kind: 'item' | 'consumable'
 *   - petAccountId
 *   - studentTier: 当前宠物阶（用于 consumable per-tier 价格）
 */
export default {
  name: 'GrantOnBehalfDialog',
  components: { ShoppingCart },
  props: {
    modelValue: { type: Boolean, default: false },
    kind: { type: String, default: 'item' },
    petAccountId: { type: String, default: null },
    studentTier: { type: String, default: null }
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
    title() {
      return this.kind === 'item' ? '代买装饰（扣学员积分）' : '代买食物/玩具（扣学员积分）'
    },
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
        const r = await petAdminApi.shopList({ tier: this.studentTier, petAccountId: this.petAccountId })
        const data = r.data || {}
        const list = this.kind === 'item' ? (data.items || []) : (data.consumables || [])
        this.options = list.map(it => {
          if (this.kind === 'item') {
            return {
              key: it.key,
              slot: it.slot,
              label: `${it.name}（${this.slotLabel(it.slot)}）`,
              pointCost: it.pointCost,
              priceText: `${it.pointCost} 积分`,
              hint: '',
              disabled: false,
              // 2026-06-22: 透传视觉字段（用于 dropdown 内 + 大图预览）
              visualType: it.visualType || 'image',
              svgContent: it.svgContent || null,
              imageFile: it.imageFile || null
            }
          } else {
            const price = it.priceForTier
            return {
              key: it.key,
              label: `${it.name}（${this.kindLabel(it.kind)} · ${this.tierLabel(it.applicableTier)}）`,
              priceForTier: price,
              pointCost: price,
              priceText: price !== null ? `${price} 积分` : '不适用',
              hint: price === null ? '当前阶不适用' : `+${it.expGain}经验 / +${it.hungerRestore}饱腹`,
              disabled: price === null,
              visualType: it.visualType || 'image',
              svgContent: it.svgContent || null,
              imageFile: it.imageFile || null
            }
          }
        })
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
        if (this.kind === 'item') {
          await petAdminApi.grantItem(this.petAccountId, { itemKey: this.picked })
          // B3: 弹「立即装备 / 稍后」选择（admin 端默认推荐"立即装备"）
          this.$emit('success')
          this.$emit('update:modelValue', false)
          await this.askEquip({ itemKey: this.picked })
        } else {
          await petAdminApi.grantConsumable(this.petAccountId, { consumableKey: this.picked })
          ElMessage.success('已代买并喂食')
          this.$emit('success')
          this.$emit('update:modelValue', false)
        }
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || '代买失败')
      } finally {
        this.submitting = false
      }
    },
    async askEquip({ itemKey }) {
      try {
        await ElMessageBox.confirm(
          '装饰已买，是否立即装备到宠物？',
          '代买成功',
          {
            type: 'success',
            confirmButtonText: '立即装备',
            cancelButtonText: '稍后'
          }
        )
        await petAdminApi.equipOnBehalf(this.petAccountId, { slot: this.pickedOpt.slot, itemKey })
        ElMessage.success('已装备')
      } catch (e) {
        if (e === 'cancel') return  // 用户选「稍后」
        ElMessage.error(e?.response?.data?.message || '装备失败')
      }
    },
    slotLabel(s) {
      const m = { hat: '帽子', scarf: '围巾', clothes: '衣服', accessory: '饰品', halo: '光环', background: '背景' }
      return m[s] || s
    },
    kindLabel(k) { return k === 'food' ? '食物' : k === 'toy' ? '玩具' : k },
    tierLabel(t) { return { C: 'C阶', B: 'B阶', A: 'A阶', S: 'S阶', all: '通用' }[t] || t }
  }
}
</script>

<style scoped>
/* 2026-06-22: dropdown 内 + 大图预览样式 */
.opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.opt-thumb {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fafbfc, #f0f2f5);
  border-radius: 4px;
  overflow: hidden;
}
.opt-thumb img,
.opt-thumb .opt-svg :deep(svg) {
  max-width: 28px;
  max-height: 28px;
  object-fit: contain;
}
.opt-thumb .opt-emoji { font-size: 20px; }
.opt-label { flex: 1; font-size: 13px; }
.opt-price { color: #f5222d; font-size: 12px; font-weight: 600; }

.preview-box {
  width: 120px;
  height: 120px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fafbfc, #f0f2f5);
  overflow: hidden;
}
.preview-box img,
.preview-box .preview-svg :deep(svg) {
  max-width: 100px;
  max-height: 100px;
  object-fit: contain;
}
.preview-empty { color: #c0c4cc; font-size: 12px; }
</style>