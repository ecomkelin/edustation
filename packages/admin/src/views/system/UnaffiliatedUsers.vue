<template>
  <div class="page">
    <h2>游离用户<PageHelp title="什么是游离用户？">不属于任何机构的账号。常见来源: 用户被所有机构解绑、家长转化失败回滚、首登未激活的家长等。仅平台超管可见。</PageHelp></h2>

    <el-form class="filters" inline @submit.prevent>
      <el-form-item label="关键字">
        <el-input
          v-model="filters.keyword"
          placeholder="姓名/手机号/身份证"
          clearable
          style="width: 220px"
          @keyup.enter="reload"
          @clear="reload"
        />
      </el-form-item>
      <el-form-item label="账号类型">
        <el-select v-model="filters.isPlatformAdmin" style="width: 130px" @change="reload">
          <el-option label="全部" value="all" />
          <el-option label="普通账号" value="false" />
          <el-option label="平台超管" value="true" />
        </el-select>
      </el-form-item>
      <el-form-item label="启用">
        <el-select v-model="filters.isActive" style="width: 110px" @change="reload">
          <el-option label="全部" value="all" />
          <el-option label="是" value="true" />
          <el-option label="否" value="false" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button @click="reload">搜索</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="realName" label="姓名" width="120">
        <template #default="{ row }">
          <el-link type="primary" underline="never" @click="goDetail(row)">
            {{ row.realName || row.mobile }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column prop="mobile" label="手机号" width="140" />
      <el-table-column label="身份证号" width="200">
        <template #default="{ row }">
          <span>{{ maskIdCard(row.idCard) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="地区" width="160">
        <template #default="{ row }">
          <span v-if="row.region">{{ row.region.name }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="账号标记" width="180">
        <template #default="{ row }">
          <el-tag v-if="row.isPlatformAdmin" type="warning" size="small" style="margin-right: 4px">
            平台超管
          </el-tag>
          <el-tag v-if="row.requirePasswordChange" type="info" size="small" style="margin-right: 4px">
            待改密
          </el-tag>
          <span v-if="!row.isPlatformAdmin && !row.requirePasswordChange" style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="黑名单" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.isBlocked" type="danger" size="small">禁用</el-tag>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          <span style="color: #666">{{ formatDate(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="290" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="goDetail(row)">详情</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="warning" @click="openReset(row)">重置密码</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!loading && list.length === 0" class="empty-tip">
      <el-empty description="暂无游离用户" :image-size="100" />
    </div>

    <el-pagination
      v-if="total > 0"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      style="margin-top: 16px"
      @current-change="load"
      @size-change="reload"
    />

    <!-- 2026-08-07: 编辑 / 重置密码弹窗抽成共用组件 (variant=orphan 走 R-0208 / R-0209) -->
    <UserFormDialog
      v-model="dialog"
      mode="edit"
      variant="orphan"
      :user="editingUser"
      @saved="load"
    />

    <ResetPasswordDialog v-model="resetDialog" variant="orphan" :user="resetTarget" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { userApi } from '@/api/user'
import PageHelp from '@/components/PageHelp.vue'
import UserFormDialog from '@/views/users/UserFormDialog.vue'
import ResetPasswordDialog from '@/views/users/ResetPasswordDialog.vue'

const router = useRouter()

const list = ref([])
const loading = ref(false)

// 2026-08-07: 编辑 / 重置密码表单已抽到 users/ 下的共用组件 (详情页也用同一套),
//   这里只留"开哪个弹窗、喂哪一行"。原来的 form / rules / submit / doReset 都搬走了。
const dialog = ref(false)
const editingUser = ref(null)
const resetDialog = ref(false)
const resetTarget = ref(null)

const filters = reactive({
  keyword: '',
  isActive: 'all',
  isPlatformAdmin: 'all'
})
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

function maskIdCard(v) {
  if (!v) return '—'
  if (v.length <= 8) return v
  return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
}

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

// 带 from=unaffiliated: 详情页据此把「返回」指回本页, 并知道走游离态的编辑/改密端点
function goDetail(row) {
  router.push({ path: `/users/${row.id}`, query: { from: 'unaffiliated' } })
}

async function load() {
  loading.value = true
  try {
    const params = {
      keyword: filters.keyword || undefined,
      isActive: filters.isActive,
      isPlatformAdmin: filters.isPlatformAdmin,
      page: page.value,
      pageSize: pageSize.value
    }
    const r = await userApi.listUnaffiliated(params)
    list.value = r.data.items
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function openEdit(row) {
  editingUser.value = row
  dialog.value = true
}

function openReset(row) {
  resetTarget.value = row
  resetDialog.value = true
}

onMounted(load)
</script>

<style scoped>
.page {
  max-width: 100%;
}
.empty-tip {
  padding: 24px 0;
}
</style>
