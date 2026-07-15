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
      <el-input v-model="filter.keyword" placeholder="按名称搜索" clearable style="width:240px" @keyup.enter="load" @clear="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建消耗品</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column label="图标" width="80">
        <template #default="{ row }">
          <div v-if="row.visualType === 'image' && row.imageFile" class="thumb svg-thumb clickable" @click="openPreview(row)">
            <el-image :src="row.imageFile.url" :alt="row.name" fit="cover" style="width:48px;height:48px;border-radius:6px" />
          </div>
          <div v-else-if="row.visualType === 'svg' && row.svgContent" class="thumb svg-thumb clickable" v-html="row.svgContent" @click="openPreview(row)" />
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
            <el-radio value="image">图片</el-radio>
            <el-radio value="svg">SVG</el-radio>
            <el-radio value="video">视频</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.visualType === 'image'" label="图标">
          <FilePicker v-model="imagePicker" scope="pet" mime-prefix="image/" title="选择图标" @select="onPickImage" />
          <div v-if="form.imageFile" class="preview">
            <el-image :src="form.imageFile.url" fit="cover" style="width:64px;height:64px;border-radius:6px" />
            <el-button link type="danger" @click="form.imageFile = null">清除</el-button>
          </div>
          <el-upload v-else :show-file-list="false" :auto-upload="true" :http-request="uploadImage" accept="image/*">
            <el-button :icon="Upload" size="small">上传新图</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item v-else-if="form.visualType === 'svg'" label="SVG 内容" prop="svgContent">
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
        <el-image v-if="previewRow.visualType === 'image' && previewRow.imageFile" :src="previewRow.imageFile.url" :alt="previewRow.name" fit="contain" style="width:100%;max-height:60vh" />
        <div v-else-if="previewRow.visualType === 'svg' && previewRow.svgContent" class="preview-large-svg" v-html="previewRow.svgContent" />
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Upload, Picture } from '@element-plus/icons-vue'
import { petCatalogApi } from '@/api/petCatalog'
import { storageApi } from '@/api/storage'
import FilePicker from '@/components/FilePicker.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { handleRemoveError } from '@/utils/removable'
import { PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS } from '@/utils/constants'

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
    const videoPicker = ref(false)
    const formRef = ref(null)
    const previewOpen = ref(false)
    const previewRow = ref(null)
    const form = reactive({
      _id: null, key: '', name: '', kind: 'food',
      pointCost: 5, hungerRestore: 15, expGain: 10,
      visualType: 'image', imageFile: null, svgContent: '', videoFile: null,
      isActive: true, description: ''
    })

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
    }

    function resetForm() {
      Object.assign(form, {
        _id: null, key: '', name: '', kind: 'food',
        pointCost: 5, hungerRestore: 15, expGain: 10,
        visualType: 'image', imageFile: null, svgContent: '', videoFile: null,
        isActive: true, description: ''
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
        _id: row._id, key: row.key, name: row.name, kind: row.kind,
        pointCost: row.pointCost ?? 0,
        hungerRestore: row.hungerRestore ?? 0,
        expGain: row.expGain ?? 0,
        visualType: row.visualType || 'image',
        imageFile: row.imageFile || null,
        svgContent: row.svgContent || '',
        videoFile: row.videoFile || null,
        isActive: row.isActive, description: row.description || ''
      })
      dialog.value = true
    }

    function onPickImage(file) { form.imageFile = file }
    function onPickVideo(file) { form.videoFile = file }

    async function uploadImage(req) {
      try {
        const { data } = await storageApi.upload({ file: req.file, scope: 'pet' })
        form.imageFile = data
      } catch (e) {
        ElMessage.error('图片上传失败')
      }
    }

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
          imageFile: form.visualType === 'image' ? (form.imageFile?.id || null) : null,
          svgContent: form.visualType === 'svg' ? (form.svgContent || null) : null,
          videoFile: form.visualType === 'video' ? (form.videoFile?.id || null) : null,
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

    function openPreview(row) {
      previewRow.value = row
      previewOpen.value = true
    }

    onMounted(load)

    return {
      filter, items, loading, dialog, saving, form, formRef, rules,
      imagePicker, videoPicker, previewOpen, previewRow,
      PET_CONSUMABLE_KINDS, PET_CONSUMABLE_KIND_LABELS,
      Plus, Upload, Picture,
      petCatalogApi,
      load, openCreate, openEdit, resetForm, onPickImage, onPickVideo, uploadImage, uploadVideo, submit, onRemoveConfirm, openPreview
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
