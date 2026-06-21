<template>
  <div class="classroom-layout">
    <router-view />
  </div>
</template>

<script>
// Classroom Layout（2026-06-21 pet-system-v2-ext）
// 不含 sidebar / header / padding，深色背景，专为投影/大屏设计。
// 通过 route.meta.layout = 'classroom' 触发（见 router/index.js + App.vue）
export default {
  name: 'ClassroomLayout'
}
</script>

<style scoped>
.classroom-layout {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1f1f3d 0%, #2a2a5a 100%);
  color: #fff;
  overflow: hidden;
}
</style>