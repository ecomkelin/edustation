<!--
  OrgPromotionForm.vue (2026-08-07 从 OrgPromotion.vue 抽出)
  机构推广信息表单主体 —— 两个宿主共用：
    - 页面 OrgPromotion.vue (/org/promotion，机构自己维护)
    - 抽屉 OrgPromotionDrawer.vue (平台超管在 /orgs 列表 / 详情页就地维护)

  本组件**不渲染** 保存/重置 按钮：页面用行内 footer，抽屉用粘底 footer，
  由宿主通过 ref 调 submit() / reload()，loading 态读 exposed 的 saving。

  文件上传/选择:
    - 单值字段 (wechatQrcode / sharePoster) 走 FileSingleEditor
    - 数组字段 (environmentImages / certificates) 走 FileListEditor
    - 标签数组 (teachingFeatures / businessScope / honors) 走 TagEditor
-->
<template>
  <div v-loading="loading" class="promotion-form">
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="120px"
      v-if="!loading"
    >
      <!-- 折叠面板分组 -->
      <el-collapse v-model="activeGroups">
        <!-- A. 基础展示 -->
        <el-collapse-item title="基础展示" name="basic">
          <el-form-item label="机构简介" prop="description">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="4"
              maxlength="2000"
              show-word-limit
              placeholder="机构简介，200-500 字最佳"
            />
          </el-form-item>
          <el-form-item label="品牌故事">
            <el-input
              v-model="form.brandStory"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              placeholder="创办理念、使命愿景"
            />
          </el-form-item>
          <el-form-item label="教学特色">
            <TagEditor v-model="form.teachingFeatures" placeholder="按 Enter 添加，如：小班教学" :max="30" />
            <span class="form-tip">最多 30 项</span>
          </el-form-item>
          <el-form-item label="经营范围">
            <TagEditor v-model="form.businessScope" placeholder="按 Enter 添加，如：钢琴 / 声乐 / 乐理" :max="30" />
            <span class="form-tip">最多 30 项</span>
          </el-form-item>
          <el-form-item label="师资介绍">
            <el-input
              v-model="form.facultyIntro"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              placeholder="简版师资介绍"
            />
          </el-form-item>
          <el-form-item label="校区环境图">
            <FileListEditor
              v-model="form.environmentImages"
              :file-url-map="fileUrlById"
              :max="30"
              @add="onAddEnvImage"
            />
          </el-form-item>
          <el-form-item label="营业时间">
            <el-input
              v-model="form.businessHours"
              maxlength="200"
              placeholder="例：周一至周五 9:00-21:00 / 周末 9:00-18:00"
            />
          </el-form-item>
        </el-collapse-item>

        <!-- B. 联系方式 -->
        <el-collapse-item title="联系方式" name="contact">
          <el-form-item label="招生热线">
            <el-input v-model="form.hotline" maxlength="50" placeholder="对外宣传电话，与内部对接电话分开" />
          </el-form-item>
          <el-form-item label="客服微信">
            <el-input v-model="form.serviceWechat" maxlength="50" />
          </el-form-item>
          <el-form-item label="客服 QQ">
            <el-input v-model="form.serviceQq" maxlength="20" />
          </el-form-item>
          <el-form-item label="电子邮箱">
            <el-input v-model="form.email" maxlength="100" />
          </el-form-item>
          <el-form-item label="官方网站">
            <el-input v-model="form.website" maxlength="200" placeholder="https://" />
          </el-form-item>
          <el-form-item label="公众号名称">
            <el-input v-model="form.wechatPublic" maxlength="50" />
          </el-form-item>
          <el-form-item label="公众号二维码">
            <FileSingleEditor
              v-model="form.wechatQrcode"
              :file="filesById[form.wechatQrcode] || null"
              @pick="openQrcodePicker"
              @clear="form.wechatQrcode = null"
            />
          </el-form-item>
        </el-collapse-item>

        <!-- C. 自媒体 -->
        <el-collapse-item title="自媒体" name="social">
          <el-form-item label="抖音号">
            <el-input v-model="form.douyin" maxlength="50" />
          </el-form-item>
          <el-form-item label="小红书账号">
            <el-input v-model="form.xiaohongshu" maxlength="50" />
          </el-form-item>
          <el-form-item label="视频号">
            <el-input v-model="form.videoAccount" maxlength="50" />
          </el-form-item>
        </el-collapse-item>

        <!-- D. 地图位置 -->
        <el-collapse-item title="地图位置" name="map">
          <el-form-item label="经度">
            <el-input-number
              v-model="form.longitude"
              :min="-180"
              :max="180"
              :precision="6"
              :step="0.0001"
              controls-position="right"
              style="width: 220px"
            />
          </el-form-item>
          <el-form-item label="纬度">
            <el-input-number
              v-model="form.latitude"
              :min="-90"
              :max="90"
              :precision="6"
              :step="0.0001"
              controls-position="right"
              style="width: 220px"
            />
          </el-form-item>
          <el-form-item label="附近地标">
            <el-input v-model="form.nearbyLandmark" maxlength="100" placeholder="例：万达广场旁" />
          </el-form-item>
        </el-collapse-item>

        <!-- E. 资质荣誉 -->
        <el-collapse-item title="资质 / 荣誉" name="honor">
          <el-form-item label="注册资金">
            <el-input v-model="form.registeredCapital" maxlength="50" placeholder="例：100万" />
          </el-form-item>
          <el-form-item label="资质证书图">
            <FileListEditor
              v-model="form.certificates"
              :file-url-map="fileUrlById"
              :max="30"
              @add="onAddCert"
            />
          </el-form-item>
          <el-form-item label="荣誉">
            <TagEditor v-model="form.honors" placeholder="按 Enter 添加，如：2024 年度优秀教培机构" :max="50" />
            <span class="form-tip">最多 50 项</span>
          </el-form-item>
        </el-collapse-item>

        <!-- F. SEO -->
        <el-collapse-item title="SEO 优化" name="seo">
          <el-form-item label="SEO 标题">
            <el-input v-model="form.seoTitle" maxlength="100" />
          </el-form-item>
          <el-form-item label="SEO 关键词">
            <el-input v-model="form.seoKeywords" maxlength="200" placeholder="逗号分隔" />
          </el-form-item>
          <el-form-item label="SEO 描述">
            <el-input
              v-model="form.seoDescription"
              type="textarea"
              :rows="2"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
        </el-collapse-item>

        <!-- G. 第三方集成 -->
        <el-collapse-item title="第三方集成" name="third">
          <el-form-item label="百度统计 ID">
            <el-input v-model="form.baiduAnalyticsId" maxlength="50" />
          </el-form-item>
          <el-form-item label="微信小程序 AppID">
            <el-input v-model="form.wechatMiniAppId" maxlength="50" />
          </el-form-item>
        </el-collapse-item>

        <!-- 分享 -->
        <el-collapse-item title="分享" name="share">
          <el-form-item label="分享海报">
            <FileSingleEditor
              v-model="form.sharePoster"
              :file="filesById[form.sharePoster] || null"
              @pick="openPosterPicker"
              @clear="form.sharePoster = null"
            />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <!-- 从文件库选图 -->
    <FilePicker
      v-model="envImagePicker"
      scope="org"
      mime-prefix="image/"
      title="选择环境图"
      @select="onPickEnvImage"
    />
    <FilePicker
      v-model="certPicker"
      scope="org"
      mime-prefix="image/"
      title="选择资质证书"
      @select="onPickCert"
    />
    <FilePicker
      v-model="qrcodePicker"
      scope="org"
      mime-prefix="image/"
      title="选择公众号二维码"
      @select="onPickQrcode"
    />
    <FilePicker
      v-model="posterPicker"
      scope="org"
      mime-prefix="image/"
      title="选择分享海报"
      @select="onPickPoster"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { orgApi } from '@/api/org'
