<!--
  tabs/TabOverview.vue (2026-08-07)
  用户详情「概览」tab: 基本信息 + 机构与职位 + 有效权限
  数据全部来自 R-0217 overview, 不额外请求。
-->
<template>
  <div>
    <el-card class="block" shadow="never">
      <template #header><b>基本信息</b></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="姓名">{{ profile.realName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ profile.mobile }}</el-descriptions-item>
        <el-descriptions-item label="身份证号">
          <span>{{ maskIdCard(profile.idCard) }}</span>
          <el-button
            v-if="profile.idCard"
            link
            type="primary"
            size="small"
            style="margin-left: 6px"
            @click="showIdCard = !showIdCard"
          >
            {{ showIdCard ? '隐藏' : '查看' }}
          </el-button>
        </el-descriptions-item>
        <el-descriptions-item label="现居地">{{ profile.region ? profile.region.name : '—' }}</el-descriptions-item>
        <el-descriptions-item label="账号类型">
          <el-tag v-if="profile.isPlatformAdmin" type="warning" size="small">平台超管</el-tag>
          <span v-else>普通账号</span>
        </el-descriptions-item>
        <el-descriptions-item label="微信绑定">
          <el-tag v-if="profile.wechat && profile.wechat.openIdBound" type="success" size="small">已绑定小程序</el-tag>
          <span v-else style="color: #909399">未绑定</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ fmt(profile.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="最近活跃">
          <span v-if="profile.lastActiveAt">{{ fmt(profile.lastActiveAt) }}</span>
          <span v-else style="color: #909399">从未登录</span>
          <PageHelp title="「最近活跃」是怎么算的？">
            系统没有记录 lastLoginAt, 这里取该账号最近一次签发 refresh token 的时间
            (登录 / 自动续期都会刷新)。会话过期后记录会被自动清理, 所以很久没登录的账号会显示「从未登录」。
          </PageHelp>
        </el-descriptions-item>
        <el-descriptions-item v-if="profile.isBlocked" label="封禁时间">{{ fmt(profile.blockedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="profile.isBlocked" label="封禁原因">{{ profile.blockedReason || '—' }}</el-descriptions-item>
        <el-descriptions-item v-if="profile.requirePasswordChange" label="密码状态" :span="2">
          <el-tag type="info" size="small">待强制改密</el-tag>
          <span class="tip">该账号首次登录时会被强制跳转到改密页, 改密前只能访问 /auth/me 与改密接口。</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="block" shadow="never">
      <template #header>
        <div class="card-head">
          <b>机构与职位</b>
          <span v-if="scope === 'org'" class="tip">仅显示当前机构（跨机构信息需平台超管权限）</span>
        </div>
      </template>
      <el-empty v-if="!orgs.length" :image-size="80">
        <template #description>
          <span>该账号不属于任何机构（游离用户）</span>
        </template>
      </el-empty>
      <el-table v-else :data="orgs" border size="small">
        <el-table-column prop="name" label="机构" min-width="200">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag v-if="row.isMain" type="success" size="small" style="margin-left: 6px">主</el-tag>
            <el-tag v-if="!row.isActive" type="info" size="small" style="margin-left: 6px">机构已停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="职位" min-width="220">
          <template #default="{ row }">
            <el-tag
              v-for="p in row.positions"
              :key="p.id"
              :type="p.clientLevel > 0 ? 'warning' : 'info'"
              style="margin-right: 4px"
            >
              {{ p.name }}<span v-if="p.clientLevel > 0">（L{{ p.clientLevel }} 家长）</span>
            </el-tag>
            <span v-if="!row.positions.length" style="color: #909399">未分配</span>
          </template>
        </el-table-column>
        <el-table-column label="对外名师" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.showAsTeacher" type="success" size="small">是</el-tag>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
        <el-table-column label="加入时间" width="170">
          <template #default="{ row }">{{ fmt(row.joinedAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="block" shadow="never">
      <template #header>
        <div class="card-head">
          <b>有效权限</b>
          <span class="tip">由上方职位聚合得出，排查「他为什么看不到某个菜单」时看这里</span>
        </div>
      </template>
      <el-alert
        v-if="permissions.isPlatformAdmin"
        type="warning"
        :closable="false"
        show-icon
        title="平台超管：拥有全部权限"
        description="超管在 requirePermission 中被短路为 ['*']，不走职位权限码，因此这里不逐条列出。"
      />
      <el-empty v-else-if="!permissions.codes.length" description="未持有任何权限码" :image-size="80" />
      <div v-else>
        <div v-for="g in groupedPermissions" :key="g.key" class="perm-group">
          <div class="perm-group__title">{{ g.label }}<span class="perm-group__count">{{ g.items.length }}</span></div>
          <div class="perm-group__body">
            <el-tooltip
              v-for="it in g.items"
              :key="it.code"
              :content="it.description || it.code"
              placement="top"
            >
              <el-tag class="perm-tag" size="small" effect="plain">{{ it.label }}</el-tag>
            </el-tooltip>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import PageHelp from '@/components/PageHelp.vue'
import { formatDate } from '@/utils/format'
// 直接读 JSON: Vite 原生支持 JSON import; CJS 包装的 permissions.js 在 Rollup
// 静态分析下拿不到具名导出 (同 views/positions/Positions.vue 的做法)
import sharedPermissionsData from '@shared/permissions.json'

const props = defineProps({
  profile: { type: Object, required: true },
  orgs: { type: Array, default: () => [] },
  permissions: { type: Object, default: () => ({ isPlatformAdmin: false, codes: [] }) },
  scope: { type: String, default: 'org' }
})

const showIdCard = ref(false)

/** code -> { groupKey, groupLabel, label, description } */
const permMeta = (() => {
  const out = {}
  for (const g of sharedPermissionsData.groups || []) {
    for (const code of g.permissions || []) {
      const lbl = (g.permissionLabels && g.permissionLabels[code]) || {}
      out[code] = {
        groupKey: g.key,
        groupLabel: g.label,
        label: lbl.label || code,
        description: lbl.description || ''
      }
    }
  }
  return out
})()

/** 把扁平权限码按 permissions.json 的 group 归堆, 保持 JSON 里的原始组顺序 */
const groupedPermissions = computed(() => {
  const buckets = new Map()
  for (const code of props.permissions.codes || []) {
    const meta = permMeta[code] || { groupKey: '_unknown', groupLabel: '未归类', label: code, description: '' }
    if (!buckets.has(meta.groupKey)) {
      buckets.set(meta.groupKey, { key: meta.groupKey, label: meta.groupLabel, items: [] })
    }
    buckets.get(meta.groupKey).items.push({ code, label: meta.label, description: meta.description })
  }
  const order = (sharedPermissionsData.groups || []).map((g) => g.key)
  return [...buckets.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
})

function fmt(d) {
  return d ? formatDate(d) : '—'
}

function maskIdCard(v) {
  if (!v) return '—'
  if (showIdCard.value) return v
  if (v.length <= 8) return v
  return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
}
</script>

<style scoped>
.block { margin-bottom: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; }
.tip { color: #909399; font-size: 12px; font-weight: normal; }
.perm-group { margin-bottom: 14px; }
.perm-group__title { font-size: 13px; color: #606266; font-weight: 600; margin-bottom: 6px; }
.perm-group__count {
  margin-left: 6px;
  color: #c0c4cc;
  font-weight: normal;
}
.perm-group__body { display: flex; flex-wrap: wrap; gap: 6px; }
.perm-tag { cursor: default; }
</style>
