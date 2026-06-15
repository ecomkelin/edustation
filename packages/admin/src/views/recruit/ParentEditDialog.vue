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

      <!-- 推广人 / 咨询师: v-model=user 对象 + value-key, 不依赖 userApi.list 拉全 -->
      <el-form-item label="推广人" prop="promoteBy">
        <el-select
          v-model="form.promoteBy"
          value-key="_id"
          filterable
          clearable
          placeholder="可空"
          style="width: 100%"
        >
          <el-option
            v-for="u in promoterOptions"
            :key="u._id || u.id"
            :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
            :value="u"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="咨询师" prop="consultant">
        <el-select
          v-model="form.consultant"
          value-key="_id"
          filterable
          clearable
          placeholder="可空"
          style="width: 100%"
        >
          <el-option
            v-for="u in consultantOptions"
            :key="u._id || u.id"
            :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
            :value="u"
          />
        </el-select>
      </el-form-item>

      <!-- 家长状态 (lifecycle) — 手动可改, 5 态; 旁边带「重算」按钮 -->
      <el-form-item label="家长状态" prop="lifecycle">
        <div class="lifecycle-row">
          <el-select
            v-model="form.lifecycle"
            placeholder="手动管理家长 lifecycle"
            style="flex: 1"
          >
            <el-option
              v-for="s in lifecycleOptions"
              :key="s.value"
              :label="s.label"
              :value="s.value"
            />
          </el-select>
          <el-tag
            :type="lifecycleTagType(currentLifecycle)"
            size="small"
            class="ml"
          >
            当前 {{ lifecycleLabel(currentLifecycle) }}
          </el-tag>
          <el-button
            size="small"
            link
            type="primary"
            :loading="recomputing"
            class="ml"
            @click="onRecomputeLifecycle"
          >重算</el-button>
        </div>
        <span class="hint">
          手动改后跟系统推导可能不一致; 加 '已流失' 标签 / 点 '重算' 会覆盖手动值
        </span>
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
import { reactive, ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { parentApi } from '@/api/parent'
import { userApi } from '@/api/user'
import { categoryApi } from '@/api/category'
import { PARENT_LIFECYCLE_LABEL, PARENT_LIFECYCLE_TAG_TYPE } from '@/utils/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  parent: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref(null)
const submitting = ref(false)
const recomputing = ref(false)
const promoterOptions = ref([])
const consultantOptions = ref([])
const channelOptions = ref([])

const form = reactive({
  source: '',
  sourceDetail: '',
  // promoteBy / consultant 现在存"完整 user 对象" (populate 后的)
  // el-select 的 value-key="_id" 帮我们匹配 options
  promoteBy: null,
  consultant: null,
  remark: '',
  lifecycle: ''
})

const rules = {
  sourceDetail: [{ max: 200, message: '不超过 200 字', trigger: 'blur' }],
  remark: [{ max: 500, message: '不超过 500 字', trigger: 'blur' }]
}

// 家长 lifecycle (5 态)
const lifecycleOptions = [
  { value: 'new', label: '新登记' },
  { value: 'partial', label: '部分报名' },
  { value: 'full', label: '已成单' },
  { value: 'lost', label: '已流失' },
  { value: 'dormant', label: '沉睡客户' }
]
const currentLifecycle = computed(() => props.parent?.lifecycle || '')
function lifecycleLabel(s) { return PARENT_LIFECYCLE_LABEL[s] || s || '-' }
function lifecycleTagType(s) { return PARENT_LIFECYCLE_TAG_TYPE[s] || '' }

watch(
  () => props.visible,
  async (v) => {
    if (!v || !props.parent) return
    await loadOptions()
    // 渠道: id 模式 (option 一定能找到, Channel 字典不大)
    form.source = props.parent.source?._id || props.parent.source || null
    form.sourceDetail = props.parent.sourceDetail || ''
    // promoteBy / consultant: 直接存 populate 后的对象, 不需要等 options 加载
    // (el-select value-key="_id" 帮我们做匹配, 初始显示就用对象自己的字段)
    form.promoteBy = props.parent.promoteBy || null
    form.consultant = props.parent.consultant || null
    form.remark = props.parent.remark || ''
    form.lifecycle = props.parent.lifecycle || ''
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
    // 兜底: 如果当前 promoteBy/consultant 已被 populate 但不在拉到的列表里 (pageSize=200 上限)
    // 把它加到 options 头部, 避免 select 拿不到 option 导致显示原始 ID
    const promoteById = props.parent?.promoteBy?._id || props.parent?.promoteBy
    const consultantId = props.parent?.consultant?._id || props.parent?.consultant
    if (promoteById && !filtered.some((u) => String(u._id) === String(promoteById))
        && props.parent.promoteBy && typeof props.parent.promoteBy === 'object') {
      filtered.unshift(props.parent.promoteBy)
    }
    if (consultantId && props.parent.consultant && typeof props.parent.consultant === 'object'
        && !filtered.some((u) => String(u._id) === String(consultantId))) {
      // 注: 同一个对象引用会同时塞到两个数组; 没问题, label 相同
      filtered.unshift(props.parent.consultant)
    }
    promoterOptions.value = filtered
    consultantOptions.value = [...filtered]
    channelOptions.value = cRes.data?.items || (Array.isArray(cRes.data) ? cRes.data : [])
  } catch (e) {
    promoterOptions.value = []
    consultantOptions.value = []
    channelOptions.value = []
  }
}

async function onRecomputeLifecycle() {
  if (!props.parent?._id) return
  recomputing.value = true
  try {
    const r = await parentApi.recomputeLifecycle(props.parent._id)
    const newLc = r.data?.lifecycle
    if (newLc) {
      form.lifecycle = newLc
      ElMessage.success(`已重算: ${lifecycleLabel(newLc)}`)
    } else {
      ElMessage.warning('重算成功, 但未返回 lifecycle')
    }
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '重算失败'
    ElMessage.error(`重算失败: ${msg}`)
  } finally {
    recomputing.value = false
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
    const payload = {
      source: form.source,
      sourceDetail: form.sourceDetail,
      // v-model=object 模式, 提交时取 ._id
      promoteBy: form.promoteBy?._id || null,
      consultant: form.consultant?._id || null,
      remark: form.remark
    }
    // lifecycle 真的改了才发 (避免无意义 PUT)
    if (form.lifecycle && form.lifecycle !== currentLifecycle.value) {
      payload.lifecycle = form.lifecycle
    }
    await parentApi.update(props.parent._id, payload)
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
.ml { margin-left: 8px; }
.lifecycle-row { display: flex; align-items: center; width: 100%; }
</style>
