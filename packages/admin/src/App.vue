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
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import RemovableBlockedDialog from '@/components/RemovableBlockedDialog.vue'
import { useBlockedDialogState } from '@/composables/useBlockedDialog'

const { visible, title, target, blockers } = useBlockedDialogState()
// 注：layout 切换目前由 router 配置 children 内 component 自带 layout 完成。
// ClassroomLayout 自身包含 <router-view />；DefaultLayout 也含 <router-view />。
// 顶级 router-view 这里透传，路由 meta 仅用于 ClassEntryGuard 等场景。
</script>
