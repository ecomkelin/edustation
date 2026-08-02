<template>
  <div class="page">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
      <template #title>平台级共享图鉴</template>
      本表所有记录由<b>平台超管</b>统一管理，全机构共用一份。喂食数值为单套（无等阶）。
    </el-alert>
    <div class="filter-bar">
      <el-select v-model="filter.kind" placeholder="类型" clearable style="width:120px" @change="load">
        <el-option v-for="k in PET_CONSUMABLE_KINDS" :key="k" :label="PET_CONSUMABLE_KIND_LABELS[k]" :value="k" />
      </el-select>
      <el-switch v-model="filter.isActive" active-text="仅启用" @change="load" />
      <el-input v-model="filter.keyword" placeholder="按名称搜索" clearable autocomplete="off" style="width:240px" @keyup.enter="load" @clear="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <!-- 2026-07-22: pet.write 控制 (平台超管默认可, 「平台 · 内容主编」也可, 普通用户看不到) -->
      <el-button v-if="canPetWrite" type="primary" :icon="Plus" @click="openCreate">新建消耗品</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column label="图标" width="80">
        <template #default="{ row }">
          <div v-if="row.visualType === 'svg' && row.svgContent" class="thumb svg-thumb clickable" v-html="row.svgContent" @click="openPreview(row)" />
          <div v-else-if="row.visualType === 'video' && row.videoFile" class="thumb svg-thumb clickable" @click="openPreview(row)">
            <video :src="row.videoFile.url" muted preload="metadata" style="width:48px;height:48px;object-fit:cover;border-radius:6px" />
          </div>
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
      <el-table-column label="数值" min-width="240">
        <template #default="{ row }">
          <span>{{ row.pointCost }}积分 / +{{ row.hungerRestore }}饱 / +{{ row.expGain }}exp</span>
        </template>
      </el-table-column>
      <!-- 2026-07-21 v4: 归属列 — 通用 / 某物种专属（多个） -->
      <el-table-column label="归属" width="220">
        <template #default="{ row }">
          <el-tag v-if="Array.isArray(row.ownerSpecies) && row.ownerSpecies.length > 0" size="small" type="warning">🔒 {{ ownerLabel(row) }}</el-tag>
          <el-tag v-else size="small" type="info">通用</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <!-- 2026-07-22: pet.write 控制; 物理删除 (DestructiveConfirm) 额外 requirePlatformAdmin + 密码, 即便按钮可见普通用户也 403 -->
          <template v-if="canPetWrite">
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
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="form._id ? '编辑消耗品' : '新建消耗品'" width="640px" :close-on-click-modal="false" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="Key" prop="key">
          <el-input v-model="form.key" :disabled="!!form._id" placeholder="全局唯一 key，如 food_normal" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="类型" prop="kind">
          <el-radio-group v-model="form.kind">
            <el-radio v-for="k in PET_CONSUMABLE_KINDS" :key="k" :value="k">{{ PET_CONSUMABLE_KIND_LABELS[k] }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="积分价" prop="pointCost">
          <el-input-number v-model="form.pointCost" :min="0" :max="100000" />
        </el-form-item>
        <el-form-item label="饱腹度">
          <el-input-number v-model="form.hungerRestore" :min="0" :max="1000" />
          <span class="hint">喂食恢复饱腹度（0-1000）</span>
        </el-form-item>
        <el-form-item label="经验值">
          <el-input-number v-model="form.expGain" :min="0" :max="100000" />
        </el-form-item>

        <el-form-item label="视觉类型" prop="visualType">
          <el-radio-group v-model="form.visualType" :disabled="!!form._id">
            <el-radio value="svg">SVG</el-radio>
            <el-radio value="video">视频</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- 2026-07-21 v4: 归属 (通用 / 某几个物种专属 — 多选) -->
        <el-form-item label="归属">
          <el-radio-group v-model="ownerMode">
            <el-radio value="universal">🐾 通用（任意宠物可喂）</el-radio>
            <el-radio value="specific">🔒 专属（仅某物种可喂，可多选）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="ownerMode === 'specific'" label="专属物种">
          <!-- 2026-07-21 v4: picker 改为 PetSpecies 多选（共享图鉴） -->
          <el-select
            v-model="form.ownerSpecies"
            multiple
            filterable
            collapse-tags
            :loading="loadingSpecies"
            placeholder="选择宠物物种（可多选）"
            style="width: 400px"
          >
            <el-option v-for="s in speciesOptions" :key="s.key" :label="speciesOptionLabel(s)" :value="s.key" />
          </el-select>
          <span class="hint">限定后仅这些物种的宠物可喂；跟学员宠物实例是间接关系（共享图鉴）</span>
        </el-form-item>
        <el-form-item v-if="form.visualType === 'svg'" label="SVG 内容" prop="svgContent">
          <el-input v-model="form.svgContent" type="textarea" :rows="6" placeholder="<svg>...</svg>" />
          <div v-if="form.svgContent" class="preview svg-preview" v-html="form.svgContent" />
        </el-form-item>
        <el-form-item v-else label="视频文件">
          <FilePicker v-model="videoPicker" scope="pet" mime-prefix="video/" title="选择图标视频" @select="onPickVideo" />
          <div v-if="form.videoFile" class="preview">
            <video :src="form.videoFile.url" controls preload="metadata" style="width:200px;max-height:140px;border-radius:6px" />
            <el-button link type="danger" @click="form.videoFile = null">清除</el-button>
          </div>
          <el-upload v-else :show-file-list="false" :auto-upload="true" :http-request="uploadVideo" accept="video/*">
            <el-button :icon="Upload" size="small">上传新视频</el-button>
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

    <!-- 图标大图预览 -->
    <el-dialog v-model="previewOpen" :title="previewRow ? `${previewRow.name}（${previewRow.key}）` : '图标预览'" width="480px" :show-close="true" align-center>
      <div v-if="previewRow" class="preview-large-wrap">
        <div v-if="previewRow.visualType === 'svg' && previewRow.svgContent" class="preview-large-svg" v-html="previewRow.svgContent" />
        <video v-else-if="previewRow.visualType === 'video' && previewRow.videoFile" :src="previewRow.videoFile.url" controls autoplay muted loop style="width:100%;max-height:60vh;background:#000" />
        <div v-else class="preview-large-empty">
          <el-icon :size="64" color="#ccc"><Picture /></el-icon>
          <span>暂无图标</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Upload, Picture } from '@element-plus/icons-vue'
