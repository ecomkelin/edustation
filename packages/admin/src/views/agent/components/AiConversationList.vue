<template>
  <el-card shadow="never" class="ai-conv-list-card">
    <template #header>
      <div class="header">
        <span>会话记录</span>
        <el-button
          size="small"
          type="primary"
          plain
          :disabled="isStreaming"
          @click="onNewConversation"
        >
          <el-icon><Plus /></el-icon>
          <span>新会话</span>
        </el-button>
      </div>
    </template>

    <!-- (2026-06-18) 30 上限提示: 仅当 activeCount >= maxAllowed 时显示红字 -->
    <div v-if="activeCount >= maxAllowed" class="limit-tip">
      已达会话上限 ({{ activeCount }}/{{ maxAllowed }}), 请先删除一些旧会话
    </div>

    <div v-if="loading" class="state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>

    <div v-else-if="items.length === 0" class="state">
      <span>暂无会话, 点右上角"新会话"开始</span>
    </div>

    <div v-else class="list">
      <div
        v-for="c in items"
        :key="c._id"
        class="item"
        :class="{ active: c._id === activeId, pinned: c.isPinned }"
        @click="onPick(c)"
      >
        <div class="item-title">
          <el-icon
            v-if="c.isPinned"
            class="pin-icon"
            style="vertical-align: middle"
            :title="'已置顶'"
          ><StarFilled /></el-icon>
          <el-icon v-else style="vertical-align: middle"><ChatLineRound /></el-icon>
          <span class="title-text" :title="c.title">{{ c.title || '新会话' }}</span>
        </div>
        <div v-if="c.summary" class="item-summary" :title="c.summary">{{ c.summary }}</div>
        <div class="item-meta">
          <span>{{ formatTime(c.lastMessageAt || c.createdAt) }}</span>
          <span v-if="c.userMessageCount"> · {{ c.userMessageCount }} 轮</span>
        </div>
        <!-- (2026-06-18) 三点菜单: 自实现 popover -->
        <div class="more-wrap" @click.stop>
          <span
            class="more-btn"
            :class="{ disabled: isStreaming }"
            role="button"
            tabindex="0"
            :aria-disabled="isStreaming"
            @click.stop="toggleMenu(c._id, $event)"
          >
            <el-icon><MoreFilled /></el-icon>
          </span>
        </div>
      </div>
    </div>
  </el-card>

  <!-- (2026-06-18) 全局菜单: Teleport 到 body, 避免被 list 的 overflow 裁切 / 兄弟 item 覆盖 -->
  <!-- scoped 样式作用不到 Teleport 出的 DOM, 故用 data-conv-menu 标记, style 走 :global -->
  <Teleport to="body">
    <ul
      v-if="openMenuId && openMenuConv"
      class="conv-menu-fixed"
      :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px' }"
      @click.stop
    >
      <!-- (2026-06-18 修) 之前写死传 'pin', 取消置顶也被当成置顶, 反向操作. 改为传 toggle, onCommand 内根据当前状态翻转 -->
      <li class="conv-menu-item" @click="onMenuClick(openMenuConv.isPinned ? 'unpin' : 'pin', openMenuConv)">
        <el-icon><component :is="openMenuConv.isPinned ? StarFilled : Star" /></el-icon>
        <span>{{ openMenuConv.isPinned ? '取消置顶' : '置顶' }}</span>
      </li>
      <li class="conv-menu-item" @click="onMenuClick('rename', openMenuConv)">
        <el-icon><Edit /></el-icon><span>重命名</span>
      </li>
      <li class="conv-menu-item danger" @click="onMenuClick('delete', openMenuConv)">
        <el-icon><Delete /></el-icon><span>删除</span>
      </li>
    </ul>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  ChatLineRound,
  MoreFilled,
  Edit,
  Delete,
  // (2026-06-18) 置顶: Star(空心) / StarFilled(实心)
  Star,
  StarFilled,
  Loading
} from '@element-plus/icons-vue'
import { agentApi } from '@/api/agent'

