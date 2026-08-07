<!--
  OrgFormDialog.vue (2026-08-07 从 Orgs.vue 抽出)
  机构新建 / 编辑弹窗 —— 列表页 (Orgs.vue) 与详情页 (OrgDetail.vue) 共用

  - org=null → 新建；org=行数据 → 编辑（内部编码创建后不可改）
  - Logo 走 storage：上传 / 从文件库选，均维护「本次会话未采用的孤儿」暂存栈，
    弹窗关闭时统一清理（详见 stagedLogoIds 注释）
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="form.id ? '编辑机构' : '新建机构'"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @close="onDialogClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="机构 Logo">
        <div class="logo-uploader">
          <el-avatar :size="64" :src="form.logo || ''" shape="square">
            <el-icon :size="28"><Picture /></el-icon>
          </el-avatar>
          <div class="logo-uploader-actions">
            <el-upload
              :show-file-list="false"
              :auto-upload="true"
              :http-request="uploadLogo"
              :before-upload="beforeLogoUpload"
              accept="image/*"
            >
              <el-button size="small" :icon="Upload">上传新 Logo</el-button>
            </el-upload>
            <el-button v-if="form.logo" size="small" link type="danger" @click="clearLogo">
              清除
            </el-button>
            <el-button size="small" link @click="logoPicker = true">从文件库选</el-button>
          </div>
          <span class="form-tip">支持 jpg/png/webp/gif/svg，≤ 20MB。建议正方形</span>
        </div>
      </el-form-item>
      <el-form-item label="社会信用代码">
        <el-input v-model="form.socialCreditCode" maxlength="64" placeholder="18 位统一社会信用代码" />
      </el-form-item>
      <el-form-item label="法人代表">
        <el-input v-model="form.legalPerson" maxlength="50" />
      </el-form-item>
      <el-form-item label="办学许可证号">
        <el-input v-model="form.licenseNumber" maxlength="64" />
      </el-form-item>
      <el-form-item label="内部编码" prop="unicode">
        <el-input v-model="form.unicode" :disabled="!!form.id" maxlength="64" placeholder="内部统一编码" />
        <span v-if="form.id" class="form-tip">内部编码创建后不可修改</span>
      </el-form-item>
      <el-form-item label="机构全称" prop="name">
        <el-input v-model="form.name" maxlength="100" />
      </el-form-item>
      <el-form-item label="机构简称" prop="nameAbbreviation">
        <el-input v-model="form.nameAbbreviation" maxlength="50" />
      </el-form-item>
      <el-form-item label="类型" prop="type">
        <el-select v-model="form.type" placeholder="请选择" style="width: 100%" filterable>
          <el-option v-for="opt in ORG_TYPE_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
        </el-select>
      </el-form-item>
      <el-form-item label="地区" prop="region">
        <el-cascader
          v-model="formRegion"
          :options="regionTree"
          :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false }"
          placeholder="请选择"
          style="width: 100%"
          @change="(v) => (form.region = v || null)"
        />
      </el-form-item>
      <el-form-item label="负责人">
        <el-select
          v-model="form.principal"
          placeholder="请选择本机构下的用户"
          style="width: 100%"
          filterable
          clearable
          :loading="principalsLoading"
          :disabled="!form.id"
        >
          <el-option
            v-for="u in principalOptions"
            :key="u.id"
            :value="u.id"
            :label="`${u.realName || u.mobile}${u.isMain ? '（主）' : ''}`"
          />
        </el-select>
        <span v-if="!form.id" class="form-tip">先保存机构后再指定负责人</span>
      </el-form-item>
      <el-form-item label="联系人">
        <el-input v-model="form.contactPerson" maxlength="50" placeholder="对外展示的联系人姓名" />
      </el-form-item>
      <el-form-item label="联系方式">
        <el-input v-model="form.contactPhone" maxlength="50" placeholder="对外展示的电话 / 邮箱" />
      </el-form-item>
      <el-form-item label="地址">
        <el-input v-model="form.address" maxlength="200" />
      </el-form-item>
      <el-form-item label="开设时间">
        <el-date-picker
          v-model="form.establishedDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="请选择"
          style="width: 100%"
        />
        <span class="form-tip">2026-06 起，开设时间可由平台超管修改</span>
      </el-form-item>

      <!-- C 端展示配置 (2026-06 上线) -->
      <el-divider content-position="left">C 端对外展示</el-divider>

      <el-form-item label="名师团队展示">
        <el-switch
          v-model="form.showTeacherTeam"
          active-text="对外展示"
          inactive-text="隐藏"
          inline-prompt
        />
        <span class="form-tip">
          开启后，机构主页会展示勾选"名师"的员工；
          关闭则整块不显示。具体哪些员工作为名师，在成员管理中勾选。
        </span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
    </template>

    <!-- 从文件库选 logo -->
    <FilePicker
      v-model="logoPicker"
      scope="org"
      mime-prefix="image/"
      title="选择机构 Logo"
      @select="onPickLogo"
    />
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, Upload } from '@element-plus/icons-vue'
import { orgApi } from '@/api/org'
import { regionApi } from '@/api/region'
import { storageApi } from '@/api/storage'
import { ORG_TYPES, ORG_TYPE_LABELS } from '@shared/enums.mjs'
import FilePicker from '@/components/FilePicker.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 编辑目标；null / undefined = 新建
  org: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

