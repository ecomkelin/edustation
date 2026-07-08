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
          <el-option v-for="(label, val) in typeLabels" :key="val" :label="label" :value="val" />
        </el-select>
      </el-form-item>
      <el-form-item label="优先级">
        <el-select v-model="form.priority" style="width: 200px">
          <el-option v-for="(label, val) in priorityLabels" :key="val" :label="label" :value="val" />
        </el-select>
      </el-form-item>
      <el-form-item label="默认执行人" prop="defaultAssignees">
        <el-select v-model="defaultAssigneeUsers" multiple filterable style="width: 100%" placeholder="至少 1 个">
          <el-option v-for="u in userOptions" :key="u.id" :label="u.realName || u.name" :value="u.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="默认监督人" prop="defaultSupervisors">
        <el-select v-model="form.defaultSupervisors" multiple filterable style="width: 100%" placeholder="至少 1 个">
          <el-option v-for="u in userOptions" :key="u.id" :label="u.realName || u.name" :value="u.id" />
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
import { TASK_TYPE_LABELS, TASK_PRIORITY_LABELS } from '@shared/enums.mjs'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const typeLabels = TASK_TYPE_LABELS
const priorityLabels = TASK_PRIORITY_LABELS
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const isNew = computed(() => route.params.id === 'new')
const saving = ref(false)
const userOptions = ref([])
const formRef = ref(null)
const defaultAssigneeUsers = ref([])

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

async function loadUsers() {
  // roleScope: 'staff' 排除纯家长 (2026-07-08: 任务模块暂不向家长派任务)
  const r = await userApi.list({ page: 1, pageSize: 500, roleScope: 'staff' })
  userOptions.value = r.data?.items || []
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
  defaultAssigneeUsers.value = (t.defaultAssignees || []).map((a) => a.user?._id || a.user)
}

async function onSubmit() {
  try {
    await formRef.value.validate()
  } catch (_) {
    // 校验失败: Element Plus 已经把错误显示在表单上了
    return
  }
  // 把 defaultAssigneeUsers 转 defaultAssignees
  form.value.defaultAssignees = defaultAssigneeUsers.value.map((u) => ({ user: u }))
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
</style>