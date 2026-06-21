<template>
  <div class="page">
    <div class="filter-bar">
      <el-select v-model="filter.slot" placeholder="槽位" clearable style="width:140px" @change="load">
        <el-option v-for="s in PET_ITEM_SLOTS" :key="s" :label="PET_ITEM_SLOT_LABELS[s]" :value="s" />
      </el-select>
      <el-switch v-model="filter.isActive" active-text="仅启用" @change="load" />
      <el-input v-model="filter.keyword" placeholder="按名称搜索" clearable style="width:240px" @keyup.enter="load" @clear="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建装饰</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column label="贴图" width="80">
        <template #default="{ row }">
          <el-image v-if="row.imageFile" :src="row.imageFile.url" fit="cover" style="width:48px;height:48px;border-radius:6px" />
          <el-icon v-else :size="32" color="#ccc"><Picture /></el-icon>
        </template>
      </el-table-column>
      <el-table-column prop="key" label="Key" width="160" />
      <el-table-column prop="name" label="名称" width="140" />
      <el-table-column label="槽位" width="100">
        <template #default="{ row }">
          <el-tag size="small">{{ PET_ITEM_SLOT_LABELS[row.slot] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="解锁" width="120">
        <template #default="{ row }">
          <span v-if="row.unlockType === 'level'">Lv.{{ row.unlockLevel }}</span>
          <span v-else>{{ PET_TIER_LABELS[row.unlockTier] }} 阶</span>
        </template>
      </el-table-column>
      <el-table-column label="适用物种" width="180">
        <template #default="{ row }">
          <span v-if="!row.compatibleSpecies || row.compatibleSpecies.length === 0" class="muted">通用</span>
          <el-tag v-for="s in (row.compatibleSpecies || []).slice(0, 3)" :key="s" size="small" type="info" style="margin-right:4px">{{ s }}</el-tag>
          <span v-if="row.compatibleSpecies && row.compatibleSpecies.length > 3" class="muted">+{{ row.compatibleSpecies.length - 3 }}</span>
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
            :target="`装饰 ${row.name}`"
            warning="中风险"
            reason="该操作会从数据库物理删除装饰记录。"
            :precheck-notes="['无宠物已解锁此装饰']"
            :precheck="() => petCatalogApi.removableCheckItem(row._id).then((r) => r.data || r)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button link type="danger" size="small">删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="form._id ? '编辑装饰' : '新建装饰'" width="640px" :close-on-click-modal="false" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="Key" prop="key">
          <el-input v-model="form.key" :disabled="!!form._id" placeholder="全局唯一 key，如 hat_party" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="槽位" prop="slot">
          <el-select v-model="form.slot" :disabled="!!form._id" style="width:100%">
            <el-option v-for="s in PET_ITEM_SLOTS" :key="s" :label="PET_ITEM_SLOT_LABELS[s]" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="解锁类型" prop="unlockType">
          <el-radio-group v-model="form.unlockType">
            <el-radio v-for="u in PET_ITEM_UNLOCK_TYPES" :key="u" :label="u">{{ PET_ITEM_UNLOCK_TYPE_LABELS[u] }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.unlockType === 'level'" label="解锁等级" prop="unlockLevel">
          <el-input-number v-model="form.unlockLevel" :min="1" :max="30" />
        </el-form-item>
        <el-form-item v-else label="解锁阶" prop="unlockTier">
          <el-radio-group v-model="form.unlockTier">
            <el-radio v-for="t in PET_TIERS" :key="t" :label="t">{{ PET_TIER_LABELS[t] }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="贴图">
          <FilePicker v-model="imagePicker" scope="pet" mime-prefix="image/" title="选择装饰贴图" @select="onPickImage" />
          <div v-if="form.imageFile" class="preview">
            <el-image :src="form.imageFile.url" fit="cover" style="width:96px;height:96px;border-radius:6px" />
            <el-button link type="danger" @click="form.imageFile = null">清除</el-button>
          </div>
          <el-upload v-else :show-file-list="false" :auto-upload="true" :http-request="uploadImage" accept="image/*">
            <el-button :icon="Upload" size="small">上传新图</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="适用物种">
          <el-select v-model="form.compatibleSpecies" multiple filterable placeholder="留空 = 通用；选具体 species = UI 推荐提示" style="width:100%">
            <el-option v-for="sp in speciesOptions" :key="sp.key" :label="`${sp.name} (${sp.key})`" :value="sp.key" />
          </el-select>
          <span class="hint">此字段仅 UI 提示，equip 不强制校验（D2 决策）</span>
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Upload, Picture } from '@element-plus/icons-vue'
import { petCatalogApi } from '@/api/petCatalog'
import { storageApi } from '@/api/storage'
import FilePicker from '@/components/FilePicker.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { handleRemoveError } from '@/utils/removable'
import { PET_TIERS, PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS, PET_ITEM_UNLOCK_TYPES, PET_ITEM_UNLOCK_TYPE_LABELS } from '@/utils/constants'

export default {
  name: 'PetItemAdmin',
  components: { FilePicker, DestructiveConfirm },
  setup() {
    const filter = reactive({ slot: '', isActive: true, keyword: '' })
    const items = ref([])
    const speciesOptions = ref([])
    const loading = ref(false)
    const dialog = ref(false)
    const saving = ref(false)
    const imagePicker = ref(false)
    const formRef = ref(null)
    const form = reactive({
      _id: null,
      key: '', name: '', slot: 'hat', unlockType: 'level',
      unlockTier: 'C', unlockLevel: 1,
      imageFile: null, compatibleSpecies: [], isActive: true, description: ''
    })
    const rules = {
      key: [{ required: true, message: 'key 必填', trigger: 'blur' }],
      name: [{ required: true, message: '名称 必填', trigger: 'blur' }],
      slot: [{ required: true, message: '槽位 必填', trigger: 'change' }],
      unlockType: [{ required: true, message: '解锁类型 必填', trigger: 'change' }]
    }

    async function load() {
      loading.value = true
      try {
        const params = {
          slot: filter.slot || undefined,
          isActive: filter.isActive,
          keyword: filter.keyword || undefined
        }
        const { data } = await petCatalogApi.listItems(params)
        items.value = data.items || []
      } catch (e) {
        items.value = []
      } finally {
        loading.value = false
      }
    }

    async function loadSpeciesOptions() {
      try {
        const { data } = await petCatalogApi.listSpecies({ isActive: true })
        speciesOptions.value = data.items || []
      } catch (e) {
        speciesOptions.value = []
      }
    }

    function resetForm() {
      Object.assign(form, {
        _id: null, key: '', name: '', slot: 'hat', unlockType: 'level',
        unlockTier: 'C', unlockLevel: 1,
        imageFile: null, compatibleSpecies: [], isActive: true, description: ''
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
        slot: row.slot, unlockType: row.unlockType,
        unlockTier: row.unlockTier || 'C', unlockLevel: row.unlockLevel || 1,
        imageFile: row.imageFile || null,
        compatibleSpecies: row.compatibleSpecies || [],
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

    async function submit() {
      if (!formRef.value) return
      try { await formRef.value.validate() } catch (_) { return }
      saving.value = true
      try {
        const payload = {
          key: form.key.trim(), name: form.name.trim(),
          slot: form.slot, unlockType: form.unlockType,
          unlockTier: form.unlockType === 'tier' ? form.unlockTier : 'C',
          unlockLevel: form.unlockType === 'level' ? form.unlockLevel : 1,
          imageFile: form.imageFile?.id || null,
          compatibleSpecies: form.compatibleSpecies,
          isActive: !!form.isActive,
          description: form.description || null
        }
        if (form._id) {
          await petCatalogApi.updateItem(form._id, payload)
          ElMessage.success('已更新')
        } else {
          await petCatalogApi.createItem(payload)
          ElMessage.success('已创建')
        }
        dialog.value = false
        await load()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '保存失败')
      } finally {
        saving.value = false
      }
    }

    async function onRemoveConfirm(row, { password }) {
      try {
        await petCatalogApi.removeItem(row._id, { password })
        ElMessage.success('已删除')
        await load()
      } catch (e) {
        await handleRemoveError(e, '无法删除 · 中风险', `装饰 ${row.name}`)
      }
    }

    onMounted(() => { loadSpeciesOptions(); load() })

    return {
      filter, items, loading, dialog, saving, form, formRef, rules,
      speciesOptions, imagePicker,
      PET_TIERS, PET_TIER_LABELS, PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS, PET_ITEM_UNLOCK_TYPES, PET_ITEM_UNLOCK_TYPE_LABELS,
      Plus, Upload, Picture,
      load, openCreate, openEdit, resetForm, onPickImage, uploadImage, submit, onRemoveConfirm
    }
  }
}
</script>

<style scoped>
.filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.hint { margin-left: 12px; color: #999; font-size: 12px; }
.preview { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.muted { color: #999; font-size: 12px; }
</style>