import { petCatalogApi } from '@/api/petCatalog'
import { storageApi } from '@/api/storage'
import FilePicker from '@/components/FilePicker.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { handleRemoveError } from '@/utils/removable'
import { PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS } from '@/utils/constants'
import { useUserPerms } from '@/composables/useUserPerms'

export default {
  // 2026-07-15: 从 PetConsumableAdmin 改为 PetConsumableTab (作为 PetCatalogAdmin 的子 tab 渲染)
  name: 'PetConsumableTab',
  components: { FilePicker, DestructiveConfirm },
  setup() {
    // 2026-07-22: pet.write 权限 (平台超管默认可, 「平台 · 内容主编」也可, 普通用户看不到)
    const { can: canPerm } = useUserPerms()
    const canPetWrite = canPerm('pet.write')

    const filter = reactive({ kind: '', isActive: true, keyword: '' })
    const items = ref([])
    const loading = ref(false)
    const dialog = ref(false)
    const saving = ref(false)
    const videoPicker = ref(false)
    const formRef = ref(null)
    const previewOpen = ref(false)
    const previewRow = ref(null)
    const form = reactive({
      _id: null, key: '', name: '', kind: 'food',
      pointCost: 5, hungerRestore: 15, expGain: 10,
      visualType: 'svg', svgContent: '', videoFile: null,
      isActive: true, description: '',
      // 2026-07-21 v4: 限定物种（PetSpecies.key 数组；空数组 = 通用）
      ownerSpecies: []
    })

    // 2026-07-21 v3: 归属 picker 状态
    const ownerMode = ref('universal')     // 'universal' | 'specific'
    // 宠物图鉴（PetSpecies）— 平台级共享
    const speciesOptions = ref([])
    const loadingSpecies = ref(false)

    const rules = {
      key: [{ required: true, message: 'key 必填', trigger: 'blur' }],
      name: [{ required: true, message: '名称 必填', trigger: 'blur' }],
      kind: [{ required: true, message: '类型 必填', trigger: 'change' }],
      pointCost: [{ required: true, message: '积分价 必填', trigger: 'blur' }],
      visualType: [{ required: true, message: '视觉类型 必填', trigger: 'change' }]
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
      // 2026-07-21 v4: 同时加载物种（用于列表 ownerLabel 翻译；与表单 picker 共享缓存）
      if (speciesOptions.value.length === 0) loadSpecies()
    }

    function resetForm() {
      Object.assign(form, {
        _id: null, key: '', name: '', kind: 'food',
        pointCost: 5, hungerRestore: 15, expGain: 10,
        visualType: 'svg', svgContent: '', videoFile: null,
        isActive: true, description: '',
        ownerSpecies: []
      })
      ownerMode.value = 'universal'
      formRef.value?.clearValidate()
    }

    // 2026-07-21 v4: 列表「归属」列展示标签
    function ownerLabel(row) {
      const owners = row.ownerSpecies || []
      if (!Array.isArray(owners) || owners.length === 0) return ''
      // ownerSpecies 是 PetSpecies.key 字符串数组; 用本地 speciesOptions 翻译为中文名
      return owners.map((k) => {
        const sp = speciesOptions.value.find((s) => s.key === k)
        return sp?.name || k
      }).join('、')
    }

    // 2026-07-21 v3: 物种 picker 的展示标签
    function speciesOptionLabel(s) {
      return `${s.name || s.key} (${s.key})`
    }

    // 2026-07-21 v3: 加载宠物图鉴（PetSpecies 平台级共享）
    async function loadSpecies() {
      loadingSpecies.value = true
      try {
        const r = await petCatalogApi.listSpecies({ isActive: true })
        speciesOptions.value = r.data?.items || r.items || []
      } catch (e) {
        speciesOptions.value = []
      } finally {
        loadingSpecies.value = false
      }
    }

    // 监听 ownerMode 切换 — 切到通用时清空 owner
    watch(ownerMode, (v) => {
      if (v === 'universal') {
        form.ownerSpecies = []
      } else if (v === 'specific' && speciesOptions.value.length === 0) {
        // 第一次切到专属模式时主动加载一次
        loadSpecies()
      }
    })

    function openCreate() {
      resetForm()
      dialog.value = true
    }

    async function openEdit(row) {
      resetForm()
      Object.assign(form, {
        _id: row._id, key: row.key, name: row.name, kind: row.kind,
        pointCost: row.pointCost ?? 0,
        hungerRestore: row.hungerRestore ?? 0,
        expGain: row.expGain ?? 0,
        visualType: row.visualType || 'svg',
        svgContent: row.svgContent || '',
        videoFile: row.videoFile || null,
        isActive: row.isActive, description: row.description || ''
      })
      // 2026-07-21 v4: 加载 ownerSpecies (PetSpecies.key 数组)
      const owners = row.ownerSpecies || []
      if (Array.isArray(owners) && owners.length > 0) {
        ownerMode.value = 'specific'
        await loadSpecies()
        form.ownerSpecies = [...owners]
      } else {
        ownerMode.value = 'universal'
      }
      dialog.value = true
    }

    function onPickVideo(file) { form.videoFile = file }

    async function uploadVideo(req) {
      try {
        const { data } = await storageApi.upload({ file: req.file, scope: 'pet' })
        form.videoFile = data
      } catch (e) {
        ElMessage.error('视频上传失败')
      }
    }

    async function submit() {
      if (!formRef.value) return
      try { await formRef.value.validate() } catch (_) { return }
      // 2026-07-21 v4: owner 校验（数组）
      if (ownerMode.value === 'specific' && (!Array.isArray(form.ownerSpecies) || form.ownerSpecies.length === 0)) {
        ElMessage.error('请选择至少 1 个专属物种')
        return
      }
      saving.value = true
      try {
        const payload = {
          key: form.key.trim(),
          name: form.name.trim(),
          kind: form.kind,
          pointCost: Number(form.pointCost) || 0,
          hungerRestore: Number(form.hungerRestore) || 0,
          expGain: Number(form.expGain) || 0,
          visualType: form.visualType,
          svgContent: form.visualType === 'svg' ? (form.svgContent || null) : null,
          videoFile: form.visualType === 'video' ? (form.videoFile?.id || null) : null,
          isActive: !!form.isActive,
          description: form.description || null,
          // 2026-07-21 v4: 限定物种（universal 模式空数组清空）
          ownerSpecies: ownerMode.value === 'specific' ? form.ownerSpecies : []
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

    function openPreview(row) {
      previewRow.value = row
      previewOpen.value = true
    }

    onMounted(load)

    return {
      canPetWrite,
      filter, items, loading, dialog, saving, form, formRef, rules,
      videoPicker, previewOpen, previewRow,
      ownerMode, speciesOptions, loadingSpecies,
      PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS,
      Plus, Upload, Picture,
      petCatalogApi,
      load, openCreate, openEdit, resetForm, onPickVideo, uploadVideo, submit, onRemoveConfirm, openPreview,
      ownerLabel, speciesOptionLabel, loadSpecies
    }
  }
}
</script>

<style scoped>
.filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.muted { color: #999; font-size: 12px; }
.hint { margin-left: 12px; color: #999; font-size: 12px; }
.preview { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.thumb { display: flex; align-items: center; justify-content: center; }
.svg-thumb { width: 48px; height: 48px; }
.svg-thumb svg { width: 100%; height: 100%; }
.svg-preview { width: 64px; height: 64px; border: 1px dashed #ccc; border-radius: 6px; padding: 4px; }
.svg-preview svg { width: 100%; height: 100%; }
.clickable { cursor: zoom-in; transition: transform 0.15s ease; }
.clickable:hover { transform: scale(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); border-radius: 6px; }
.preview-large-wrap { display: flex; align-items: center; justify-content: center; padding: 16px; }
.preview-large-svg { width: 100%; max-width: 400px; max-height: 60vh; display: flex; align-items: center; justify-content: center; }
.preview-large-svg svg { width: 100%; height: auto; max-height: 60vh; display: block; }
.preview-large-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #999; padding: 32px; }
</style>
