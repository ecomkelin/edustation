<template>
  <div class="page profile-page">
    <h2>个人中心</h2>

    <el-row :gutter="16">
      <!-- 左侧：账号概览 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="card">
          <div class="overview">
            <el-avatar :size="84" :src="form.avatar || ''">
              {{ initial }}
            </el-avatar>
            <div class="overview-meta">
              <div class="name">{{ form.realName || '（未填写姓名）' }}</div>
              <div class="mobile">{{ form.mobile }}</div>
              <div class="tags">
                <el-tag v-if="auth.user?.isPlatformAdmin" type="danger" size="small">平台超管</el-tag>
                <el-tag :type="form.isActive ? 'success' : 'info'" size="small">
                  {{ form.isActive ? '启用' : '停用' }}
                </el-tag>
              </div>
            </div>
          </div>

          <el-divider />

          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="所属机构">
              <div v-if="(auth.orgs || []).length">
                <div
                  v-for="o in auth.orgs"
                  :key="o.id"
                  style="margin-bottom: 4px"
                >
                  <el-tag size="small" style="margin-right: 4px">{{ o.name }}</el-tag>
                  <el-tag v-if="o.isMain" type="success" size="small" style="margin-right: 4px">主</el-tag>
                  <span style="color: #999; font-size: 12px">
                    {{ (o.positions || []).map((p) => p.name).join('、') || '（无职位）' }}
                  </span>
                </div>
              </div>
              <span v-else style="color: #999">—</span>
            </el-descriptions-item>
            <el-descriptions-item label="注册时间">
              {{ formatDate(form.createdAt) }}
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <el-button type="warning" plain style="width: 100%" @click="openPwd">修改登录密码</el-button>
        </el-card>
      </el-col>

      <!-- 右侧：资料编辑 -->
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="card">
          <template #header>
            <div class="card-title">
              <span>基本资料</span>
              <span class="card-title-hint">手机号、超管、启用状态由管理员维护，这里不可改</span>
            </div>
          </template>

          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-width="100px"
            @submit.prevent
          >
            <el-form-item label="姓名" prop="realName">
              <el-input v-model="form.realName" placeholder="请输入真实姓名" maxlength="50" />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input :model-value="form.mobile" disabled />
              <div class="form-hint">如需更换登录手机号，请联系机构管理员。</div>
            </el-form-item>
            <el-form-item label="头像 URL" prop="avatar">
              <el-input v-model="form.avatar" placeholder="https://..." maxlength="500" clearable />
            </el-form-item>
            <el-form-item label="身份证号" prop="idCard">
              <el-input v-model="form.idCard" placeholder="选填，15 或 18 位" maxlength="18" clearable />
            </el-form-item>
            <el-form-item label="现居地">
              <el-cascader
                v-model="formRegion"
                :options="regionTree"
                :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false }"
                placeholder="请选择"
                style="width: 100%"
                clearable
              />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="saving" @click="submit">保存资料</el-button>
              <el-button @click="reload">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- 修改密码对话框 -->
    <el-dialog
      v-model="pwdDialog"
      title="修改登录密码"
      width="420px"
      :close-on-click-modal="false"
      @close="resetPwd"
    >
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="改密成功后，其它已登录的设备需重新登录"
        style="margin-bottom: 12px"
      />
      <el-form
        ref="pwdFormRef"
        :model="pwd"
        :rules="pwdRules"
        label-width="90px"
        @submit.prevent
      >
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="pwd.oldPassword" type="password" show-password placeholder="当前登录密码" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwd.newPassword" type="password" show-password placeholder="6-64 位" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="pwd.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialog = false">取消</el-button>
        <el-button type="primary" :loading="pwdSaving" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { authApi } from '@/api/auth'
