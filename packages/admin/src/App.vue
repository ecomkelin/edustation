<template>
  <el-config-provider :locale="zhCn">
    <router-view />
    <!-- 全局单例：无法删除挡板弹窗 -->
    <RemovableBlockedDialog
      v-model:visible="visible"
      :title="title"
      :target="target"
      :blockers="blockers"
    />
  </el-config-provider>
</template>

<script setup>
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import RemovableBlockedDialog from '@/components/RemovableBlockedDialog.vue'
import { useBlockedDialogState } from '@/composables/useBlockedDialog'

const { visible, title, target, blockers } = useBlockedDialogState()
</script>
