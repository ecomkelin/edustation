<template>
  <div class="page">
    <h2>教室</h2>
    <el-button type="primary" @click="openCreate">新建教室</el-button>
    <el-table :data="list" v-loading="loading" style="margin-top: 16px">
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="capacity" label="容量" width="100" />
      <el-table-column prop="location" label="位置" />
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
            :target="`教室 ${row.name}`"
            warning="高风险"
            :precheck-notes="['无未归档的开班/排课引用']"
            :precheck="() => roomApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger">误操删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialog"
      :title="isEdit ? '编辑教室' : '新建教室'"
      width="420px"
    >
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="容量"><el-input-number v-model="form.capacity" :min="1" /></el-form-item>
        <el-form-item label="位置"><el-input v-model="form.location" /></el-form-item>
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
import { roomApi } from '@/api/room'
import { handleRemoveError } from '@/utils/removable'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const list = ref([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const form = reactive({ _id: null, name: '', capacity: 10, location: '', isActive: true })

async function load() {
  loading.value = true
  try {
    const r = await roomApi.list()
    list.value = r.data
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, { _id: null, name: '', capacity: 10, location: '', isActive: true })
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
    capacity: row.capacity,
    location: row.location || '',
    isActive: row.isActive !== false
  })
  isEdit.value = true
  dialog.value = true
}

async function submit() {
  if (!form.name) return ElMessage.warning('请填写名称')
  saving.value = true
  try {
    const payload = {
      name: form.name,
      capacity: form.capacity,
      location: form.location
    }
    if (isEdit.value) {
      payload.isActive = form.isActive
      await roomApi.update(form._id, payload)
      ElMessage.success('已更新')
    } else {
      await roomApi.create(payload)
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
      `确认停用教室「${row.name}」吗？停用后该教室不能被新开班/排课引用。`,
      '请确认',
      { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' }
    )
  } catch (_) { return }
  await roomApi.update(row._id, { isActive: false })
  ElMessage.success('已停用')
  load()
}

async function reactivate(row) {
  await roomApi.update(row._id, { isActive: true })
  ElMessage.success('已启用')
  load()
}

async function onRemoveConfirm(row, { password }) {
  try {
    await roomApi.remove(row._id, { password })
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `教室 ${row.name}`)
  }
}

onMounted(load)
</script>
