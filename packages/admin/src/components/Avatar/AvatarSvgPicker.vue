<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="520px"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div class="avatar-picker">
      <div class="avatar-picker__grid" :style="{ '--col': colCount }">
        <button
          v-for="item in items"
          :key="item.key"
          type="button"
          class="avatar-picker__item"
          :class="{ 'avatar-picker__item--active': item.key === local }"
          @click="select(item.key)"
        >
          <SvgAvatar
            :svg-key="item.key"
            :size="64"
            audience="user"
          />
          <span class="avatar-picker__label">{{ item.label }}</span>
        </button>
      </div>
      <div v-if="allowClear" class="avatar-picker__clear">
        <el-button size="small" plain @click="select(null)">清除</el-button>
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import avatars from '@shared/avatars'
import SvgAvatar from './SvgAvatar.vue'

// 2026-07-05: Vite optimizeDeps 把 CJS 包成 __commonJS + 仅 expose `default`,
//   named exports 在浏览器侧不可用. 改为 default import + 解构.
const { getAvatarsByAudience } = avatars

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 当前已选 key (v-model)
  keyValue: { type: String, default: null },
  // 'user' 或 'student'
  audience: {
    type: String,
    default: 'user',
    validator: (v) => ['user', 'student'].includes(v)
  },
  // dialog 标题
  title: { type: String, default: '选择头像' },
  // Student picker 允许清空 (留空由教务/家长后续手动指定); User picker 不允许
  allowClear: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'update:keyValue', 'change'])

// 内部临时值, 点 "确定" 才回写到 v-model:keyValue
const local = ref(props.keyValue || null)

watch(
  () => props.keyValue,
  (v) => { local.value = v || null }
)

const items = computed(() => getAvatarsByAudience(props.audience))

const colCount = computed(() => (props.audience === 'user' ? 4 : 3))

function select(k) {
  local.value = k
}

function onOpen() {
  local.value = props.keyValue || null
}

function confirm() {
  emit('update:keyValue', local.value)
  emit('change', local.value)
  emit('update:modelValue', false)
}

// SvgAvatar 传 prop 名是 'key' 在文档里说要避免 Vue prop 名冲突, 这里用一个别名
// 在父组件用 v-model:key-value
</script>

<style scoped>
.avatar-picker__grid {
  display: grid;
  grid-template-columns: repeat(var(--col, 4), 1fr);
  gap: 16px;
  padding: 8px 0 16px;
}
.avatar-picker__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #fafbfc;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.avatar-picker__item:hover {
  background: #f0f3f7;
}
.avatar-picker__item--active {
  border-color: var(--el-color-primary);
  background: #e8f4ff;
}
.avatar-picker__label {
  font-size: 13px;
  color: #606266;
}
.avatar-picker__item--active .avatar-picker__label {
  color: var(--el-color-primary);
  font-weight: 600;
}
.avatar-picker__clear {
  text-align: center;
  padding-top: 4px;
}
</style>
