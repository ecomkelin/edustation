<template>
  <div class="page">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
      <template #title>平台级共享图鉴（2026-06-22 重构）</template>
      本表所有记录由<b>平台超管</b>统一管理，全机构共用一份。机构 admin 仅可查看，写操作会被后端拒绝。
    </el-alert>
    <div class="filter-bar">
      <el-select v-model="filter.kind" placeholder="类型" clearable style="width:120px" @change="load">
        <el-option v-for="k in PET_CONSUMABLE_KINDS" :key="k" :label="PET_CONSUMABLE_KIND_LABELS[k]" :value="k" />
      </el-select>
      <el-switch v-model="filter.isActive" active-text="仅启用" @change="load" />
      <el-input v-model="filter.keyword" placeholder="按名称搜索" clearable style="width:240px" @keyup.enter="load" @clear="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建消耗品</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column label="图标" width="80">
        <template #default="{ row }">
          <el-image v-if="row.imageFile" :src="row.imageFile.url" fit="cover" style="width:48px;height:48px;border-radius:6px" />
          <el-icon v-else :size="32" color="#ccc"><Picture /></el-icon>
        </template>
      </el-table-column>
      <el-table-column prop="key" label="Key" width="160" />
      <el-table-column prop="name" label="名称" width="140" />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.kind === 'food' ? 'success' : 'warning'">{{ PET_CONSUMABLE_KIND_LABELS[row.kind] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="适用阶" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ PET_CONSUMABLE_APPLICABLE_TIER_LABELS[row.applicableTier] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="数值预览" min-width="280">
        <template #default="{ row }">
          <span class="muted" v-if="row.applicableTier === 'all'">
            <span v-for="t in PET_TIERS" :key="t" style="margin-right:12px">
              <b>{{ t }}:</b> {{ row.perTier[t]?.pointCost || 0 }}积分 / +{{ row.perTier[t]?.hungerRestore || 0 }}饱 / +{{ row.perTier[t]?.expGain || 0 }}exp
            </span>
          </span>
          <span v-else>
            <b>{{ row.applicableTier }}:</b> {{ row.perTier[row.applicableTier]?.pointCost || 0 }}积分 / +{{ row.perTier[row.applicableTier]?.hungerRestore || 0 }}饱 / +{{ row.perTier[row.applicableTier]?.expGain || 0 }}exp
          </span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <DestructiveConfirm
            :target="`消耗品 ${row.name}`"
            warning="中风险"
            reason="该操作会从数据库物理删除消耗品记录。"
            :precheck-notes="['无业务引用']"
            :precheck="() => petCatalogApi.removableCheckConsumable(row._id).then((r) => r.data || r)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button link type="danger" size="small">删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="form._id ? '编辑消耗品' : '新建消耗品'" width="720px" :close-on-click-modal="false" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="Key" prop="key">
          <el-input v-model="form.key" :disabled="!!form._id" placeholder="全局唯一 key，如 food_normal_c" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="类型" prop="kind">
          <el-radio-group v-model="form.kind">
            <el-radio v-for="k in PET_CONSUMABLE_KINDS" :key="k" :label="k">{{ PET_CONSUMABLE_KIND_LABELS[k] }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="适用阶" prop="applicableTier">
          <el-radio-group v-model="form.applicableTier">
            <el-radio v-for="t in PET_CONSUMABLE_APPLICABLE_TIERS" :key="t" :label="t">{{ PET_CONSUMABLE_APPLICABLE_TIER_LABELS[t] }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- perTier 表格 -->
        <el-form-item label="数值配置">
          <el-table :data="perTierRows" border size="small" style="width:100%">
            <el-table-column label="阶" width="100">
              <template #default="{ row }">{{ row.tier }}</template>
            </el-table-column>
            <el-table-column label="积分价" width="120">
              <template #default="{ row }">
                <el-input-number v-model="row.pointCost" :min="0" :max="100000" :disabled="!row.editable" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="饱腹度" width="120">
              <template #default="{ row }">
                <el-input-number v-model="row.hungerRestore" :min="0" :max="100" :disabled="!row.editable" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="经验值">
              <template #default="{ row }">
                <el-input-number v-model="row.expGain" :min="0" :max="100000" :disabled="!row.editable" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <span v-if="!row.editable" class="muted">不适用</span>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>

        <el-form-item label="图标">
          <FilePicker v-model="imagePicker" scope="pet" mime-prefix="image/" title="选择图标" @select="onPickImage" />
          <div v-if="form.imageFile" class="preview">
            <el-image :src="form.imageFile.url" fit="cover" style="width:64px;height:64px;border-radius:6px" />
            <el-button link type="danger" @click="form.imageFile = null">清除</el-button>
          </div>
          <el-upload v-else :show-file-list="false" :auto-upload="true" :http-request="uploadImage" accept="image/*">
            <el-button :icon="Upload" size="small">上传新图</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Upload, Picture } from '@element-plus/icons-vue'
import { petCatalogApi } from '@/api/petCatalog'
import { storageApi } from '@/api/storage'
import FilePicker from '@/components/FilePicker.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { handleRemoveError } from '@/utils/removable'
import { PET_TIERS, PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS, PET_CONSUMABLE_APPLICABLE_TIERS, PET_CONSUMABLE_APPLICABLE_TIER_LABELS } from '@/utils/constants'

export default {
  name: 'PetConsumableAdmin',
  components: { FilePicker, DestructiveConfirm },
  setup() {
    const filter = reactive({ kind: '', isActive: true, keyword: '' })
    const items = ref([])
    const loading = ref(false)
    const dialog = ref(false)
    const saving = ref(false)
    const imagePicker = ref(false)
    const formRef = ref(null)
    const form = reactive({
      _id: null, key: '', name: '', kind: 'food', applicableTier: 'all',
      imageFile: null, isActive: true, description: ''
    })

    // perTier 行：按 applicableTier 决定哪些行可编辑
    const perTierRows = computed(() => {
      const rows = []
      for (const t of [...PET_TIERS, 'all']) {
        const cfg = form._id
          ? (items.value.find(i => i._id === form._id)?.perTier?.[t] || {})
          : (form[`_tier_${t}`] || {})
        rows.push({
          tier: t,
          pointCost: cfg.pointCost ?? 0,
          hungerRestore: cfg.hungerRestore ?? 0,
          expGain: cfg.expGain ?? 0,
          editable: form.applicableTier === 'all' ? t === 'all' : t === form.applicableTier
        })
      }
      return rows
    })

    const rules = {
      key: [{ required: true, message: 'key 必填', trigger: 'blur' }],
      name: [{ required: true, message: '名称 必填', trigger: 'blur' }],
      kind: [{ required: true, message: '类型 必填', trigger: 'change' }],
      applicableTier: [{ required: true, message: '适用阶 必填', trigger: 'change' }]
    }

    async function load() {
      loading.value = true
      try {
        const params = {
          kind: filter.kind || undefined,
          isActive: filter.isActive,
          keyword: filter.keyword || undefined
        }
        const { data } = await petCatalogApi.listConsumables(params)
        items.value = data.items || []
      } catch (e) {
        items.value = []
      } finally {
        loading.value = false
      }
    }

    function resetForm() {
      Object.assign(form, {
        _id: null, key: '', name: '', kind: 'food', applicableTier: 'all',
        imageFile: null, isActive: true, description: ''
      })
      formRef.value?.clearValidate()
    }

    function openCreate() {
      resetForm()
      dialog.value = true
    }

    function openEdit(row) {
      resetForm()
      Object.assign(form, {
        _id: row._id, key: row.key, name: row.name,
        kind: row.kind, applicableTier: row.applicableTier,
        imageFile: row.imageFile || null,
        isActive: row.isActive, description: row.description || ''
      })
      dialog.value = true
    }

    function onPickImage(file) {
      form.imageFile = file
    }

    async function uploadImage(req) {
      try {
        const { data } = await storageApi.upload({ file: req.file, scope: 'pet' })
        form.imageFile = data
      } catch (e) {
        ElMessage.error('图片上传失败')
      }
    }

    function buildPerTierPayload() {
      const out = { C: null, B: null, A: null, S: null, all: null }
      for (const row of perTierRows.value) {
        if (!row.editable) continue
        out[row.tier] = {
          pointCost: Number(row.pointCost) || 0,
          hungerRestore: Number(row.hungerRestore) || 0,
          expGain: Number(row.expGain) || 0
        }
      }
      // 校验
      if (form.applicableTier === 'all' && !out.all) throw new Error('适用阶为「通用」时必须填 all 行')
      if (form.applicableTier !== 'all' && !out[form.applicableTier]) throw new Error(`适用阶为「${form.applicableTier}」时必须填对应行`)
      return out
    }

    async function submit() {
      if (!formRef.value) return
      try { await formRef.value.validate() } catch (_) { return }
      saving.value = true
      try {
        const perTier = buildPerTierPayload()
        const payload = {
          key: form.key.trim(),
          name: form.name.trim(),
          kind: form.kind,
          applicableTier: form.applicableTier,
          perTier,
          imageFile: form.imageFile?.id || null,
          isActive: !!form.isActive,
          description: form.description || null
        }
        if (form._id) {
          await petCatalogApi.updateConsumable(form._id, payload)
          ElMessage.success('已更新')
        } else {
          await petCatalogApi.createConsumable(payload)
          ElMessage.success('已创建')
        }
        dialog.value = false
        await load()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || '保存失败')
      } finally {
        saving.value = false
      }
    }

    async function onRemoveConfirm(row, { password }) {
      try {
        await petCatalogApi.removeConsumable(row._id, { password })
        ElMessage.success('已删除')
        await load()
      } catch (e) {
        await handleRemoveError(e, '无法删除 · 中风险', `消耗品 ${row.name}`)
      }
    }

    onMounted(load)

    return {
      filter, items, loading, dialog, saving, form, formRef, rules,
      perTierRows, imagePicker,
      PET_TIERS, PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS,
      PET_CONSUMABLE_APPLICABLE_TIERS, PET_CONSUMABLE_APPLICABLE_TIER_LABELS,
      Plus, Upload, Picture,
      load, openCreate, openEdit, resetForm, onPickImage, uploadImage, submit, onRemoveConfirm
    }
  }
}
</script>

<style scoped>
.filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.muted { color: #999; font-size: 12px; }
.preview { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
</style>