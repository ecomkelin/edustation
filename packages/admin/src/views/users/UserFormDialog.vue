<!--
  UserFormDialog.vue (2026-08-07 新增)

  用户表单弹窗 —— 从 Users.vue 抽出, 供三处共用:
    · Users.vue          列表页「添加用户」(mode=create) 与「编辑」(mode=edit)
    · UserDetail.vue     详情页「编辑资料」(mode=edit)
    · UnaffiliatedUsers  游离用户「编辑」(mode=edit + variant=orphan)

  两条分支:
    mode=create —— 输手机号 → 查找 → 四态 (not_found / found_other_org /
                   found_same_org / found_platform_admin)。只有列表页用。
    mode=edit   —— 基础字段 + 职位。三处都用。

  variant:
    org    —— 机构态: PUT /users/:id (R-0203) + PUT /users/:id/positions (R-0212)
    orphan —— 游离态: PUT /users/unaffiliated/:id (R-0208), 无职位概念, 仅超管

  职位 / 地区字典由本组件自行加载, 调用方不用喂 —— 详情页没有这两份数据。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @open="onOpen"
    @close="onClose"
  >
    <!-- 游离用户编辑的两条风险提示 (原 UnaffiliatedUsers.vue 的文案) -->
    <el-alert
      v-if="mode === 'edit' && variant === 'orphan' && isSelf"
      type="warning"
      :closable="false"
      show-icon
      title="你正在编辑自己的账号"
      description="不要禁用自己 (isActive), 否则会立即失去登录能力"
      style="margin-bottom: 12px"
    />
    <el-alert
      v-if="mode === 'edit' && variant === 'orphan' && form.isPlatformAdmin && !isSelf"
      type="warning"
      :closable="false"
      show-icon
      title="该用户是平台超管"
      description="修改其信息不影响其超管身份 (该字段本表单不允许改), 但请谨慎评估影响范围"
      style="margin-bottom: 12px"
    />

    <!-- 2026-07-22: 说明「创建/加入机构」不能添加平台超管, 避免用户疑惑 -->
    <el-alert
      v-if="mode === 'create'"
      type="info"
      :closable="false"
      show-icon
      title="仅机构员工"
      description="本入口只能添加本机构员工 / 家长。平台超管不能加入任何机构, 由上级超管在「系统管理 → 游离用户」中专门设置。"
      style="margin-bottom: 12px"
    />

    <!-- ─── 编辑分支 ─── -->
    <template v-if="mode === 'edit'">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="姓名" prop="realName"><el-input v-model="form.realName" maxlength="50" /></el-form-item>
        <el-form-item label="手机号">
          <el-input :model-value="form.mobile" disabled />
        </el-form-item>
        <el-form-item label="身份证号" prop="idCard">
          <el-input v-model="form.idCard" placeholder="选填，15 或 18 位" maxlength="18" />
        </el-form-item>
        <el-form-item label="现居地">
          <el-cascader
            v-model="formRegion"
            :options="regionTree"
            :props="cascaderProps"
            placeholder="请选择"
            style="width: 100%"
            clearable
          />
        </el-form-item>
        <el-form-item v-if="variant === 'org'" label="职位">
          <el-select v-model="form.positions" multiple style="width: 100%">
            <el-option
              v-for="p in positions"
              :key="p._id"
              :label="Number(p.clientLevel) > 0 ? `${p.name}（L${p.clientLevel} 家长）` : p.name"
              :value="p._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" :disabled="variant === 'orphan' && isSelf" />
        </el-form-item>
      </el-form>
    </template>

    <!-- ─── 新增分支: 输手机号 → 查找 → 四态 ─── -->
    <template v-else>
      <el-form label-width="90px">
        <el-form-item label="手机号">
          <el-input
            v-model="form.mobile"
            placeholder="输入 11 位手机号后点「查找」"
            maxlength="11"
            @keyup.enter="doLookup"
          >
            <template #append>
              <el-button :loading="lookupLoading" @click="doLookup">查找</el-button>
            </template>
          </el-input>
        </el-form-item>

        <template v-if="lookupState !== 'idle'">
          <!-- A. 用户不存在 → 新建 -->
          <template v-if="lookupState === 'not_found'">
            <el-alert
              type="info"
              show-icon
              :closable="false"
              title="该手机号未注册过"
              description="请补全姓名、密码等基础信息完成新建"
              style="margin-bottom: 16px"
            />
            <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
              <el-form-item label="姓名" prop="realName"><el-input v-model="form.realName" /></el-form-item>
              <el-form-item label="密码">
                <el-input v-model="form.password" placeholder="留空使用默认密码" show-password />
              </el-form-item>
              <el-form-item label="身份证号" prop="idCard">
                <el-input v-model="form.idCard" placeholder="选填，15 或 18 位" maxlength="18" />
              </el-form-item>
              <el-form-item label="现居地">
                <el-cascader
                  v-model="formRegion"
                  :options="regionTree"
                  :props="cascaderProps"
                  placeholder="请选择"
                  style="width: 100%"
                  clearable
                />
              </el-form-item>
              <el-form-item label="职位">
                <el-select v-model="form.positions" multiple style="width: 100%">
                  <el-option
                    v-for="p in positions"
                    :key="p._id"
                    :label="Number(p.clientLevel) > 0 ? `${p.name}（L${p.clientLevel} 家长）` : p.name"
                    :value="p._id"
                  />
                </el-select>
              </el-form-item>
            </el-form>
          </template>

          <!-- B. 用户已存在, 不在本机构 → 分配职位 -->
          <template v-else-if="lookupState === 'found_other_org'">
            <el-alert
              type="success"
              show-icon
              :closable="false"
              :title="`已找到账号：${form.realName || form.mobile}`"
              description="该用户已在其他机构，请为他在本机构分配职位"
              style="margin-bottom: 12px"
            />
            <el-descriptions :column="2" border size="small" style="margin-bottom: 12px">
              <el-descriptions-item label="姓名">{{ form.realName || '—' }}</el-descriptions-item>
              <el-descriptions-item label="手机号">{{ form.mobile }}</el-descriptions-item>
              <el-descriptions-item label="身份证">{{ maskIdCard(form.idCard) }}</el-descriptions-item>
              <el-descriptions-item label="地区">{{ form.regionName || '—' }}</el-descriptions-item>
              <el-descriptions-item label="启用">
                <el-tag :type="form.isActive ? 'success' : 'info'" size="small">
                  {{ form.isActive ? '是' : '否' }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
            <el-form-item label="分配职位">
              <el-select v-model="form.positions" multiple style="width: 100%">
                <el-option
                  v-for="p in positions"
                  :key="p._id"
                  :label="Number(p.clientLevel) > 0 ? `${p.name}（L${p.clientLevel} 家长）` : p.name"
                  :value="p._id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="主属机构">
              <el-switch v-model="form.isMain" />
            </el-form-item>
          </template>

          <!-- C. 用户已在当前机构 → 阻止 -->
          <template v-else-if="lookupState === 'found_same_org'">
            <el-alert
              type="warning"
              show-icon
              :closable="false"
              :title="`该用户 (${form.realName || form.mobile}) 已在当前机构`"
              description="如需调整职位，请关闭弹窗到列表中点击「编辑」修改。"
            />
          </template>

          <!-- D. 用户是平台超管 → 不能加入任何机构 (2026-07-22 加) -->
          <template v-else-if="lookupState === 'found_platform_admin'">
            <el-alert
              type="error"
              show-icon
              :closable="false"
              :title="`该账号 (${form.realName || form.mobile}) 是平台超管`"
              description="平台超管天然跨机构, 无需也不能加入任何机构。如需调整其超管身份, 请联系上级超管在「系统管理 → 游离用户」中处理。"
            />
          </template>
        </template>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="submitDisabled" @click="submit">
        {{ submitText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { userApi } from '@/api/user'
import { positionApi } from '@/api/position'
import { regionApi } from '@/api/region'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'edit' }, // 'create' | 'edit'
  variant: { type: String, default: 'org' }, // 'org' | 'orphan'
  // mode=edit 时的数据源。接受列表行或详情页 profile, 字段名兼容两者
  user: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const auth = useAuthStore()

const cascaderProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  checkStrictly: true,
  emitPath: false
}

const formRef = ref()
const saving = ref(false)
const positions = ref([])
const regionTree = ref([])

const lookupState = ref('idle')
const lookupLoading = ref(false)

const form = reactive({
  id: '',
  realName: '',
  mobile: '',
  password: '',
  idCard: '',
  region: null,
  regionName: '',
  positions: [],
  isActive: true,
  isMain: false,
  isPlatformAdmin: false,
  existingUserId: null
})
const formRegion = ref(null)
const originalPositions = ref([])
watch(formRegion, (v) => {
  form.region = v || null
})

const isSelf = computed(() => form.id && form.id === auth.user?.id)

const rules = {
  realName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  idCard: [
    {
      validator: (rule, value, cb) => {
        if (!value) return cb()
        if (!/^\d{15}(\d{2}[\dXx])?$/.test(value)) return cb(new Error('身份证号格式不正确'))
        cb()
      },
      trigger: 'blur'
    }
  ]
}

const dialogTitle = computed(() => {
  if (props.mode === 'create') return '添加用户'
  return props.variant === 'orphan' ? '编辑游离用户' : '编辑用户'
})

const submitText = computed(() => {
  if (props.mode === 'edit') return '保存'
  if (lookupState.value === 'found_other_org') return '加入机构'
  return '新建'
})

const submitDisabled = computed(() => {
  if (props.mode === 'edit') return false
  return (
    lookupState.value === 'idle' ||
    lookupState.value === 'found_same_org' ||
    lookupState.value === 'found_platform_admin'
  )
})

function maskIdCard(v) {
  if (!v) return '—'
  if (v.length <= 8) return v
  return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
}

async function loadDicts() {
  // 地区字典是跨机构公共表, 任何登录用户可读
  const rt = await regionApi.tree()
  regionTree.value = (rt.data || []).map((n) => ({
    ...n,
    id: n.id || n._id,
    children: n.children || []
  }))
  // 游离用户没有机构概念, 不需要职位; 且当前 org 的职位对他也没意义
  if (props.variant === 'orphan') {
    positions.value = []
    return
  }
  if (!auth.currentOrgId) {
    positions.value = []
    return
  }
  const rp = await positionApi.list({ pageSize: 200 })
  positions.value = rp.data.items
}

function fillFromUser(u) {
  // region 在列表行里是 id 字符串, 在详情 profile 里是 { id, name } 对象 —— 两种都吃
  const regionId = u.region && typeof u.region === 'object' ? u.region.id : u.region || null
  Object.assign(form, {
    id: u.id,
    realName: u.realName || '',
    mobile: u.mobile || '',
    password: '',
    idCard: u.idCard || '',
    region: regionId,
    regionName: (u.region && typeof u.region === 'object' && u.region.name) || '',
    positions: (u.positions || []).map((p) => (typeof p === 'string' ? p : p.id || p._id)),
    isActive: u.isActive !== false,
    isMain: !!u.isMain,
    isPlatformAdmin: !!u.isPlatformAdmin,
    existingUserId: null
  })
  formRegion.value = regionId
  // 打开时的职位快照, submitEdit 用它判断"职位到底动没动"
  originalPositions.value = [...form.positions]
}

/** 职位选择相对打开弹窗时是否有变化 (顺序无关) */
function positionsChanged() {
  const a = [...(form.positions || [])].map(String).sort()
  const b = [...(originalPositions.value || [])].map(String).sort()
  return a.length !== b.length || a.some((v, i) => v !== b[i])
}

function resetForm() {
  Object.assign(form, {
    id: '',
    realName: '',
    mobile: '',
    password: '',
    idCard: '',
    region: null,
    regionName: '',
    positions: [],
    isActive: true,
    isMain: false,
    isPlatformAdmin: false,
    existingUserId: null
  })
  formRegion.value = null
  originalPositions.value = []
  lookupState.value = 'idle'
}

async function onOpen() {
  resetForm()
  if (props.mode === 'edit' && props.user) fillFromUser(props.user)
  await loadDicts()
}

function onClose() {
  formRef.value?.clearValidate()
}

/**
 * 查找手机号 (仅 mode=create):
 *   - 不存在 → not_found, 显示新建表单
 *   - 平台超管 → found_platform_admin (超管天然不能加入机构, 前端预判省一次往返;
 *                后端 attachToOrg 仍会兜底 400)
 *   - 已在本机构 → found_same_org
 *   - 存在但不在本机构 → found_other_org
 */
async function doLookup() {
  const m = (form.mobile || '').trim()
  if (!/^1[3-9]\d{9}$/.test(m)) return ElMessage.warning('请输入合法的 11 位手机号')
  lookupLoading.value = true
  try {
    const r = await userApi.lookup({ mobile: m })
    const u = r.data
    const base = {
      realName: u.realName || '',
      idCard: u.idCard || '',
      regionName: u.region?.name || '',
      isActive: !!u.isActive,
      existingUserId: u.id,
      positions: []
    }
    if (u && u.isPlatformAdmin) {
      Object.assign(form, base, { isPlatformAdmin: true })
      lookupState.value = 'found_platform_admin'
    } else if (u && u.currentOrgRel) {
      Object.assign(form, base)
      lookupState.value = 'found_same_org'
    } else {
      Object.assign(form, base, { isMain: false })
      lookupState.value = 'found_other_org'
    }
  } catch (_) {
    // lookup 走 silent:true, 404 是预期分支 (走新建), 不弹 toast
    lookupState.value = 'not_found'
    Object.assign(form, {
      realName: '',
      password: '',
      idCard: '',
      region: null,
      regionName: '',
      positions: []
    })
    formRegion.value = null
  } finally {
    lookupLoading.value = false
  }
}

async function submit() {
  if (props.mode === 'edit') return submitEdit()
  return submitCreate()
}

async function submitEdit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const payload = {
      realName: form.realName,
      idCard: form.idCard || null,
      region: form.region || null,
      isActive: form.isActive
    }
    if (props.variant === 'orphan') {
      // R-0208: 游离用户没有 UserOrgRel, 走超管专属端点, 也没有职位可调
      await userApi.updateUnaffiliated(form.id, payload)
    } else {
      await userApi.update(form.id, payload)
      // 只在职位真的变了才打 R-0212。
      //   不是为了省一次请求 —— setPositions 里有敏感权限闸门 (pet.write 等只有超管能授),
      //   而它是按"提交的整组 positions"判定, 不是按 diff 判定。如果无条件重发原样的职位,
      //   机构管理员想改个姓名都会被 403 挡住 (只因该员工本来就挂着含 pet.write 的职位)。
      //   职位没动 = 没有提权, 不该触发闸门。
      if (positionsChanged()) {
        await userApi.setPositions(form.id, form.positions)
      }
    }
    ElMessage.success('已保存')
    emit('update:modelValue', false)
    emit('saved')
  } finally {
    saving.value = false
  }
}

async function submitCreate() {
  if (lookupState.value === 'idle') return ElMessage.warning('请先输入手机号并点击「查找」')
  if (lookupState.value === 'found_same_org') {
    return ElMessage.warning('该用户已在当前机构，请关闭弹窗到列表中编辑')
  }
  // UI 已禁用提交, 这里再保底拦一次
  if (lookupState.value === 'found_platform_admin') {
    return ElMessage.warning('该账号是平台超管, 无需也不能加入任何机构')
  }

  saving.value = true
  try {
    if (lookupState.value === 'not_found') {
      try {
        await formRef.value.validate()
      } catch {
        saving.value = false
        return
      }
      await userApi.create({
        mobile: form.mobile,
        password: form.password || undefined,
        realName: form.realName,
        idCard: form.idCard || undefined,
        region: form.region || undefined,
        positions: form.positions
      })
      ElMessage.success('已创建')
    } else if (lookupState.value === 'found_other_org') {
      await userApi.attachToOrg(form.existingUserId, {
        positions: form.positions,
        isMain: form.isMain
      })
      ElMessage.success('已加入机构')
    }
    emit('update:modelValue', false)
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>
