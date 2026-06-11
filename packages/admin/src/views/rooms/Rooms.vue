<template>
  <div class="page">
    <h2>教室</h2>
    <el-button type="primary" @click="openCreate">新建教室</el-button>
    <el-table :data="list" v-loading="loading" style="margin-top: 16px">
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="capacity" label="容量" width="100" />
      <el-table-column prop="location" label="位置" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="confirmRemove(row)">删除</el-button>
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
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { roomApi } from '@/api/room'

const list = ref([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const form = reactive({ _id: null, name: '', capacity: 10, location: '' })

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
  Object.assign(form, { _id: null, name: '', capacity: 10, location: '' })
  isEdit.value = false
}

function openCreate() {
  resetForm()
  dialog.value = true
}

function openEdit(row) {
  Object.assign(form, { _id: row._id, name: row.name, capacity: row.capacity, location: row.location || '' })
  isEdit.value = true
  dialog.value = true
}

async function submit() {
  if (!form.name) return ElMessage.warning('请填写名称')
  saving.value = true
  try {
    if (isEdit.value) {
      await roomApi.update(form._id, {
        name: form.name,
        capacity: form.capacity,
        location: form.location
      })
      ElMessage.success('已更新')
    } else {
      await roomApi.create({
        name: form.name,
        capacity: form.capacity,
        location: form.location
      })
      ElMessage.success('已创建')
    }
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function confirmRemove(row) {
  try {
    await ElMessageBox.confirm(`确定删除教室"${row.name}"吗？`, '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    await roomApi.remove(row._id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

onMounted(load)
</script>