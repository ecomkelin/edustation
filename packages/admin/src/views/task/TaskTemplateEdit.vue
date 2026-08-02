<template>
  <div class="page">
    <div class="page__header">
      <h2>{{ isNew ? '新建模板' : '编辑模板' }}</h2>
      <el-button @click="$router.back()">返回</el-button>
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" v-loading="saving">
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" maxlength="200" show-word-limit />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="3" maxlength="5000" />
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="form.type" style="width: 200px">
          <el-option v-for="o in TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="优先级">
        <el-select v-model="form.priority" style="width: 200px">
          <el-option v-for="o in PRIORITY_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="默认执行人" prop="defaultAssignees">
        <el-select v-model="defaultAssigneeUsers" multiple filterable style="width: 100%" placeholder="至少 1 个">
          <el-option v-for="u in userOptions" :key="u.id" :label="userLabel(u)" :value="u.id">
            <span>{{ userLabel(u) }}</span>
            <span class="opt-pos">{{ positionText(u) }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="默认监督人" prop="defaultSupervisors">
        <el-select v-model="form.defaultSupervisors" multiple filterable style="width: 100%" placeholder="至少 1 个">
          <el-option v-for="u in userOptions" :key="u.id" :label="userLabel(u)" :value="u.id">
            <span>{{ userLabel(u) }}</span>
            <span class="opt-pos">{{ positionText(u) }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="checklist">
        <div class="items">
          <div v-for="(it, idx) in form.itemTemplates" :key="idx" class="items__row">
            <el-input v-model="it.title" placeholder="条目内容" style="flex: 1" />
            <el-button link type="danger" @click="form.itemTemplates.splice(idx, 1)">删除</el-button>
          </div>
          <el-button :icon="Plus" @click="form.itemTemplates.push({ title: '', order: form.itemTemplates.length })">添加条目</el-button>
        </div>
      </el-form-item>

      <el-divider content-position="left">周期</el-divider>

      <el-form-item label="类型" prop="schedule.kind">
        <el-select v-model="form.schedule.kind" style="width: 200px">
          <el-option label="每天" value="daily" />
          <el-option label="每周" value="weekly" />
          <el-option label="每月" value="monthly" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.schedule.kind === 'daily'" label="时刻">
        <el-select v-model="form.schedule.hour" multiple style="width: 300px" placeholder="选择生成时刻(可多选)">
          <el-option v-for="h in 24" :key="h-1" :label="`${h-1} 时`" :value="h-1" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.schedule.kind === 'weekly'" label="星期">
        <el-select v-model="form.schedule.weekdays" multiple style="width: 300px" placeholder="选择星期(可多选)">
          <el-option v-for="(label, idx) in weekdayLabels" :key="idx" :label="label" :value="idx" />
        </el-select>
        <el-select v-model="form.schedule.hour" multiple style="width: 200px; margin-left: 8px" placeholder="时刻">
          <el-option v-for="h in 24" :key="h-1" :label="`${h-1} 时`" :value="h-1" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.schedule.kind === 'monthly'" label="日期">
        <el-select v-model="form.schedule.daysOfMonth" multiple style="width: 300px" placeholder="选择日期(可多选)">
          <el-option v-for="d in 31" :key="d" :label="`${d} 日`" :value="d" />
        </el-select>
        <el-select v-model="form.schedule.hour" multiple style="width: 200px; margin-left: 8px" placeholder="时刻">
          <el-option v-for="h in 24" :key="h-1" :label="`${h-1} 时`" :value="h-1" />
        </el-select>
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="form.isActive" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import {
  TASK_TYPES, TASK_TYPE_LABELS,
  TASK_PRIORITIES, TASK_PRIORITY_LABELS
} from '@shared/enums.mjs'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// canonical pattern: 拍平为 [{value, label}] 数组
const TYPE_OPTIONS = TASK_TYPES.map((v) => ({ value: v, label: TASK_TYPE_LABELS[v] || v }))
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((v) => ({ value: v, label: TASK_PRIORITY_LABELS[v] || v }))
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const isNew = computed(() => route.params.id === 'new')
const saving = ref(false)
const userOptions = ref([])
const formRef = ref(null)

// 2026-07-08: computed 双向绑定, 让 el-select 和 form.validate 共享同一份数据.
//   get 把 form.defaultAssignees ([{user: id|populateDoc}]) 抽成 id 数组给 el-select 渲染;
//   set 把 el-select 选出来的 id 数组写回 form.defaultAssignees 的 [{user: id}] 形态, 给后端 PATCH.
//   单一数据源避免「el-select 选了人但 form 校验还是空」这类错位.
const defaultAssigneeUsers = computed({
  get() {
    return (form.value.defaultAssignees || [])
      .map((a) => {
        const u = a && a.user
        if (!u) return null
        return typeof u === 'string' ? u : String(u._id || u.id || '')
      })
      .filter(Boolean)
  },
  set(ids) {
    form.value.defaultAssignees = (ids || []).map((id) => ({ user: id }))
  }
})

// form.schedule.hour/array 双向: 多个 el-select
const form = ref({
  title: '',
  description: '',
  type: 'other',
  priority: 'normal',
  defaultAssignees: [],
  defaultSupervisors: [],
  itemTemplates: [],
  schedule: { kind: 'daily', hour: [9], weekdays: [], daysOfMonth: [] },
  isActive: true
})

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  defaultAssignees: [{ required: true, type: 'array', min: 1, message: '至少 1 个执行人', trigger: 'change' }],
  defaultSupervisors: [{ required: true, type: 'array', min: 1, message: '至少 1 个监督人', trigger: 'change' }],
  'schedule.kind': [{ required: true, message: '请选择周期类型', trigger: 'change' }]
}

function userLabel(u) {
  // 显示名字, 没填 realName 的退到手机号, 都没有才退 id
  return u.realName || u.mobile || u.id
}

function positionText(u) {
  const names = (u.positions || []).map((p) => p.name).filter(Boolean)
  return names.length ? names.join(' / ') : ''
}

async function loadUsers() {
  // 2026-08-02: 改用 R-3924 /tasks/assignable-users (本机构员工, 纯家长除外)
  //   原来打 GET /users?roleScope=staff 要 user.read 权限, 财务岗只有 task.write → 403 空下拉
  try {
    const r = await taskApi.assignableUsers()
    userOptions.value = r.data?.items || []
    if (userOptions.value.length === 0) {
      ElMessage.warning('本机构暂无可派任务的员工,请先在「用户管理」给员工分配岗位')
    }
  } catch (_) {
    ElMessage.error('加载员工列表失败,请刷新重试或联系管理员')
  }
}

/**
 * 兜底: 模板的 defaultAssignees / defaultSupervisors 可能引用本机构外的 user
 *   (e.g. 种子 fallback 到平台超管), userOptions 里没有, el-select 会显示 raw id.
 *   这种情况按 id 单独拉一次补进 userOptions.
 *
 * @param {Array<string|Object|ObjectId>} ids 既能接收 id 字符串也能接收 populate 出来的 User 文档
 *   (字符串化场景: `String({...})` → "[object Object]", URL 会爆; 故先抽 _id)
 */
function normalizeUserId(id) {
  if (!id) return null
  if (typeof id === 'string') return id
  // ObjectId 实例 (mongoose.Types.ObjectId) 没有 _id 也没有 id, 但 .toString() 返回 hex
  // - populate 出来的 User 文档有 _id 字段
  // - 兜底: 抽 hex / 数字段 / 字符串化, 任一非默认 (排除 "[object Object]") 即用
  let s = ''
  if (typeof id === 'object') {
    s = String(id._id || id.id || '')
    if (!s || s === '[object Object]') s = String(id) // ObjectId instance fallback
  } else {
    s = String(id)
  }
  return s && s !== '[object Object]' ? s : null
}

async function ensureUsersByIds(ids) {
  const idSet = new Set()
  for (const raw of ids || []) {
    const id = normalizeUserId(raw)
    if (id) idSet.add(id)
  }
  const missing = [...idSet].filter(
    (id) => !userOptions.value.find((u) => String(u.id) === String(id))
  )
  if (missing.length === 0) return
  // 并行拉, 失败的忽略 (用户可能已被删除; el-select 会显示 raw id 但不影响保存)
  const results = await Promise.all(
    missing.map((id) =>
      userApi.detail(id).then((r) => r.data).catch(() => null)
    )
  )
  for (const u of results) {
    // user.service.detail 返回的是 User 文档 (_id), 这里统一成下拉需要的 {id, realName, mobile}
    const id = u && String(u.id || u._id || '')
    if (id) userOptions.value.push({ id, realName: u.realName, mobile: u.mobile, positions: [] })
  }
}

async function loadTemplate() {
  if (isNew.value) return
  const r = await taskApi.templateList({ page: 1, pageSize: 100 })
  const t = (r.data?.items || []).find((x) => x._id === route.params.id)
  if (!t) {
    ElMessage.error('模板不存在')
    router.back()
    return
  }
  form.value = {
    ...form.value,
    ...t,
    schedule: { ...form.value.schedule, ...t.schedule }
  }
  // 拍平 populate 出来的 User 文档到 id 字符串数组:
  //   - defaultSupervisors 直接绑 el-select v-model, 必须是 id 数组 (后端 validator isMongoId);
  //     否则保存时数组里是对象, 全炸 "Invalid value"
  //   - defaultAssignees 通过 defaultAssigneeUsers 间接绑, 也先拍平更稳妥
  const assigneeIds = (t.defaultAssignees || [])
    .map((a) => normalizeUserId(a.user?._id || a.user))
    .filter(Boolean)
  const supervisorIds = (t.defaultSupervisors || [])
    .map((s) => normalizeUserId(s))
    .filter(Boolean)

  // 覆盖 spread 进来的 populate 文档数组
  form.value.defaultSupervisors = supervisorIds
  // 2026-07-08: 直接写 form 的最终形态 ([{user: id}]), form 校验和 PATCH 都直接用,
  //   不必走 defaultAssigneeUsers.setter (那是 el-select 改选时才触发).
  form.value.defaultAssignees = assigneeIds.map((id) => ({ user: id }))
  await ensureUsersByIds([...assigneeIds, ...supervisorIds])
}

async function onSubmit() {
  try {
    await formRef.value.validate()
  } catch (_) {
    // 校验失败: Element Plus 已经把错误显示在表单上了
    return
  }
  // 2026-07-08: form.defaultAssignees 已被 defaultAssigneeUsers.computed setter 实时同步为 [{user: id}] 形态,
  //   这里不再拍平, 直接 PATCH. (loadTemplate 也已经写好 form 的最终形态.)
  saving.value = true
  try {
    if (isNew.value) {
      await taskApi.templateCreate(form.value)
      ElMessage.success('已创建')
    } else {
      await taskApi.templateUpdate(route.params.id, form.value)
      ElMessage.success('已保存')
    }
    router.replace('/tasks/templates')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadUsers()
  await loadTemplate()
})
</script>

<style scoped>
.page { padding: 16px; max-width: 900px; }
.page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.items { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.items__row { display: flex; gap: 8px; align-items: center; }
/* 下拉里岗位名做次要信息, 右侧灰字 */
.opt-pos { float: right; margin-left: 16px; color: #909399; font-size: 12px; }
</style>