<!--
  tabs/TabSecurity.vue (2026-08-07)

  用户详情「安全与审计」tab —— 仅平台超管可见 (父组件按 scope 控制是否渲染)。
  会话 / 审计两张表没有 org 维度, 天然跨机构, 所以后端对非超管直接 403。
-->
<template>
  <div>
    <RelatedSection
      :user-id="userId"
      domain="sessions"
      title="登录会话"
      empty-text="该账号当前没有会话记录"
    >
      <template #columns>
        <el-table-column label="设备 / 浏览器" min-width="240">
          <template #default="{ row }">
            <span>{{ uaBrief(row.userAgent) }}</span>
            <el-tooltip v-if="row.userAgent" :content="row.userAgent" placement="top">
              <el-icon class="ua-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="IP" width="140">
          <template #default="{ row }">{{ row.ip || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.isRevoked" type="info" size="small">已撤销</el-tag>
            <el-tag v-else-if="row.isExpired" type="info" size="small">已过期</el-tag>
            <el-tag v-else type="success" size="small">活跃</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="签发时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="过期时间" width="170">
          <template #default="{ row }">{{ fmt(row.expiresAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="note"
      title="关于会话列表"
      description="这是「当前会话」不是登录历史 —— refresh token 表带 TTL 索引，过期记录会被 MongoDB 自动清理。同一次登录后续的自动续期会共享同一个会话族（familyId）。"
    />

    <RelatedSection
      :user-id="userId"
      domain="audit"
      title="操作审计（最近在前）"
      empty-text="该账号没有留下操作记录"
    >
      <template #columns>
        <el-table-column label="方法" width="80">
          <template #default="{ row }">
            <el-tag :type="METHOD_TAG[row.method] || 'info'" size="small">{{ row.method }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="路径" min-width="280">
          <template #default="{ row }"><span class="mono">{{ row.path }}</span></template>
        </el-table-column>
        <el-table-column label="状态码" width="90">
          <template #default="{ row }">
            <span :class="{ bad: row.statusCode >= 400 }">{{ row.statusCode }}</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="90" align="right">
          <template #default="{ row }">{{ row.durationMs != null ? `${row.durationMs} ms` : '—' }}</template>
        </el-table-column>
        <el-table-column label="机构" min-width="140">
          <template #default="{ row }">{{ row.org ? row.org.name : '—' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <div class="more">
      <el-button link type="primary" @click="goAudit">在「操作留痕」页查看该用户的完整日志 →</el-button>
    </div>

    <RelatedSection
      :user-id="userId"
      domain="consents"
      title="协议签署"
      empty-text="该账号没有签署记录"
    >
      <template #columns>
        <el-table-column label="协议" min-width="220">
          <template #default="{ row }">{{ row.title || row.docKey }}</template>
        </el-table-column>
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag :type="row.docType === 'platform' ? 'warning' : 'info'" size="small">
              {{ row.docType === 'platform' ? '平台' : '机构' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="版本" width="90">
          <template #default="{ row }">{{ row.version }}</template>
        </el-table-column>
        <el-table-column label="主体" width="110">
          <template #default="{ row }">{{ SUBJECT_TYPE_LABEL[row.subjectType] || row.subjectType }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.withdrawAt" type="danger" size="small">已撤回</el-tag>
            <el-tag v-else type="success" size="small">有效</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="签署时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { InfoFilled } from '@element-plus/icons-vue'
import RelatedSection from './RelatedSection.vue'
import { formatDate } from '@/utils/format'

const props = defineProps({
  userId: { type: String, required: true }
})

const router = useRouter()

const METHOD_TAG = { GET: 'info', POST: 'success', PUT: 'warning', PATCH: 'warning', DELETE: 'danger' }
const SUBJECT_TYPE_LABEL = {
  user: '本人',
  student: '学员',
  authorized_pickup: '接送人',
  staff: '员工'
}

function fmt(d) {
  return d ? formatDate(d) : '—'
}

/** UA 太长, 表格里只显示"浏览器 + 系统"两段, 完整串挂 tooltip */
function uaBrief(ua) {
  if (!ua) return '—'
  const browser =
    /Edg\/[\d.]+/.exec(ua)?.[0] ||
    /Chrome\/[\d.]+/.exec(ua)?.[0] ||
    /Firefox\/[\d.]+/.exec(ua)?.[0] ||
    /Safari\/[\d.]+/.exec(ua)?.[0] ||
    /MicroMessenger\/[\d.]+/.exec(ua)?.[0] ||
    ''
  const os =
    (/Windows NT [\d.]+/.exec(ua)?.[0]) ||
    (/Mac OS X [\d_]+/.exec(ua)?.[0]) ||
    (/Android [\d.]+/.exec(ua)?.[0]) ||
    (/iPhone OS [\d_]+/.exec(ua)?.[0]) ||
    ''
  const brief = [browser, os].filter(Boolean).join(' · ')
  return brief || ua.slice(0, 40)
}

function goAudit() {
  router.push({ path: '/system/audit-logs', query: { userId: props.userId } })
}
</script>

<style scoped>
.note { margin: -6px 0 16px; }
.more { margin: -8px 0 16px; text-align: right; }
.mono { font-family: monospace; font-size: 12px; color: #606266; }
.bad { color: #f56c6c; font-weight: 600; }
.ua-icon { margin-left: 4px; color: #c0c4cc; vertical-align: middle; }
</style>