import { storageApi } from '@/api/storage'
import FilePicker from '@/components/FilePicker.vue'
import FileSingleEditor from '@/components/FileSingleEditor.vue'
import FileListEditor from '@/components/FileListEditor.vue'
import TagEditor from '@/components/TagEditor.vue'

const props = defineProps({
  // 目标机构 id。R-0930/R-0931 的 org 取自路径参数，与 x-org-id 无关，
  // 所以本组件可以编辑「非当前激活机构」的推广信息。
  // 但文件上传/文件库仍按 x-org-id 分租户 —— 抽屉宿主负责在打开期间切 org 上下文。
  orgId: { type: String, default: '' }
})
const emit = defineEmits(['saved'])

const loading = ref(false)
const saving = ref(false)
const activeGroups = ref(['basic', 'contact'])
const formRef = ref()

const form = reactive(emptyForm())

// 文件元数据: { [fileId]: fileObj }，供子组件展示缩略图
const filesById = ref({})
const fileUrlById = computed(() => {
  const m = {}
  for (const [k, v] of Object.entries(filesById.value || {})) {
    if (v && v.url) m[k] = v.url
  }
  return m
})

function emptyForm() {
  return {
    org: null,
    description: '',
    brandStory: '',
    teachingFeatures: [],
    facultyIntro: '',
    environmentImages: [],
    businessHours: '',
    businessScope: [],
    hotline: '',
    serviceWechat: '',
    serviceQq: '',
    email: '',
    website: '',
    wechatPublic: '',
    wechatQrcode: null,
    douyin: '',
    xiaohongshu: '',
    videoAccount: '',
    longitude: null,
    latitude: null,
    nearbyLandmark: '',
    registeredCapital: '',
    certificates: [],
    honors: [],
    seoTitle: '',
    seoKeywords: '',
    seoDescription: '',
    baiduAnalyticsId: '',
    wechatMiniAppId: '',
    sharePoster: null
  }
}

