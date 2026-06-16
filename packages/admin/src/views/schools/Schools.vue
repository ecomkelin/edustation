<template>
  <div class="page">
    <h2>学校档案</h2>
    <p class="hint">
      维护周边学校基础档案（学段/地址/出口数/放学时间），用于市场地推站位规划与学生归类。
    </p>
    <el-space wrap>
      <el-input v-model="keyword" placeholder="学校名" clearable @keyup.enter="load" />
      <el-select v-model="typeFilter" placeholder="学段" clearable style="width: 130px" @change="load">
        <el-option label="幼儿园" value="kindergarten" />
        <el-option label="小学" value="elementary" />
        <el-option label="初中" value="middle" />
        <el-option label="高中" value="high" />
      </el-select>
      <el-select v-model="stateFilter" style="width: 130px" @change="load">
        <el-option label="全部" value="all" />
        <el-option label="启用" value="active" />
        <el-option label="停用" value="inactive" />
      </el-select>
      <el-button @click="load">搜索</el-button>
      <el-button type="primary" @click="openCreate">新建学校</el-button>
    </el-space>
    <el-table :data="list" v-loading="loading" style="margin-top: 16px">
      <el-table-column prop="name" label="学校名" min-width="180" />
      <el-table-column label="学段" width="90">
        <template #default="{ row }">
          <el-tag size="small">{{ SCHOOL_TYPE_LABEL[row.type] || row.type || '-' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
      <el-table-column prop="exitCount" label="出口数" width="80" align="center" />
      <el-table-column prop="weekdayDismissal" label="周一~周四放学" width="120" align="center" />
      <el-table-column prop="fridayDismissal" label="周五放学" width="100" align="center" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive !== false ? 'success' : 'info'">
            {{ row.isActive !== false ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            v-if="row.isActive !== false"
            size="small"
            type="warning"
            @click="deactivate(row)"
          >停用</el-button>
          <el-button
            v-else
            size="small"
            type="success"
            @click="reactivate(row)"
          >启用</el-button>
          <!-- 误操删除:先 removable-check,有挡板则不进入密码弹窗;仅超管可见 -->
          <DestructiveConfirm
            v-if="isPlatformAdmin"
            :target="`学校 ${row.name}`"
            warning="中风险"
            :precheck-notes="['无在册学生引用']"
            :precheck="() => schoolApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger">误操删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 16px"
      @current-change="load"
    />

    <el-dialog
      v-model="dialog"
      :title="isEdit ? '编辑学校' : '新建学校'"
      width="520px"
    >
      <el-form :model="form" label-width="110px">
        <el-form-item label="学校名" required>
          <el-input v-model="form.name" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="学段">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="幼儿园" value="kindergarten" />
            <el-option label="小学" value="elementary" />
            <el-option label="初中" value="middle" />
            <el-option label="高中" value="high" />
          </el-select>
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" maxlength="200" />
        </el-form-item>
        <el-form-item label="出口数量">
          <el-input-number v-model="form.exitCount" :min="0" :step="1" />
          <span style="margin-left: 8px; color: #999; font-size: 12px">用于发传单站位规划</span>
        </el-form-item>
        <el-form-item label="周一~周四放学">
          <el-time-picker
            v-model="weekdayTime"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="默认 17:30"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="周五放学">
          <el-time-picker
            v-model="fridayTime"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="默认 16:00"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item v-if="isEdit" label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { schoolApi } from '@/api/school'
import { handleRemoveError } from '@/utils/removable'
import { SCHOOL_TYPE_LABEL } from '@/utils/constants'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const list = ref([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const keyword = ref('')
const typeFilter = ref('')
const stateFilter = ref('active')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const form = reactive(emptyForm())
// el-time-picker 需要一个可空对象,空时让后端使用默认值
const weekdayTime = ref(null)
const fridayTime = ref(null)

function emptyForm() {
  return {
    _id: null,
    name: '',
    type: 'elementary',
    address: '',
    exitCount: 0,
    notes: '',
    isActive: true
  }
}

async function load() {
  loading.value = true
  try {
    const params = {
      keyword: keyword.value,
      type: typeFilter.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    }
    if (stateFilter.value === 'active') params.isActive = 'true'
    else if (stateFilter.value === 'inactive') params.isActive = 'false'
    const r = await schoolApi.list(params)
    list.value = r.data.items
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, emptyForm())
  weekdayTime.value = null
  fridayTime.value = null
  isEdit.value = false
}

function openCreate() {
  resetForm()
  dialog.value = true
}

function openEdit(row) {
  Object.assign(form, {
    _id: row._id,
    name: row.name,
    type: row.type || 'elementary',
    address: row.address || '',
    exitCount: row.exitCount || 0,
    notes: row.notes || '',
    isActive: row.isActive !== false
  })
  weekdayTime.value = row.weekdayDismissal || null
  fridayTime.value = row.fridayDismissal || null
  isEdit.value = true
  dialog.value = true
}

async function submit() {
  if (!form.name) return ElMessage.warning('请填写学校名')
  saving.value = true
  try {
    const payload = {
      name: form.name,
      type: form.type,
      address: form.address,
      exitCount: form.exitCount,
      weekdayDismissal: weekdayTime.value || undefined,
      fridayDismissal: fridayTime.value || undefined,
      notes: form.notes
    }
    if (isEdit.value) {
      payload.isActive = form.isActive
      await schoolApi.update(form._id, payload)
      ElMessage.success('已更新')
    } else {
      await schoolApi.create(payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function deactivate(row) {
  try {
    await ElMessageBox.confirm(
      `确认停用学校「${row.name}」吗？停用后该学校不会出现在学生表单下拉中(已绑定的学生仍可读历史信息)。`,
      '请确认',
      { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' }
    )
  } catch (_) { return }
  await schoolApi.update(row._id, { isActive: false })
  ElMessage.success('已停用')
  load()
}

async function reactivate(row) {
  await schoolApi.update(row._id, { isActive: true })
  ElMessage.success('已启用')
  load()
}

async function onRemoveConfirm(row, { password }) {
  try {
    await schoolApi.remove(row._id, { password })
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', `学校 ${row.name}`)
  }
}

onMounted(load)
</script>

<style scoped>
.hint {
  color: #909399;
  font-size: 13px;
  margin: 4px 0 12px;
}
</style>
