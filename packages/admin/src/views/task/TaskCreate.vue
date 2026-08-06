<template>
  <div class="page">
    <div class="page__header">
      <h2>新建任务</h2>
      <el-button @click="$router.back()">返回</el-button>
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" v-loading="saving">
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" maxlength="200" show-word-limit />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="4" maxlength="5000" show-word-limit />
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="form.type" style="width: 200px">
          <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="优先级">
        <el-select v-model="form.priority" style="width: 200px">
          <el-option v-for="p in PRIORITY_OPTIONS" :key="p.value" :label="p.label" :value="p.value" />
        </el-select>
      </el-form-item>
      <!-- 2026-07-08: 平台超管可选 creator (默认 = 机构管理员); 普通员工不展示, 后端 controller 兜底 creator=self -->
      <el-form-item v-if="isPlatformAdmin" label="发起人" prop="creator">
        <el-select v-model="form.creator" filterable style="width: 100%" placeholder="默认 = 机构管理员">
          <el-option v-for="u in userOptions" :key="u.id" :label="userLabel(u)" :value="u.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="执行人" prop="assignees">
        <el-select v-model="form.assignees" multiple filterable style="width: 100%" placeholder="至少 1 个">
          <!-- 2026-07-09: 监督人 ≠ 执行人 — 已在 supervisors 里的用户在前端就 disable, 避免选完提交才被后端 400 -->
          <el-option v-for="u in userOptions" :key="u.id"
            :label="userLabel(u)"
            :value="u.id"
            :disabled="form.supervisors.includes(u.id)">
            <span>{{ userLabel(u) }}</span>
            <span class="opt-pos">{{ positionText(u) }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="监督人" prop="supervisors">
        <el-select v-model="form.supervisors" multiple filterable style="width: 100%" placeholder="默认 1 个,可多选">
          <el-option v-for="u in userOptions" :key="u.id"
            :label="userLabel(u)"
            :value="u.id"
            :disabled="form.assignees.includes(u.id)">
            <span>{{ userLabel(u) }}</span>
            <span class="opt-pos">{{ positionText(u) }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="开始时间" prop="startAt">
        <el-date-picker v-model="form.startAt" type="datetime" style="width: 240px" />
      </el-form-item>
      <el-form-item label="到期时间" prop="dueAt">
        <el-date-picker v-model="form.dueAt" type="datetime" style="width: 240px" />
      </el-form-item>
      <el-form-item label="标签">
        <!-- 2026-08-06 P1.2: 用 TagEditor 替换裸 input, 自动 suggestions + 后端统一清洗 -->
        <TagEditor v-model="form.tags" :max="30" :suggestions="tagOptions" placeholder="按 Enter 添加 (历史标签联想)" />
      </el-form-item>
      <el-form-item label="checklist">
        <div class="items">
          <div v-for="(it, idx) in form.items" :key="idx" class="items__row">
            <el-input v-model="it.title" placeholder="条目内容" style="flex: 1" />
            <el-select v-model="it.assignee" placeholder="分配给" style="width: 200px" :disabled="form.assignees.length === 0">
              <el-option v-for="uid in form.assignees" :key="uid" :label="userName(uid)" :value="uid" />
            </el-select>
            <el-button link type="danger" @click="form.items.splice(idx, 1)">删除</el-button>
          </div>
          <el-button :icon="Plus" @click="addItem">添加条目</el-button>
          <div class="items__hint">每个条目必须分配给一个执行人</div>
        </div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSubmit">创建</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { useAuthStore } from '@/stores/auth'
import TagEditor from '@/components/TagEditor.vue'
import {
  TASK_TYPES, TASK_TYPE_LABELS,
  TASK_PRIORITIES, TASK_PRIORITY_LABELS
} from '@shared/enums.mjs'

const router = useRouter()
const auth = useAuthStore()

// canonical pattern (跟 Orgs.vue / PetConsumableTab.vue 一致):
// 把 (TYPES, LABELS) 拍平为 [{ value, label }] 数组, 避开 v-for over Object.freeze 的潜在坑
const TYPE_OPTIONS = TASK_TYPES.map((v) => ({ value: v, label: TASK_TYPE_LABELS[v] || v }))
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((v) => ({ value: v, label: TASK_PRIORITY_LABELS[v] || v }))

const formRef = ref(null)
const saving = ref(false)
// 2026-08-06 P1.2: 标签历史联想 (本机构出现过的标签, R-3925 /tasks/distinct-tags)
const tagOptions = ref([])
const userOptions = ref([])

const form = ref({
  title: '',
  description: '',
  type: 'other',
  priority: 'normal',
  creator: null, // 平台超管可选: 默认 = 第一个机构管理员 (在 onMounted 里设置)
  assignees: [],
  supervisors: [], // onMounted 加载完 userOptions 后再设默认 (避免 el-select MULTIPLE 残留 raw id chip)
  startAt: new Date(), // 2026-07-08: 开始时间必填, 默认今天
  dueAt: null,
  items: [],
  // 2026-08-06: tags 改为数组直接交给 TagEditor, 后端 P0.2 统一清洗 (trim/dedup/≤30)
  tags: []
})

const isPlatformAdmin = computed(() => !!auth.user?.isPlatformAdmin)

// 找"机构管理员": userOptions 里 position.name === '管理员' 且 isSystem=true 的
const adminOptions = computed(() =>
  userOptions.value.filter((u) => (u.positions || []).some((p) => p.name === '管理员' && p.isSystem))
)

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  creator: isPlatformAdmin.value
    ? [{ required: true, message: '请选择发起人', trigger: 'change' }]
    : [],
  assignees: [{ required: true, type: 'array', min: 1, message: '至少 1 个执行人', trigger: 'change' }],
  supervisors: [{ required: true, type: 'array', min: 1, message: '至少 1 个监督人', trigger: 'change' }],
  startAt: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  dueAt: [{ required: true, message: '请选择到期时间', trigger: 'change' }]
}

function userLabel(u) {
  // 显示名字, 没填 realName 的退到手机号, 都没有才退 id (保证不会光秃秃甩一串 ObjectId)
  return u.realName || u.mobile || u.id
}

function positionText(u) {
  const names = (u.positions || []).map((p) => p.name).filter(Boolean)
  return names.length ? names.join(' / ') : ''
}

function userName(uid) {
  const u = userOptions.value.find((x) => x.id === uid)
  return u ? userLabel(u) : uid
}

function addItem() {
  form.value.items.push({ title: '', assignee: form.value.assignees[0] || '', order: form.value.items.length })
}

async function onSubmit() {
  try {
    await formRef.value.validate()
  } catch (_) {
    // 校验失败: Element Plus 已经把错误显示在表单上了, 不要弹 unhandled rejection
    return
  }
  saving.value = true
  try {
    // 2026-08-06: tags 已在 form.value 数组里, 无需 split, 后端 P0.2 _sanitizeTags 统一清洗
    const payload = { ...form.value }
    const r = await taskApi.create(payload)
    // 2026-08-02: 反馈通知数量 — 后端实际入库的 inbox 数与"assignees + supervisors 一致"是
    //   后端的责任 (Bug A 模板缺失 fallback + Bug B 监督人也收), 但前端给用户"看得见的反馈",
    //   下次有异常就能直接发现 (不像以前 ElMessage 只说"已创建", inbox 空了用户也不知道)
    const aN = (payload.assignees || []).length
    const sN = (payload.supervisors || []).length
    ElMessage.success(`已创建, 已通知 ${aN} 名执行人 + ${sN} 名监督人`)
    router.replace(`/tasks/${r.data?._id}`)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // 2026-08-02: 改用 R-3924 /tasks/assignable-users (本机构员工, 纯家长除外)
  //   原来打 GET /users?roleScope=staff, 要 user.read 权限 —— 财务岗只有 task.write → 403
  //   且 catch 静默吞掉, 表现为"执行人下拉空 + 监督人显示 raw id"
  try {
    const r = await taskApi.assignableUsers()
    userOptions.value = r.data?.items || []
    if (userOptions.value.length === 0) {
      ElMessage.warning('本机构暂无可派任务的员工,请先在「用户管理」给员工分配岗位')
    }
  } catch (_) {
    // 拉不到人时不能静默: 否则用户只看到空下拉, 无从判断是没人还是没权限
    ElMessage.error('加载员工列表失败,请刷新重试或联系管理员')
  }

  // 2026-08-06 P1.2: 加载标签历史, 给 TagEditor suggestions (失败不阻塞, 静默走空数组)
  try {
    const r = await taskApi.distinctTags()
    tagOptions.value = Array.isArray(r.data) ? r.data : []
  } catch (_) { /* 静默, TagEditor 没建议也能用 */ }

  // 等下一帧让 el-select 看到新 options 后再 set 默认值
  // (避免 el-select MULTIPLE 残留 raw id chip + 单一 el-select 接不住 v-model 的边角问题)
  await nextTick()
  const firstAdminId = adminOptions.value[0]?.id
  // 2026-08-02: 默认值只能取 userOptions 里存在的 id, 否则 el-select 找不到 option
  //   会把 raw ObjectId 当 label 甩出来 (之前"监督人显示一串 id"就是这么来的)
  const selfId = String(auth.user?.id || auth.user?.userId || auth.user?._id || '')
  const selfInOptions = userOptions.value.some((u) => u.id === selfId) ? selfId : null
  const defaultId = firstAdminId || selfInOptions || userOptions.value[0]?.id || null
  if (isPlatformAdmin.value) {
    form.value.creator = defaultId
  }
  form.value.supervisors = defaultId ? [defaultId] : []
})
</script>

<style scoped>
.page { padding: 16px; max-width: 900px; }
.page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.items { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.items__row { display: flex; gap: 8px; align-items: center; }
.items__hint { font-size: 12px; color: #909399; }
/* 下拉里岗位名做次要信息, 右侧灰字 (张三  老师/教务) */
.opt-pos { float: right; margin-left: 16px; color: #909399; font-size: 12px; }
</style>