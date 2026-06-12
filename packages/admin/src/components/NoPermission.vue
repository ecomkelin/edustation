<template>
  <el-alert
    type="warning"
    :closable="false"
    show-icon
    title="无权限访问该看板"
    :description="`需要权限码 ${module}；请在「职位 / 权限」管理中为本岗位勾选该权限。`"
  />
</template>

<script setup>
defineProps({
  module: { type: String, required: true } // 例如 'order.read'
})
</script>
