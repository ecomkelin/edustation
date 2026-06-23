<template>
  <el-card shadow="never" class="ai-preset-panel">
    <template #header>
      <div class="header">
        <span>试试这样问</span>
      </div>
    </template>

    <div class="categories">
      <div
        v-for="cat in categories"
        :key="cat.key"
        class="category"
      >
        <div class="cat-title">
          <el-icon><component :is="cat.icon" /></el-icon>
          <span>{{ cat.title }}</span>
        </div>
        <div class="suggestions">
          <el-button
            v-for="(q, idx) in cat.questions"
            :key="idx"
            size="small"
            round
            plain
            @click="$emit('pick', q)"
          >
            {{ q }}
          </el-button>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import {
  Promotion,
  User,
  Calendar,
  ShoppingCart,
  Bell,
  Sunny
} from '@element-plus/icons-vue'

defineEmits(['pick'])

const categories = [
  // 2026-06-23: 今日工作台 (新加在最前面, 业务高频入口)
  {
    key: 'today',
    title: '今日工作台',
    icon: Sunny,
    questions: [
      '今天有哪些已经预约要来学校体验的',
      '今天需要哪些老师来学校',
      '有哪些考虑中的家长要沟通的',
      '有哪些潜客家长需要跟进沟通了',
      '今天有哪些课要上 哪个老师 哪些学生',
      '有哪些学生课包不足，需要续费的',
      '哪些学生的宠物快饿死了',
      '哪些学生的积分快没了'
    ]
  },
  {
    key: 'recruit',
    title: '招生试听',
    icon: Promotion,
    questions: [
      '查一下本周新登记的家长',
      '录入一个家长 13800000000，孩子叫小明 8 岁，试听钢琴',
      '给这批家长排明天上午 10 点的试听课',
      '标记某条试听已完成并确认报名'
    ]
  },
  {
    key: 'student',
    title: '学员管理',
    icon: User,
    questions: [
      '查所有在读学员',
      '查学员李明的详细档案',
      '创建新学员张三，监护人 13900000000'
    ]
  },
  {
    key: 'schedule',
    title: '排课考勤',
    icon: Calendar,
    questions: [
      '查看本周排课',
      '查老师张三的课表',
      '标完成今天的考勤'
    ]
  },
  {
    key: 'order',
    title: '订单课包',
    icon: ShoppingCart,
    questions: [
      '查小明的订单',
      '给小明报钢琴 48 节课',
      '支付订单 XXX'
    ]
  }
]
</script>

<style scoped>
/* 2026-06: 挪到右侧面板, 间距由父 .right-col gap 控制, 这里只去掉自身 margin */
.ai-preset-panel { margin-bottom: 0 !important; }
.header { font-weight: 600; }
.categories { display: flex; flex-direction: column; gap: 10px; }
.cat-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}
.suggestions { display: flex; flex-wrap: wrap; gap: 4px; }
.suggestions :deep(.el-button) {
  padding: 4px 10px;
  font-size: 12px;
}
</style>