// 2026-06: Org.type 是 String enum (10 种), 硬编码选项, 无需拉后端字典
const ORG_TYPE_OPTIONS = ORG_TYPES.map((v) => ({ value: v, label: ORG_TYPE_LABELS[v] || v }))

const saving = ref(false)
const formRef = ref()
const form = reactive(emptyForm())
const formRegion = ref(null)
const regionTree = ref([])
const principalOptions = ref([])
const principalsLoading = ref(false)

// 本次编辑会话内"已上传但 form 最终没采用"的 Logo 文件 id 列表。
// 弹窗关闭时清理这些"未绑定的孤儿"，避免磁盘残留 + Files.vue 列表里冒出 refCount=0 的项。
// 注意：保存成功的那张走 org.service 的 diffSingle 处理，**不**进此栈。
const stagedLogoIds = ref([])

function emptyForm() {
  return {
    id: '',
    unicode: '',
    socialCreditCode: '',
    legalPerson: '',
    licenseNumber: '',
    name: '',
    nameAbbreviation: '',
    type: '',
    region: null,
    principal: null,
    contactPerson: '',
    contactPhone: '',
    address: '',
    establishedDate: '',
    logo: '',
    // 2026-06 C 端对外展示: 总开关 (细分到员工的"名师"勾选见成员管理)
    showTeacherTeam: false
  }
}

const rules = {
  unicode: [{ required: true, message: '请输入内部编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入机构全称', trigger: 'blur' }],
  nameAbbreviation: [{ required: true, message: '请输入机构简称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  region: [{ required: true, message: '请选择地区', trigger: 'change' }]
}

watch(formRegion, (v) => {
  form.region = v || null
})

// 打开时按 props.org 灌表单；关闭时清孤儿。
// 注意：必须先 Object.assign(form, emptyForm()) 复位，否则上一次编辑的残留值
// （尤其 showTeacherTeam 这种没在下面显式赋值的字段）会被当成本次的值提交。
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    cleanupStagedLogos()
    formLogoFileId.value = null
    // 懒加载地区树：本弹窗挂在 /orgs 和 /orgs/:id 两个页面上，
    // 放 onMounted 会让「从没打开过弹窗」的访问也白跑一次 /regions/tree
    //（且 Orgs.vue 自己的筛选级联已经拉过一次）
    if (!regionTree.value.length) loadRegionTree()
    Object.assign(form, emptyForm())
    const row = props.org
    if (row) {
      const id = row.id || row._id
      Object.assign(form, {
        id,
        unicode: row.unicode || '',
        socialCreditCode: row.socialCreditCode || '',
        legalPerson: row.legalPerson || '',
        licenseNumber: row.licenseNumber || '',
        name: row.name || '',
        nameAbbreviation: row.nameAbbreviation || '',
        // 2026-06: type 是 String enum, 直接取 row.type
        type: row.type || '',
        region: row.region ? row.region.id || row.region._id : null,
        principal: row.principal ? row.principal.id || row.principal._id : null,
        contactPerson: row.contactPerson || '',
        contactPhone: row.contactPhone || '',
        address: row.address || '',
        establishedDate: row.establishedDate ? String(row.establishedDate).slice(0, 10) : '',
        logo: row.logo || '',
        showTeacherTeam: !!row.showTeacherTeam
      })
      loadPrincipals(id)
    } else {
      principalOptions.value = []
    }
    formRegion.value = form.region
    formRef.value?.clearValidate()
  }
)

async function loadRegionTree() {
  const r = await regionApi.tree()
  regionTree.value = (r.data || []).map((n) => ({
    ...n,
    id: n.id || n._id,
    children: n.children || []
  }))
}