const props = defineProps({
  activeId: { type: String, default: '' },
  isStreaming: { type: Boolean, default: false },
  // (2026-06-18) 上限 (父组件透传, 后端权威)
  activeCount: { type: Number, default: 0 },
  maxAllowed: { type: Number, default: 30 }
})
const emit = defineEmits(['pick', 'new', 'limit'])

const items = ref([])
const loading = ref(false)
// (2026-06-18) 自实现 popover: 哪个会话的菜单展开
const openMenuId = ref('')
// (2026-06-18) 菜单定位 + 当前操作的会话
const menuPos = ref({ top: 0, left: 0 })
const openMenuConv = ref(null)

function toggleMenu(id, ev) {
  if (props.isStreaming) return
  if (openMenuId.value === id) {
    openMenuId.value = ''
    openMenuConv.value = null
    return
  }
  // 拿到按钮的屏幕位置, 菜单贴在按钮下方
  const btn = ev.currentTarget
  const rect = btn.getBoundingClientRect()
  // 菜单宽 120px, 右对齐按钮, top 在按钮底 + 4px
  menuPos.value = {
    top: rect.bottom + 4,
    left: rect.right - 120
  }
  openMenuConv.value = items.value.find((x) => x._id === id) || null
  openMenuId.value = id
}
function closeMenu() {
  openMenuId.value = ''
  openMenuConv.value = null
}
async function onMenuClick(cmd, c) {
  openMenuId.value = ''
  openMenuConv.value = null
  await onCommand(cmd, c)
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function load() {
  loading.value = true
  try {
    const res = await agentApi.listConversations({ limit: 50 })
    items.value = res.data?.items || []
    // (2026-06-18) 透传上限信息给父组件
    emit('limit', {
      activeCount: res.data?.activeCount || 0,
      maxAllowed: res.data?.maxAllowed || 30
    })
  } catch (e) {
    ElMessage.error('加载会话列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

function onPick(c) {
  if (props.isStreaming) {
    ElMessage.warning('AI 正在生成中, 请稍后再切换')
    return
  }
  emit('pick', c)
}

function onNewConversation() {
  if (props.isStreaming) {
    ElMessage.warning('AI 正在生成中, 请稍后再切换')
    return
  }
  emit('new')
}

async function onCommand(cmd, c) {
  if (cmd === 'pin' || cmd === 'unpin') {
    try {
      const next = cmd === 'pin'
      await agentApi.patchConversation(c._id, { isPinned: next })
      c.isPinned = next
      // 重排: 置顶的放最前 (与后端 list 排序保持一致, 重新拉一次最稳)
      await load()
      ElMessage.success(next ? '已置顶' : '已取消置顶')
    } catch (e) {
      ElMessage.error('置顶失败: ' + (e?.message || e))
    }
  } else if (cmd === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt('修改会话标题', '重命名', {
        inputValue: c.title || '',
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValidator: (v) => (v && v.trim() ? true : '标题不能为空')
      })
      await agentApi.patchConversation(c._id, { title: value.trim() })
      c.title = value.trim()
      ElMessage.success('已修改')
    } catch (e) {
      if (e !== 'cancel' && e !== 'close') {
        ElMessage.error('修改失败: ' + (e?.message || e))
      }
    }
  } else if (cmd === 'delete') {
    try {
      await ElMessageBox.confirm(
        `确定删除会话"${c.title}"? 会话和聊天记录会被移入回收站 (30 天内超管可恢复)。`,
        '删除会话',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      )
      await agentApi.deleteConversation(c._id)
      items.value = items.value.filter((x) => x._id !== c._id)
      if (c._id === props.activeId) {
        emit('new') // 删的是当前会话 → 自动开新会话
      }
      // (2026-06-18) 通知父组件刷新上限
      emit('limit', { activeCount: items.value.length, maxAllowed: props.maxAllowed })
      ElMessage.success('已删除')
    } catch (e) {
      if (e !== 'cancel' && e !== 'close') {
        ElMessage.error('删除失败: ' + (e?.message || e))
      }
    }
  }
}

defineExpose({ reload: load })

onMounted(() => {
  load()
  // (2026-06-18) 自实现 popover: 点空白处关闭菜单
  document.addEventListener('click', closeMenu)
  // (2026-06-18) 滚动 / 窗口变化时关菜单 (按钮位置变了, fixed 菜单不会跟)
  window.addEventListener('scroll', closeMenu, true)
  window.addEventListener('resize', closeMenu)
})
onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  window.removeEventListener('scroll', closeMenu, true)
  window.removeEventListener('resize', closeMenu)
})
</script>

<style scoped>
.ai-conv-list-card { display: flex; flex-direction: column; gap: 8px; }

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* (2026-06-18) 30 上限提示 */
.limit-tip {
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  color: #f56c6c;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 4px;
  line-height: 1.5;
}

.state {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px 8px;
  font-size: 13px;
  color: #909399;
  justify-content: center;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}

.item {
  position: relative;
  padding: 8px 36px 8px 10px;  /* 右侧留出空间给三点按钮, 避免标题被覆盖 */
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
}
.item:hover { background: #f5f7fa; }
.item.active {
  background: #ecf5ff;
  border-color: #b3d8ff;
}
.item.active .title-text { color: #409eff; font-weight: 600; }

/* (2026-06-18) 置顶的会话: 左边描金边, 标题前显星标 */
.item.pinned {
  background: #fdf6ec;
  border-color: #faecd8;
}
.item.pinned.active {
  background: #ecf5ff;
  border-color: #b3d8ff;
}
.pin-icon {
  color: #e6a23c;
}

.item-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #303133;
}
.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.item-summary {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.item-meta {
  margin-top: 4px;
  font-size: 11px;
  color: #c0c4cc;
}

/* (2026-06-18) 三点按钮容器: 用 absolute 定位, 内部包按钮 + 自实现 popover */
.more-wrap {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
}

.more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  border-radius: 4px;
  color: #606266;
  background: transparent;
  transition: background 0.15s, color 0.15s;
  user-select: none;
}
.more-btn .el-icon {
  font-size: 16px;
  line-height: 1;
}
.more-btn:hover {
  background: #ecf5ff;
  color: #409eff;
}
.more-btn.disabled {
  cursor: not-allowed;
  opacity: 0.5;
  pointer-events: none;
}

/* item hover 时, 三点也变深, 给视觉提示 */
.item:hover .more-btn {
  color: #303133;
}
.item.active .more-btn {
  color: #409eff;
}

/* (2026-06-18) 自实现 popover: 摆脱 el-dropdown, 100% 受 scoped 样式控制 */
.conv-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  min-width: 120px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

/* (2026-06-18) 浮层菜单: 样式放在文件末尾的 <style> (非 scoped) 块, 因为 Teleport 到 body 后 scoped 哈希丢失 */
</style>

<!-- (2026-06-18) 浮层菜单样式: 非 scoped, Teleport 到 body 后仍能命中 -->
<style>
.conv-menu-fixed {
  position: fixed;
  z-index: 9999;
  min-width: 120px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.conv-menu-fixed .conv-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.2;
  color: #303133;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.conv-menu-fixed .conv-menu-item:hover {
  background: #f5f7fa;
  color: #409eff;
}
.conv-menu-fixed .conv-menu-item.danger {
  color: #f56c6c;
}
.conv-menu-fixed .conv-menu-item.danger:hover {
  background: #fef0f0;
  color: #f56c6c;
}
.conv-menu-fixed .conv-menu-item .el-icon {
  font-size: 14px;
}
.conv-menu-fixed .conv-menu-item:not(:last-child) {
  border-bottom: 1px solid #f5f7fa;
}
</style>
