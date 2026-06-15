<template>
  <el-dialog
    :model-value="visible"
    title="编辑家长档案"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <el-form-item label="家长电话">
        <el-input :model-value="parent?.phone" disabled />
        <span class="hint">电话为业务唯一键, 创建后不可修改</span>
      </el-form-item>

      <el-form-item label="渠道" prop="source">
        <el-select
          v-model="form.source"
          filterable
          clearable
          placeholder="不选则留空 (创建时默认 = 地推)"
          style="width: 100%"
        >
          <el-option
            v-for="c in channelOptions"
            :key="c._id"
            :label="c.name"
            :value="c._id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="渠道说明" prop="sourceDetail">
        <el-input
          v-model="form.sourceDetail"
          maxlength="200"
          placeholder="如 老学员-王五妈介绍"
        />
      </el-form-item>

      <el-form-item label="推广人" prop="promoteBy">
        <el-select
          v-model="form.promoteBy"
          filterable
          clearable
          placeholder="可空"
          style="width: 100%"
        >
          <el-option
            v-for="u in promoterOptions"
            :key="u._id || u.id"
            :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
            :value="u._id || u.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="咨询师" prop="consultant">
        <el-select
          v-model="form.consultant"
          filterable
          clearable
          placeholder="可空"
          style="width: 100%"
        >
          <el-option
            v-for="u in consultantOptions"
            :key="u._id || u.id"
            :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
            :value="u._id || u.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="500" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { parentApi } from '@/api/parent'
import { userApi } from '@/api/user'
import { categoryApi } from '@/api/category'

const props = defineProps({
  visible: { type: Boolean, default: false },
  parent: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref(null)
const submitting = ref(false)
const promoterOptions = ref([])
const consultantOptions = ref([])
const channelOptions = ref([])

const form = reactive({
  source: '',
  sourceDetail: '',
  promoteBy: null,
  consultant: null,
  remark: ''
})

const rules = {
  // source 是 ObjectId, 不需要长度校验
  sourceDetail: [{ max: 200, message: '不超过 200 字', trigger: 'blur' }],
  remark: [{ max: 500, message: '不超过 500 字', trigger: 'blur' }]
}

watch(
  () => props.visible,
  async (v) => {
    if (!v || !props.parent) return
    // 先把 options 拉好, 再回填 v-model; 否则 el-select 第一帧会拿不到 option, 直接把 v-model 原始 id 字符串当 label 显示
    await loadOptions()
    form.source = props.parent.source?._id || props.parent.source || null
    form.sourceDetail = props.parent.sourceDetail || ''
    form.promoteBy = props.parent.promoteBy?._id || props.parent.promoteBy || null
    form.consultant = props.parent.consultant?._id || props.parent.consultant || null
    form.remark = props.parent.remark || ''
  },
  { immediate: true }
)

async function loadOptions() {
  try {
    // 推广人 / 咨询师 = 全员里非"家长"岗位
    const [uRes, cRes] = await Promise.all([
      userApi.list({ pageSize: 200 }),
      categoryApi.list({ model: 'Channel', pageSize: 100 })
    ])
    const all = uRes.data?.items || (Array.isArray(uRes.data) ? uRes.data : [])
    const filtered = all.filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
    promoterOptions.value = filtered
    consultantOptions.value = filtered
    channelOptions.value = cRes.data?.items || (Array.isArray(cRes.data) ? cRes.data : [])
  } catch (e) {
    promoterOptions.value = []
    consultantOptions.value = []
    channelOptions.value = []
  }
}

async function submit() {
  if (!formRef.value || !props.parent) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  submitting.value = true
  try {
    await parentApi.update(props.parent._id, {
      source: form.source,
      sourceDetail: form.sourceDetail,
      promoteBy: form.promoteBy || null,
      consultant: form.consultant || null,
      remark: form.remark
    })
    ElMessage.success('已保存')
    emit('saved')
    emit('update:visible', false)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