async function loadPrincipals(orgId) {
  if (!orgId) {
    principalOptions.value = []
    return
  }
  principalsLoading.value = true
  try {
    const r = await orgApi.candidatePrincipals(orgId)
    principalOptions.value = (r.data || []).map((u) => ({ ...u, id: u.id || u._id }))
  } finally {
    principalsLoading.value = false
  }
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  saving.value = true
  try {
    const payload = {
      unicode: form.unicode,
      socialCreditCode: form.socialCreditCode,
      legalPerson: form.legalPerson,
      licenseNumber: form.licenseNumber,
      name: form.name,
      nameAbbreviation: form.nameAbbreviation,
      type: form.type || null,
      region: form.region || null,
      principal: form.principal || null,
      contactPerson: form.contactPerson,
      contactPhone: form.contactPhone,
      address: form.address,
      logo: form.logo || '',
      // 2026-06 C 端总开关
      showTeacherTeam: !!form.showTeacherTeam
    }
    if (form.establishedDate) {
      payload.establishedDate = new Date(form.establishedDate).toISOString()
    }
    if (form.id) {
      await orgApi.update(form.id, payload)
      ElMessage.success('已更新')
    } else {
      await orgApi.create(payload)
      ElMessage.success('已创建')
    }
    // 提交成功：保存的那张 logo 走 org.service 的 diffSingle 绑定，**不**进暂存栈。
    // dialog 关闭时清理掉栈中其余被替换/被丢弃的孤儿。
    emit('update:modelValue', false)
    formLogoFileId.value = null
    emit('saved')
  } finally {
    saving.value = false
  }
}

function onDialogClose() {
  // 关闭时清掉所有"未保存"logo 的孤儿文件。
  //  - 取消 / 点 X：栈里有几张清几张
  //  - 保存成功：栈里只有"被替换掉的"上一张（不是最终那一张），也会被清
  cleanupStagedLogos()
  formLogoFileId.value = null
}

// ===== Logo 上传 =====
// 当前 form.logo 对应的 fileId。null 表示 form.logo 来自"历史数据"（数据库里原有的 logo，
// 不是本会话内上传），不要把它加进暂存栈。
// 注意：打开弹窗后用户首次上传前 form.logo 可能已经有值（编辑场景 row.logo），
// 此时旧 logo 的 fileId 是 null —— 弹窗关闭清理时不会去动它，留给后端 diffSingle 处理。
const formLogoFileId = ref(null)

function beforeLogoUpload(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('Logo 文件超过 20MB 限制')
    return false
  }
  if (!file.type.startsWith('image/')) {
    ElMessage.error('仅支持图片格式')
    return false
  }
  return true
}

async function uploadLogo(req) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'org' })
    // 把"被替换掉的上一张"压栈，等弹窗关闭时清理（孤儿）
    if (formLogoFileId.value) {
      stagedLogoIds.value.push(formLogoFileId.value)
    }
    form.logo = data.url
    formLogoFileId.value = data.id
    ElMessage.success('Logo 已上传，点击"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function clearLogo() {
  if (formLogoFileId.value) {
    stagedLogoIds.value.push(formLogoFileId.value)
  }
  form.logo = ''
  formLogoFileId.value = null
}

async function cleanupStagedLogos() {
  const ids = stagedLogoIds.value
  if (!ids.length) return
  stagedLogoIds.value = []
  for (const id of ids) {
    try {
      await storageApi.remove(id)
    } catch (_) {
      // 清理失败不阻塞主流程（可能已被业务引用；可后续在文件管理页手动处理）
    }
  }
}

// 从文件库选 logo —— 与 uploadLogo 同样的"暂存栈"语义。
// 选出来的 file 来自其他会话，可能已绑定别的 entity —— 但后端 diffSingle 走
// "老 url 绑过的 entity 全部 unbind + 新 url 绑当前 entity"，跨引用无副作用。
const logoPicker = ref(false)
function onPickLogo(file) {
  if (formLogoFileId.value) {
    stagedLogoIds.value.push(formLogoFileId.value)
  }
  form.logo = file.url
  formLogoFileId.value = file._id
  ElMessage.success('已选择 Logo，点"确定"生效')
}

// 弹窗开着时直接路由跳走 → @close 不会触发，孤儿会残留在磁盘上，这里兜底
onBeforeUnmount(() => {
  cleanupStagedLogos()
})
</script>

<style scoped>
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.logo-uploader {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.logo-uploader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