import { regionApi } from '@/api/region'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// ===== 表单 =====
const formRef = ref()
const form = reactive({
  realName: '',
  mobile: '',
  avatar: '',
  idCard: '',
  region: null, // 仅 id
  isActive: true,
  createdAt: ''
})
const formRegion = ref(null) // cascader 双向绑定
const regionTree = ref([])
const saving = ref(false)

const rules = {
  realName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  avatar: [
    { max: 500, message: '头像 URL 最长 500', trigger: 'blur' }
  ],
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

const initial = computed(() => {
  const name = form.realName || form.mobile || ''
  return name ? name.slice(-1) : '?'
})

function formatDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

async function reload() {
  const r = await authApi.me()
  const d = r.data || {}
  form.realName = d.realName || ''
  form.mobile = d.mobile || ''
  form.avatar = d.avatar || ''
  form.idCard = d.idCard || ''
  form.region = d.region ? d.region.id : null
  form.isActive = !!d.isActive
  form.createdAt = d.createdAt || ''
  formRegion.value = form.region
}

watch(formRegion, (v) => {
  form.region = v || null
})

async function loadRegionTree() {
  const r = await regionApi.tree()
  regionTree.value = (r.data || []).map((n) => ({
    ...n,
    id: n.id || n._id,
    children: n.children || []
  }))
}

async function submit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const r = await authApi.updateMe({
      realName: form.realName,
      avatar: form.avatar || '',
      idCard: form.idCard || '',
      region: form.region || ''
    })
    ElMessage.success('已保存')
    // 同步 store —— 顶部头像/姓名跟着刷新
    await auth.fetchMe()
    // 用最新出参覆盖本地表单（避免 store fetchMe 的字段裁剪导致表单丢失）
    const d = r.data || {}
    form.realName = d.realName || ''
    form.avatar = d.avatar || ''
    form.idCard = d.idCard || ''
    form.region = d.region ? d.region.id : null
    formRegion.value = form.region
  } finally {
    saving.value = false
  }
}

// ===== 修改密码 =====
const pwdDialog = ref(false)
const pwdSaving = ref(false)
const pwdFormRef = ref()
const pwd = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const pwdRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 64, message: '新密码长度 6-64 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, cb) => {
        if (value !== pwd.newPassword) return cb(new Error('两次输入的新密码不一致'))
        cb()
      },
      trigger: 'blur'
    }
  ]
}

function openPwd() {
  resetPwd()
  pwdDialog.value = true
}

function resetPwd() {
  pwd.oldPassword = ''
  pwd.newPassword = ''
  pwd.confirmPassword = ''
  pwdFormRef.value && pwdFormRef.value.clearValidate()
}

async function submitPwd() {
  try {
    await pwdFormRef.value.validate()
  } catch {
    return
  }
  if (pwd.oldPassword === pwd.newPassword) {
    return ElMessage.warning('新密码不能与原密码相同')
  }
  pwdSaving.value = true
  try {
    await authApi.changePassword({
      oldPassword: pwd.oldPassword,
      newPassword: pwd.newPassword
    })
    ElMessage.success('密码已修改，其它设备需重新登录')
    pwdDialog.value = false
  } finally {
    pwdSaving.value = false
  }
}

onMounted(() => {
  reload()
  loadRegionTree()
  // 从右上角"修改密码"入口跳来时,自动打开改密弹层,并清掉 query 防止刷新重弹
  if (route.query.changePassword) {
    openPwd()
    router.replace({ path: route.path, query: {} })
  }
})
</script>

<style scoped>
.page {
  max-width: 1200px;
}
.card {
  margin-bottom: 16px;
}
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.card-title-hint {
  color: #909399;
  font-size: 12px;
  font-weight: normal;
}
.overview {
  display: flex;
  align-items: center;
  gap: 16px;
}
.overview-meta {
  flex: 1;
  min-width: 0;
}
.overview-meta .name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}
.overview-meta .mobile {
  color: #606266;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  margin-bottom: 8px;
}
.overview-meta .tags > * {
  margin-right: 6px;
}
.form-hint {
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}
</style>