const rules = {
  description: [{ max: 2000, message: '≤ 2000 字' }]
}

async function reload() {
  if (!props.orgId) {
    Object.assign(form, emptyForm())
    filesById.value = {}
    ElMessage.warning('请先选择机构')
    return
  }
  loading.value = true
  try {
    const r = await orgApi.getPromotion(props.orgId)
    Object.assign(form, emptyForm(), r.data || {})
    await loadFileMeta()
  } finally {
    loading.value = false
  }
}

/**
 * 收集 form 中所有 fileId (单值+数组), 批量查 storageApi.detail 拿 url
 * - 走并发 Promise.all, 失败的项静默忽略 (文件可能已被删)
 */
async function loadFileMeta() {
  const ids = new Set()
  if (form.wechatQrcode) ids.add(form.wechatQrcode)
  if (form.sharePoster) ids.add(form.sharePoster)
  for (const fid of form.environmentImages || []) ids.add(fid)
  for (const fid of form.certificates || []) ids.add(fid)
  if (ids.size === 0) {
    filesById.value = {}
    return
  }
  const tasks = Array.from(ids).map((id) =>
    storageApi.detail(id)
      .then((r) => ({ id, file: r.data }))
      .catch(() => ({ id, file: null }))
  )
  const results = await Promise.all(tasks)
  const map = {}
  for (const r of results) {
    if (r.file) map[r.id] = r.file
  }
  filesById.value = map
}

/**
 * 保存。校验失败 / 请求失败都会 reject，宿主的 footer 按钮据此决定是否关闭抽屉。
 */
async function submit() {
  // 加载中 el-form 还没渲染 (v-if="!loading")，此时 reject 而不是静默 return ——
  // 否则宿主会以为"保存成功"把抽屉关掉。
  if (!formRef.value) throw new Error('表单尚未就绪')
  await formRef.value.validate()
  saving.value = true
  try {
    await orgApi.updatePromotion(props.orgId, form)
    ElMessage.success('已保存')
    emit('saved')
    await reload()
  } finally {
    saving.value = false
  }
}

// FilePicker 联动: 单值直接绑, 数组 push
const envImagePicker = ref(false)
const certPicker = ref(false)
const qrcodePicker = ref(false)
const posterPicker = ref(false)

function onAddEnvImage() { envImagePicker.value = true }
function onAddCert() { certPicker.value = true }
function openQrcodePicker() { qrcodePicker.value = true }
function openPosterPicker() { posterPicker.value = true }

function onPickEnvImage(file) {
  if (!form.environmentImages.includes(file._id)) {
    form.environmentImages.push(file._id)
    filesById.value = { ...filesById.value, [file._id]: file }
  }
}
function onPickCert(file) {
  if (!form.certificates.includes(file._id)) {
    form.certificates.push(file._id)
    filesById.value = { ...filesById.value, [file._id]: file }
  }
}
function onPickQrcode(file) {
  form.wechatQrcode = file._id
  filesById.value = { ...filesById.value, [file._id]: file }
}
function onPickPoster(file) {
  form.sharePoster = file._id
  filesById.value = { ...filesById.value, [file._id]: file }
}

// orgId 变了就重拉 (页面切机构 / 抽屉换目标机构都走这条)
watch(() => props.orgId, reload, { immediate: true })

defineExpose({ submit, reload, loading, saving })
</script>

<style scoped>
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.promotion-form {
  min-height: 120px;
}
</style>
