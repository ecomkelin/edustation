<!--
  PetSpeciesTab (2026-07-15)
  从原 PetSpeciesAdmin.vue (2026-06-21) 整体迁移, body 不变; 只改 name.
  作为 PetCatalogAdmin 的「宠物图鉴」tab 渲染体. 后端路由 /admin/pet/species
  仍 requirePlatformAdmin 兜底 (机构 admin 写操作会 403).
-->
<template>
  <div class="page">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
      <template #title>平台级共享图鉴（宠物本体统一用视频）</template>
      本表所有记录由<b>平台超管</b>统一管理，全机构共用一份。宠物形象建议使用 <b>9:16 竖版视频</b>（前端裁成正方形展示）。
    </el-alert>
    <div class="filter-bar">
      <el-switch v-model="filter.isActive" active-text="仅启用" @change="load" />
      <el-input v-model="filter.keyword" placeholder="按名称搜索" clearable style="width:240px" @keyup.enter="load" @clear="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建物种</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column label="形象" width="80">
        <template #default="{ row }">
          <div v-if="row.visualType === 'image' && row.imageFile" class="thumb svg-thumb clickable" @click="openPreview(row)">
            <el-image :src="row.imageFile.url" :alt="row.name" fit="cover" style="width:48px;height:48px;border-radius:6px" />
          </div>
          <div v-else-if="row.visualType === 'svg' && row.svgContent" class="thumb svg-thumb clickable" v-html="row.svgContent" @click="openPreview(row)" />
          <div v-else-if="row.visualType === 'video' && row.videoFile" class="thumb video-thumb clickable" @click="openPreview(row)">
            <!-- 2026-07-12: 列表缩略图 = 静态首帧 + ▶ 角标，hover 不自动播（避免 16 行同时解码） -->
            <video :src="row.videoFile.url" muted preload="metadata" class="video-frame" />
            <el-icon :size="20" class="video-play-icon"><VideoPlay /></el-icon>
          </div>
          <el-icon v-else :size="32" color="#ccc"><Picture /></el-icon>
        </template>
      </el-table-column>
      <el-table-column prop="key" label="Key" width="160" sortable />
      <el-table-column prop="name" label="名称" width="160" sortable />
      <el-table-column prop="weight" label="权重" width="80" sortable />
      <el-table-column label="衰减" width="100" sortable prop="hungerDecayMinutes">
        <template #default="{ row }">
          <el-tag size="small">{{ row.hungerDecayMinutes || 60 }} 分/点</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="视觉" width="80">
        <template #default="{ row }">{{ VISUAL_LABELS[row.visualType] }}</template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="180" sortable prop="updatedAt">
        <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <DestructiveConfirm
            :target="`物种 ${row.name}`"
            warning="中风险"
            reason="该操作会从数据库物理删除物种记录，删除后无法恢复。"
            :precheck-notes="['无宠物实例引用此 species']"
            :precheck="() => petCatalogApi.removableCheckSpecies(row._id).then((r) => r.data || r)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button link type="danger" size="small">删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑 dialog -->
    <el-dialog v-model="dialog" :title="form._id ? '编辑物种' : '新建物种'" width="720px" :close-on-click-modal="false" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="Key" prop="key">
          <el-input v-model="form.key" :disabled="!!form._id" placeholder="全局唯一 key，如 cat_orange" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="视觉类型" prop="visualType">
          <el-radio-group v-model="form.visualType" :disabled="!!form._id">
            <el-radio value="video">视频（推荐 9:16）</el-radio>
            <el-radio value="image">图片</el-radio>
            <el-radio value="svg">SVG</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.visualType === 'image'" label="图片">
          <FilePicker v-model="imagePicker" scope="pet" mime-prefix="image/" title="选择物种图片" @select="onPickImage" />
          <div v-if="form.imageFile" class="preview">
            <el-image :src="form.imageFile.url" fit="cover" style="width:96px;height:96px;border-radius:6px" />
            <el-button link type="danger" @click="form.imageFile = null">清除</el-button>
          </div>
          <el-upload v-else :show-file-list="false" :auto-upload="true" :http-request="uploadImage" accept="image/*">
            <el-button :icon="Upload" size="small">上传新图</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item v-if="form.visualType === 'svg'" label="SVG 内容" prop="svgContent">
          <el-input v-model="form.svgContent" type="textarea" :rows="6" placeholder="<svg>...</svg>" />
          <div v-if="form.svgContent" class="preview svg-preview" v-html="form.svgContent" />
        </el-form-item>
        <!-- 2026-07-12: video visualType — 走 FilePicker (mime=video/*) + 上传新视频 -->
        <el-form-item v-if="form.visualType === 'video'" label="视频文件">
          <FilePicker v-model="videoPicker" scope="pet" mime-prefix="video/" title="选择物种视频" @select="onPickVideo" />
          <div v-if="form.videoFile" class="preview">
            <video :src="form.videoFile.url" controls preload="metadata" style="width:240px;max-height:160px;border-radius:6px" />
            <el-button link type="danger" @click="form.videoFile = null">清除</el-button>
          </div>
          <el-upload v-else :show-file-list="false" :auto-upload="true" :http-request="uploadVideo" accept="video/*">
            <el-button :icon="Upload" size="small">上传新视频</el-button>
          </el-upload>
          <span class="hint">建议 mp4/webm，单文件 ≤ 20MB</span>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="form.weight" :min="0" :max="10000" />
          <span class="hint">破壳时加权随机权重，0=不参与抽取</span>
        </el-form-item>
        <!-- 2026-06-23: 物种级饱腹度衰减间隔（分钟/点） -->
        <el-form-item label="饱腹度衰减">
          <el-input-number v-model="form.hungerDecayMinutes" :min="1" :max="10080" />
          <span class="hint">每 {{ form.hungerDecayMinutes }} 分钟扣 1 点饱腹度（破壳时宠物继承）</span>
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

    <!-- 形象大图预览（点击列表缩略图触发） -->
    <el-dialog
      v-model="previewOpen"
      :title="previewRow ? `${previewRow.name}（${previewRow.key}）` : '形象预览'"
      width="720px"
      :show-close="true"
      align-center
      @closed="onPreviewClosed"
    >
      <div v-if="previewRow" class="preview-large-wrap">
        <!-- 2026-07-12: per-visualType 分支, 各自优化 -->
        <!-- 图片: el-image 自带 fit:contain + max-height, 点击进全屏预览 -->
        <el-image
          v-if="previewRow.visualType === 'image' && previewRow.imageFile"
          :src="previewRow.imageFile.url"
          :alt="previewRow.name"
          :preview-src-list="[previewRow.imageFile.url]"
          fit="contain"
          style="width:100%;max-height:70vh"
          preview-teleported
        />
        <!-- SVG: v-html 内联渲染, 限制最大宽高避免超大 SVG 撑爆弹窗 -->
        <div
          v-else-if="previewRow.visualType === 'svg' && previewRow.svgContent"
          class="preview-large-svg"
          v-html="previewRow.svgContent"
        />
        <!-- 视频: 跟 Files.vue 文件管理预览对齐 — :key 强制重渲 + autoplay muted loop + 16:9 letterbox -->
        <template v-else-if="previewRow.visualType === 'video' && previewRow.videoFile">
          <video
            ref="previewVideoRef"
            :key="previewRow._id"
            :src="previewRow.videoFile.url"
            controls
            autoplay
            muted
            loop
            preload="auto"
            style="width:100%;aspect-ratio:16/9;max-height:70vh;object-fit:contain;background:#000"
          >
            您的浏览器不支持 video 标签。
          </video>
        </template>
        <div v-else class="preview-large-empty">
          <el-icon :size="64" color="#ccc"><Picture /></el-icon>
          <span>暂无形象</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Upload, Picture, VideoPlay } from '@element-plus/icons-vue'
import { petCatalogApi } from '@/api/petCatalog'
import { storageApi } from '@/api/storage'
import FilePicker from '@/components/FilePicker.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { handleRemoveError } from '@/utils/removable'
import { formatDate } from '@/utils/format'
import { PET_VISUAL_TYPE_LABELS } from '@/utils/constants'

const VISUAL_LABELS = PET_VISUAL_TYPE_LABELS

export default {
  name: 'PetSpeciesTab',
  components: { FilePicker, DestructiveConfirm },
  setup() {
    const filter = reactive({ isActive: true, keyword: '' })

    const items = ref([])
    const loading = ref(false)
    const dialog = ref(false)
    const saving = ref(false)
    const imagePicker = ref(false)
    const videoPicker = ref(false)  // 2026-07-12
    const formRef = ref(null)
    const previewOpen = ref(false)
    const previewRow = ref(null)
    const previewVideoRef = ref(null)  // 2026-07-12: 用于关闭弹窗时强制暂停 video

    function onPreviewClosed() {  // 2026-07-12: dialog 关闭后 pause 视频 + 复位进度, 否则浏览器后台继续播
      if (previewVideoRef.value) {
        previewVideoRef.value.pause()
        previewVideoRef.value.currentTime = 0
      }
    }
    const form = reactive({
      _id: null,
      key: '',
      name: '',
      visualType: 'video',
      imageFile: null,
      svgContent: '',
      videoFile: null,
      weight: 100,
      hungerDecayMinutes: 60,
      isActive: true,
      description: ''
    })
    const rules = {
      key: [{ required: true, message: 'key 必填', trigger: 'blur' }],
      name: [{ required: true, message: '名称 必填', trigger: 'blur' }],
      visualType: [{ required: true, message: '视觉类型 必填', trigger: 'change' }]
    }

    async function load() {
      loading.value = true
      try {
        const params = {
          isActive: filter.isActive,
          keyword: filter.keyword || undefined
        }
        const { data } = await petCatalogApi.listSpecies(params)
        items.value = data.items || []
      } catch (e) {
        items.value = []
        ElMessage.error('加载物种失败：' + (e?.message || 'unknown'))
      } finally {
        loading.value = false
      }
    }

    function resetForm() {
      Object.assign(form, {
        _id: null, key: '', name: '', visualType: 'video',
        imageFile: null, svgContent: '', videoFile: null,
        weight: 100, hungerDecayMinutes: 60, isActive: true, description: ''
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
        _id: row._id,
        key: row.key,
        name: row.name,
        visualType: row.visualType,
        imageFile: row.imageFile || null,
        svgContent: row.svgContent || '',
        videoFile: row.videoFile || null,
        weight: row.weight,
        hungerDecayMinutes: row.hungerDecayMinutes || 60,
        isActive: row.isActive,
        description: row.description || ''
      })
      dialog.value = true
    }

    function onPickImage(file) {
      form.imageFile = file
    }

    function onPickVideo(file) {  // 2026-07-12
      form.videoFile = file
    }

    async function uploadImage(req) {
      try {
        const { data } = await storageApi.upload({ file: req.file, scope: 'pet' })
        form.imageFile = data
      } catch (e) {
        ElMessage.error('图片上传失败：' + (e?.message || 'unknown'))
      }
    }

    async function uploadVideo(req) {  // 2026-07-12
      try {
        const { data } = await storageApi.upload({ file: req.file, scope: 'pet' })
        form.videoFile = data
      } catch (e) {
        ElMessage.error('视频上传失败：' + (e?.message || 'unknown'))
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
          visualType: form.visualType,
          imageFile: form.visualType === 'image' ? (form.imageFile?.id || null) : null,
          svgContent: form.visualType === 'svg' ? (form.svgContent || null) : null,
          videoFile: form.visualType === 'video' ? (form.videoFile?.id || null) : null,
          weight: Number(form.weight) || 0,
          hungerDecayMinutes: Number(form.hungerDecayMinutes) || 60,
          isActive: !!form.isActive,
          description: form.description || null
        }
        if (form._id) {
          await petCatalogApi.updateSpecies(form._id, payload)
          ElMessage.success('已更新')
        } else {
          await petCatalogApi.createSpecies(payload)
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
        await petCatalogApi.removeSpecies(row._id, { password })
        ElMessage.success('已删除')
        await load()
      } catch (e) {
        await handleRemoveError(e, '无法删除 · 中风险', `物种 ${row.name}`)
      }
    }

    function openPreview(row) {
      previewRow.value = row
      previewOpen.value = true
    }

    onMounted(load)

    return {
      filter, items, loading, dialog, saving, form, formRef, rules,
      imagePicker, videoPicker, previewOpen, previewRow, previewVideoRef,
      VISUAL_LABELS,
      Plus, Upload, Picture, VideoPlay,
      petCatalogApi,
      load, openCreate, openEdit, resetForm, onPickImage, onPickVideo, uploadImage, uploadVideo, submit, onRemoveConfirm,
      openPreview, onPreviewClosed, formatDate
    }
  }
}
</script>

<style scoped>
.filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.hint { margin-left: 12px; color: #999; font-size: 12px; }
.preview { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.svg-preview { max-width: 200px; max-height: 200px; border: 1px solid #eee; border-radius: 6px; padding: 8px; overflow: hidden; }
.thumb { display: flex; align-items: center; justify-content: center; }
.svg-thumb { width: 48px; height: 48px; }
.svg-thumb svg { width: 100%; height: 100%; display: block; }
/* 2026-07-12: video 缩略图 = 静态首帧 + ▶ 角标 */
.video-thumb { position: relative; width: 48px; height: 48px; border-radius: 6px; overflow: hidden; background: #f0f0f0; }
.video-thumb .video-frame { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }  /* 2026-07-12: 关键! 让 video 不捕获 click, 透传到父 div 触发 openPreview */
.video-thumb .video-play-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #fff; filter: drop-shadow(0 0 4px rgba(0,0,0,0.6)); pointer-events: none; }
.clickable { cursor: zoom-in; transition: transform 0.15s ease; }
.clickable:hover { transform: scale(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); border-radius: 6px; }
.preview-large-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; gap: 8px; }
.preview-large-svg { width: 100%; max-width: 600px; max-height: 70vh; display: flex; align-items: center; justify-content: center; background: #fafafa; border-radius: 6px; padding: 8px; }
.preview-large-svg svg { width: 100%; height: auto; max-height: 70vh; display: block; }
.preview-large-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #999; padding: 32px; }
.video-error-tip { display: none; }  /* 2026-07-12: 调试条清理后无引用, 隐藏 */
</style>