<template>
  <el-dialog
    :model-value="visible"
    title="家长沟通画像"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <div v-if="parent" class="profile-header">
      <span class="header-label">家长:</span>
      <span class="header-name">{{ parent.realName || '—' }}</span>
      <span class="header-phone">{{ parent.phone || '—' }}</span>
      <el-tag v-if="parent.lifecycle" :type="lifecycleType(parent.lifecycle)" size="small" style="margin-left: 8px">
        {{ parent.lifecycle }}
      </el-tag>
    </div>

    <el-form ref="formRef" :model="form" label-width="100px" label-position="right">
      <el-form-item label="沟通偏好">
        <el-input
          v-model="form.commStyle"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
          placeholder="例: 偏好微信; 晚上 9 点后不接电话; 决策偏慢"
        />
      </el-form-item>
      <el-form-item label="家庭背景">
        <el-input
          v-model="form.familyBg"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
          placeholder="例: 双职工 / 全职妈妈 / 二孩家庭 / 隔代带"
        />
      </el-form-item>
      <el-form-item label="孩子关注">
        <el-input
          v-model="form.childFocus"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
          placeholder="例: 升学 / 兴趣培养 / 习惯养成 / 抗挫力"
        />
      </el-form-item>
      <el-form-item label="跟进备忘">
        <el-input
          v-model="form.followUp"
          type="textarea"
          :rows="5"
          :maxlength="2000"
          show-word-limit
          placeholder="例: 暑假班续费意向; 对李老师有好感; 上次约下周回访"
        />
      </el-form-item>
      <el-form-item v-if="form.lastUpdatedAt" label="最后更新">
        <span class="meta-text">
          {{ form.lastUpdatedBy?.realName || '系统' }} ·
          {{ formatTime(form.lastUpdatedAt) }}
        </span>
      </el-form-item>
      <el-form-item v-else label=" ">
        <span class="meta-text meta-empty">尚未填写</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="onClose(false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { parentApi } from '@/api/parent'

const props = defineProps({
  visible: { type: Boolean, default: false },
  parent: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref()
const saving = ref(false)

const form = reactive({
  commStyle: '',
  familyBg: '',
  childFocus: '',
  followUp: '',
  lastUpdatedBy: null,
  lastUpdatedAt: null
})

watch(
  () => [props.visible, props.parent?.id],
  async ([vis, id]) => {
    if (vis && id) await loadProfile()
  },
  { immediate: true }
)

async function loadProfile() {
  try {
    const r = await parentApi.getProfile(props.parent.id)
    Object.assign(form, {
      commStyle: r.data.commStyle || '',
      familyBg: r.data.familyBg || '',
      childFocus: r.data.childFocus || '',
      followUp: r.data.followUp || '',
      lastUpdatedBy: r.data.lastUpdatedBy || null,
      lastUpdatedAt: r.data.lastUpdatedAt || null
    })
  } catch (e) {
    // 422 表示 rel 不存在, 后端已返回空对象 → 不会走 catch. 但兜底
    ElMessage.error(e?.response?.data?.message || '加载画像失败')
  }
}

async function onSave() {
  saving.value = true
  try {
    const r = await parentApi.setProfile(props.parent.id, {
      commStyle: form.commStyle,
      familyBg: form.familyBg,
      childFocus: form.childFocus,
      followUp: form.followUp
    })
    form.lastUpdatedBy = r.data.lastUpdatedBy
    form.lastUpdatedAt = r.data.lastUpdatedAt
    ElMessage.success('已保存')
    emit('saved', r.data)
    onClose(false)
  } catch (e) {
    // 错误已由拦截器弹
  } finally {
    saving.value = false
  }
}

function onClose(v) {
  emit('update:visible', v ?? false)
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function lifecycleType(lc) {
  return {
    new: 'info',
    partial: 'warning',
    full: 'success',
    lost: 'danger',
    dormant: ''
  }[lc] || ''
}
</script>

<style scoped>
.profile-header {
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #f5f7fa;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-label {
  color: #999;
  font-size: 13px;
}
.header-name {
  font-weight: 600;
  font-size: 15px;
}
.header-phone {
  color: #606266;
  font-family: ui-monospace, monospace;
}
.meta-text {
  color: #999;
  font-size: 12px;
}
.meta-empty {
  color: #c0c4cc;
}
</style>
