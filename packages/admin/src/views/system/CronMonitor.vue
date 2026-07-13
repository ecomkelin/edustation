<template>
  <div class="page">
    <h2>定时任务监控</h2>
    <p class="subtitle">
      整个 server 进程内所有 <code>setInterval</code> 定时任务的实时状态、累计运行情况、
      以及每条 cron 的业务用途与失败影响。排查「任务没提醒 / 通知没发 / 数据没归档」时先来这里看。
    </p>

    <el-alert
      type="info"
      :closable="false"
      title="仅平台超管可访问"
      description="本页读 / 触发 后端 /admin/cron/* 接口 (R-4101 实时状态 / R-4102 手动 trigger / R-4103 历史流水, MM=41), 全部走 requirePlatformAdmin 中间件。手动 trigger 绕过 leader 锁, 调试用 — 上线运营请慎用。"
      show-icon
      class="mb"
    />

    <el-tabs v-model="activeTab" class="mb">
      <!-- ====== Tab 1: 实时状态 ====== -->
      <el-tab-pane label="实时状态" name="status">
        <!-- 1) 顶部总览: 副本数 / uptime / 实时锁 -->
    <el-row :gutter="16" class="mb" v-loading="loading">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-label">当前副本 PID</div>
          <div class="stat-value">{{ data?.pid ?? '-' }}</div>
          <div class="stat-sub">
            <el-tag v-if="data?.nodeEnv" size="small" type="info">{{ data.nodeEnv }}</el-tag>
            <span class="ml">uptime {{ formatUptime(data?.uptimeSec) }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-label">已注册 cron</div>
          <div class="stat-value">{{ data?.cronCount ?? 0 }}</div>
          <div class="stat-sub">个 setInterval</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-label">在线副本</div>
          <div class="stat-value">
            {{ data?.replicas?.length ?? 0 }}
            <el-tag
              v-if="healthyReplicaCount < (data?.replicas?.length ?? 0)"
              type="danger"
              size="small"
              class="ml"
            >
              {{ (data?.replicas?.length ?? 0) - healthyReplicaCount }} 心跳超时
            </el-tag>
          </div>
          <div class="stat-sub">心跳 30s 一次, TTL 120s</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-label">leader 锁</div>
          <div class="stat-value">{{ data?.cronLocks?.length ?? 0 }}</div>
          <div class="stat-sub">
            <span v-if="selfLockCount">(本副本持有 {{ selfLockCount }})</span>
            <span v-else>当前无副本抢占</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 2) cron 列表: 实时状态 + 手动 trigger -->
    <el-card class="mb" v-loading="loading">
      <template #header>
        <div class="card-header">
          <b>定时任务列表</b>
          <div>
            <el-button text @click="load" :loading="loading">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
            <el-tag size="small" type="info" class="ml">每 10s 自动刷新</el-tag>
          </div>
        </div>
      </template>

      <el-table :data="cronRows" stripe>
        <el-table-column label="cron 名" min-width="160">
          <template #default="{ row }">
            <code class="cron-name">{{ row.name }}</code>
          </template>
        </el-table-column>
        <el-table-column label="周期" width="80">
          <template #default="{ row }">
            <el-tag size="small">{{ row.intervalHuman }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="leader 锁" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.leaderElect" size="small" type="warning">需抢锁</el-tag>
            <el-tag v-else size="small" type="info">纯幂等</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上次跑" width="150">
          <template #default="{ row }">
            <span v-if="row.lastRunAt">{{ formatRelative(row.lastRunAt) }}</span>
            <span v-else class="muted">未跑过</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="80">
          <template #default="{ row }">
            <span v-if="row.lastDurationMs != null">{{ row.lastDurationMs }}ms</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="累计" width="180">
          <template #default="{ row }">
            <el-tooltip
              :content="`手动 trigger 次数: ${row.totalManualTicks}`"
              placement="top"
            >
              <span>
                ticks <b>{{ row.totalTicks }}</b>
                <span v-if="row.totalSkipped > 0" class="ml muted">
                  skipped {{ row.totalSkipped }}
                </span>
                <span v-if="row.totalErrors > 0" class="ml error-text">
                  errs {{ row.totalErrors }}
                </span>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="最近错误" min-width="180">
          <template #default="{ row }">
            <span v-if="row.lastError" class="error-text" :title="row.lastError">
              {{ truncate(row.lastError, 50) }}
            </span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="手动触发" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              :loading="ticking[row.name]"
              :disabled="!!row.manualTickInFlight"
              @click="onTick(row)"
            >
              <el-icon><VideoPlay /></el-icon>
              <span v-if="row.manualTickInFlight">
                别人在跑 ({{ row.manualTickInFlight.by }})
              </span>
              <span v-else>立即跑一次</span>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 3) 详细说明: 每条 cron 业务含义 + 失败影响 -->
    <el-card class="mb">
      <template #header><b>每条 cron 详细说明</b></template>
      <el-collapse v-model="activeDocs" accordion>
        <el-collapse-item
          v-for="doc in CRON_DOCS"
          :key="doc.name"
          :name="doc.name"
        >
          <template #title>
            <div class="doc-title">
              <code class="cron-name">{{ doc.name }}</code>
              <el-tag size="small" class="ml">{{ doc.intervalHuman }}</el-tag>
              <el-tag v-if="doc.leaderElect" size="small" type="warning" class="ml">多副本抢锁</el-tag>
              <span class="doc-purpose ml">{{ doc.purpose }}</span>
            </div>
          </template>
          <div class="doc-body">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="做什么">
                <div v-for="(line, i) in doc.what" :key="i" class="doc-line">{{ line }}</div>
              </el-descriptions-item>
              <el-descriptions-item label="数据来源">
                <span v-for="(s, i) in doc.sources" :key="i">
                  <code>{{ s }}</code>
                  <span v-if="i < doc.sources.length - 1">, </span>
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="失败影响">
                <el-tag
                  :type="doc.failureLevel === 'high' ? 'danger' : doc.failureLevel === 'medium' ? 'warning' : 'info'"
                  size="small"
                >
                  {{ failureLabel(doc.failureLevel) }}
                </el-tag>
                <span class="ml">{{ doc.failure }}</span>
              </el-descriptions-item>
              <el-descriptions-item v-if="doc.thresholds" label="关键阈值">
                <ul class="thresholds">
                  <li v-for="t in doc.thresholds" :key="t.label">
                    <code>{{ t.label }}</code>: {{ t.value }}
                  </li>
                </ul>
              </el-descriptions-item>
              <el-descriptions-item label="K8s 丢 tick 风险">
                <span v-if="doc.k8sNote">{{ doc.k8sNote }}</span>
                <span v-else class="muted">丢 1 个 tick 最多延迟一个周期, 下次自然补</span>
              </el-descriptions-item>
              <el-descriptions-item label="源码位置">
                <code>{{ doc.file }}</code>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- 4) 副本视图 + leader 锁视图 -->
    <el-row :gutter="16" class="mb">
      <el-col :span="12">
        <el-card v-loading="loading">
          <template #header>
            <b>在线副本 ({{ data?.replicas?.length ?? 0 }})</b>
          </template>
          <el-table :data="data?.replicas || []" stripe size="small">
            <el-table-column label="PID" prop="pid" width="120">
              <template #default="{ row }">
                <code>{{ row.pid }}</code>
                <el-tag v-if="row.isSelf" size="small" type="success" class="ml">本副本</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="主机" prop="hostname" width="120" />
            <el-table-column label="环境" prop="nodeEnv" width="100" />
            <el-table-column label="上次心跳">
              <template #default="{ row }">
                <span :class="{ 'error-text': row.secondsSinceHeartbeat > 60 }">
                  {{ row.secondsSinceHeartbeat }}s 前
                </span>
              </template>
            </el-table-column>
            <el-table-column label="启动于" width="170">
              <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card v-loading="loading">
          <template #header>
            <b>当前 leader 锁 ({{ data?.cronLocks?.length ?? 0 }})</b>
          </template>
          <el-empty v-if="!data?.cronLocks?.length" description="当前无副本抢占 (单副本部署 / 还没到 tick 时刻)" :image-size="60" />
          <el-table v-else :data="data?.cronLocks || []" stripe size="small">
            <el-table-column label="cron 名" prop="name" width="140">
              <template #default="{ row }">
                <code>{{ row.name }}</code>
                <el-tag v-if="row.isSelf" size="small" type="success" class="ml">本副本</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="持有者 PID" prop="owner" width="120">
              <template #default="{ row }"><code>{{ row.owner }}</code></template>
            </el-table-column>
            <el-table-column label="剩余有效期">
              <template #default="{ row }">
                <span :class="{ 'error-text': row.expiresInSec < 0 }">
                  {{ row.expiresInSec }}s
                </span>
                <span v-if="row.expiresInSec < 0" class="muted ml">(已过期, 下次 tick 会被抢走)</span>
              </template>
            </el-table-column>
            <el-table-column label="抢锁于" width="170">
              <template #default="{ row }">{{ formatTime(row.acquiredAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 5) 排查提示 -->
    <el-card>
      <template #header><b>常见排查</b></template>
      <el-collapse>
        <el-collapse-item title="cron 没按预期跑?" name="a">
          <ol class="checklist">
            <li>看「上次跑」列, 如果一直是「未跑过」, 说明 server 进程还没起 cron (启动 12h 内 archiveCron 不会跑) 或进程刚挂掉。</li>
            <li>看「最近错误」, 有 stack trace 直接贴去查源码。</li>
            <li>看 leader 锁: 多副本部署时, 只有持锁的副本会跑。如果锁一直被别人握着 (别人的副本在跑), 自己副本的 totalTicks 永远是 0, 这是正常的, 不是 bug。</li>
            <li>点击「立即跑一次」, 看返回值 result; 409 表示有人正在跑 (进程内互斥), 等一会儿再试。</li>
          </ol>
        </el-collapse-item>
        <el-collapse-item title="多副本时 taskCron/notificationCron/petCron 重复跑?" name="b">
          <p>
            不会。这 3 个 cron 都开了 <code>leaderElect: true</code> (mongo 分布式锁), 同一个 tick 时刻只有 1 个副本能抢到锁并执行,
            其他副本会跳过并 <code>skipped++</code>。要看锁持有情况看下方「当前 leader 锁」表格。
          </p>
        </el-collapse-item>
        <el-collapse-item title="某个副本心跳超时?" name="c">
          <p>
            心跳 30s 一次, TTL 120s。某个副本 60s+ 没心跳说明它可能僵死或网络断。超过 120s 它在 <code>replica_status</code> collection 会被 mongo 自动清掉, 它的 leader 锁也会因为 TTL 过期被其他副本抢走。
          </p>
        </el-collapse-item>
      </el-collapse>
    </el-card>
      </el-tab-pane>

      <!-- ====== Tab 2: 历史流水 (R-4103) ====== -->
      <el-tab-pane label="历史流水" name="ticks">
        <el-card>
          <template #header>
            <div class="card-header">
              <b>cron_tick_logs 历史流水</b>
              <div class="muted" style="font-size: 12px;">
                TTL 30 天, 自动清理。每条记录一次 cron tick (auto / manual / skip)
              </div>
            </div>
          </template>

          <!-- 过滤器 -->
          <el-form :inline="true" :model="tickFilter" size="small" class="mb">
            <el-form-item label="cron 名">
              <el-select v-model="tickFilter.name" clearable placeholder="全部" style="width: 160px">
                <el-option label="taskCron" value="taskCron" />
                <el-option label="archiveCron" value="archiveCron" />
                <el-option label="notificationCron" value="notificationCron" />
                <el-option label="petCron" value="petCron" />
                <el-option label="loginRateLimitSweep" value="loginRateLimitSweep" />
                <el-option label="captchaSweep" value="captchaSweep" />
              </el-select>
            </el-form-item>
            <el-form-item label="来源">
              <el-select v-model="tickFilter.source" clearable placeholder="全部" style="width: 110px">
                <el-option label="auto" value="auto" />
                <el-option label="manual" value="manual" />
                <el-option label="skip" value="skip" />
              </el-select>
            </el-form-item>
            <el-form-item label="结果">
              <el-select v-model="tickFilter.ok" clearable placeholder="全部" style="width: 100px">
                <el-option label="成功" :value="true" />
                <el-option label="失败" :value="false" />
              </el-select>
            </el-form-item>
            <el-form-item label="起始">
              <el-date-picker
                v-model="tickFilter.from"
                type="datetime"
                placeholder="开始时间"
                value-format="YYYY-MM-DDTHH:mm:ss[Z]"
                style="width: 200px"
              />
            </el-form-item>
            <el-form-item label="结束">
              <el-date-picker
                v-model="tickFilter.to"
                type="datetime"
                placeholder="结束时间"
                value-format="YYYY-MM-DDTHH:mm:ss[Z]"
                style="width: 200px"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="onTickSearch" :loading="tickLoading">查询</el-button>
              <el-button @click="onTickReset">重置</el-button>
              <el-tag size="small" type="info" class="ml">共 {{ tickTotal }} 条</el-tag>
            </el-form-item>
          </el-form>

          <el-table :data="tickItems" stripe v-loading="tickLoading" empty-text="暂无流水">
            <el-table-column label="开始时间" width="170">
              <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
            </el-table-column>
            <el-table-column label="cron 名" width="180">
              <template #default="{ row }">
                <code class="cron-name">{{ row.name }}</code>
              </template>
            </el-table-column>
            <el-table-column label="来源" width="90">
              <template #default="{ row }">
                <el-tag
                  :type="row.source === 'manual' ? 'warning' : row.source === 'skip' ? 'info' : 'success'"
                  size="small"
                >
                  {{ row.source }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="结果" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.ok" type="success" size="small">成功</el-tag>
                <el-tag v-else type="danger" size="small">失败</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="80">
              <template #default="{ row }">
                <span v-if="row.durationMs != null">{{ row.durationMs }}ms</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="业务 stats" min-width="200">
              <template #default="{ row }">
                <code v-if="row.stats" class="stats-json">{{ formatStats(row.stats) }}</code>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="调用人 / PID" width="220">
              <template #default="{ row }">
                <span v-if="row.triggeredBy" class="muted">{{ row.triggeredBy }}</span>
                <span v-else class="muted">pid {{ row.pid }}</span>
              </template>
            </el-table-column>
            <el-table-column label="错误" min-width="220">
              <template #default="{ row }">
                <span v-if="row.error" class="error-text" :title="row.error">
                  {{ truncate(row.error, 60) }}
                </span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="tickFilter.page"
            v-model:page-size="tickFilter.pageSize"
            :total="tickTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            class="mt"
            @current-change="loadTicks"
            @size-change="loadTicks"
          />
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, VideoPlay } from '@element-plus/icons-vue'
import { cronApi } from '@/api/cron'

const data = ref(null)
const loading = ref(false)
const ticking = reactive({})
const activeDocs = ref(['taskCron']) // 默认展开第 1 条
const activeTab = ref('status') // 'status' | 'ticks'

// 历史流水 (R-4103) 状态
const tickItems = ref([])
const tickTotal = ref(0)
const tickLoading = ref(false)
const tickFilter = reactive({
  name: '',
  source: '',
  ok: '',
  from: '',
  to: '',
  page: 1,
  pageSize: 20
})

let timer = null
let tickTimer = null

// 6 条 cron 业务详细说明 (2026-07-13 MM=41)
// 字段:
//   name / intervalHuman / leaderElect / purpose — 顶部摘要
//   what / sources / failure / failureLevel / thresholds / k8sNote / file — 详细
const CRON_DOCS = [
  {
    name: 'taskCron',
    intervalHuman: '1min',
    leaderElect: true,
    purpose: '员工任务: 过期扫描 + 周期任务生成 + 到期通知',
    what: [
      '1) 调 taskService.expireOverdue() — 把 dueAt < now 且非终态 (approved/cancelled/expired) 的任务标 expired',
      '2) 调 taskService.notifyDueToday() — 找出今天 dueAt 到期的任务, 给 assignee / supervisor / creator 发 task_due 通知 (v0.9 通知系统)',
      '3) 找 TaskTemplate { isActive: true, nextRunAt ≤ now }, 对每个调 generateFromTemplate — 按模板批量生成任务实例'
    ],
    sources: ['Task', 'TaskTemplate', 'Notification'],
    failure: '任务不按时过期 / 周期任务不按时生成 / 用户收不到 task_due 提醒',
    failureLevel: 'medium',
    thresholds: [
      { label: 'TICK_INTERVAL_MS', value: '60_000 (1 分钟)' }
    ],
    k8sNote: 'expireOverdue 用 dueAt < now 兜底, generateFromTemplate 按 nextRunAt 触发, 都不会丢 (下次 tick 自然补)',
    file: 'packages/server/src/modules/task/taskCron.js'
  },
  {
    name: 'archiveCron',
    intervalHuman: '12h',
    leaderElect: false,
    purpose: '自动归档: 老 Task / StudentWork / LessonAttendance 软隐藏',
    what: [
      '1) Task: status ∈ {approved, cancelled, expired} && dueAt < now-90d → archived',
      '2) StudentWork: createdAt < now-365d → archived (作品生命周期短, 1 年足够)',
      '3) LessonAttendance: 关联 LessonSchedule.status=archived 且 actualEndTime < now-90d → archived',
      'auto-archive 的 archivedBy=null 与人工归档 (actor.userId) 区分'
    ],
    sources: ['Task', 'StudentWork', 'LessonAttendance', 'LessonSchedule'],
    failure: '老数据没自动归档, 列表/看板/统计变慢 (但业务上仍可访问)',
    failureLevel: 'low',
    thresholds: [
      { label: 'TASK_ARCHIVE_DAYS', value: '90' },
      { label: 'STUDENTWORK_ARCHIVE_DAYS', value: '365' },
      { label: 'ATTENDANCE_ARCHIVE_DAYS', value: '90' },
      { label: 'TICK_INTERVAL_MS', value: '12 * 3600_000 (12 小时)' }
    ],
    file: 'packages/server/src/modules/common/archiveCron.js'
  },
  {
    name: 'notificationCron',
    intervalHuman: '5min',
    leaderElect: true,
    purpose: '通知 inbox 推送: 把到点的 scheduledFor 通知分发到渠道',
    what: [
      '扫 Notification { status: pending, scheduledFor ≤ now, channels 中有未派发的 }',
      '按用户偏好 (notificationPreferences) + 渠道能力 (微信/短信/App) 调 dispatch',
      'limit=100/tick 防止一次扫到太多 (server 重启后积压)',
      '单条 dispatch 失败不阻塞其余'
    ],
    sources: ['Notification', 'NotificationPreference'],
    failure: '用户在课程前 1h / 任务到期时收不到提醒 (关键提醒丢 1 次 = 漏课 / 漏任务)',
    failureLevel: 'high',
    thresholds: [
      { label: 'TICK_INTERVAL_MS', value: '300_000 (5 分钟)' },
      { label: 'LIMIT_PER_TICK', value: '100' }
    ],
    k8sNote: 'dispatch 按 scheduledFor 触发, 不会丢 (下次 tick 自然补, 但有 ≤ 5min 延迟)',
    file: 'packages/server/src/modules/common/notificationCron.js'
  },
  {
    name: 'petCron',
    intervalHuman: '1h',
    leaderElect: true,
    purpose: '宠物饥饿度衰减 + 死亡重生 (dieAndRebirth)',
    what: [
      '1) 扫 PetAccount { state: alive } 用 cursor 流式处理 (万级 collection 不爆内存)',
      '2) 衰减: currentHunger -= elapsedMinutes / PetSpecies.hungerDecayMinutes (默认 60 分钟/点), CAS (lastHungerDecayAt 守卫) 保证并发安全, 失败 retry 2 次',
      '3) 死亡: currentHunger=0 && (now - lastFedAt) ≥ PetSpecies.deathThresholdDays → dieAndRebirth: state=dead→egg, level=1, exp=0, hunger=300 (INIT_HUNGER_AFTER_HATCH), lastFedAt=null, 写 PetEvent type=death + type=rebirth'
    ],
    sources: ['PetAccount', 'PetSpecies', 'PetEvent'],
    failure: '学生宠物饱腹度不衰减 (UI 上看不出) / 死了不会自动重生 (要等下次)',
    failureLevel: 'low',
    thresholds: [
      { label: 'MAX_HUNGER', value: '1000' },
      { label: 'INIT_HUNGER_AFTER_HATCH', value: '300' },
      { label: 'CAS_RETRY', value: '2' },
      { label: 'deathThresholdDays', value: 'C=30 / B=25 / A=20 / S=15 (per-tier)' }
    ],
    k8sNote: '单次 tick 内取 elapsed 全量补偿 (不是按 tick 增量算), 丢 1 个 tick = 最多 1h 衰减未扣, 可接受',
    file: 'packages/server/src/modules/pet/petCron.js'
  },
  {
    name: 'loginRateLimitSweep',
    intervalHuman: '5min',
    leaderElect: false,
    purpose: '登录限流桶清理: 把过期+无活动桶删掉, 防内存涨',
    what: [
      '遍历 buckets.mobile / buckets.ip 两个 Map',
      '删除条件: blockedUntil ≤ now (锁定期已过) && count=0 && failureCount=0 (空桶)',
      '纯内存清理, 不写 DB; 空转时 (cleared=0) 不打日志, 避免刷屏'
    ],
    sources: ['内存 Map (loginRateLimit.js)'],
    failure: '进程内存慢慢涨 (量级很小, 几天不清理也不致命); 不影响登录逻辑',
    failureLevel: 'low',
    thresholds: [
      { label: 'SWEEP_INTERVAL_MS', value: '300_000 (5 分钟)' }
    ],
    file: 'packages/server/src/middlewares/loginRateLimit.js'
  },
  {
    name: 'captchaSweep',
    intervalHuman: '1min',
    leaderElect: false,
    purpose: '图形验证码挑战 + pass 清理: 把过期 token / pass 删掉, 防内存涨',
    what: [
      '遍历 challenges Map (token → { correctX, correctY, expiresAt, used })',
      '遍历 passes Map (pass → { expiresAt, used })',
      '删除: expiresAt < now 的项',
      '纯内存清理, 不写 DB; 空转时不打日志'
    ],
    sources: ['内存 Map (captcha.service.js)'],
    failure: '进程内存慢慢涨; 用户拿到过期的 captcha 挑战会 400 (有兜底错误提示)',
    failureLevel: 'low',
    thresholds: [
      { label: 'SWEEP_INTERVAL_MS', value: '60_000 (1 分钟)' },
      { label: 'challengeTtlMs', value: 'config.captcha.challengeTtlMs' },
      { label: 'passTtlMs', value: 'config.captcha.passTtlMs' }
    ],
    file: 'packages/server/src/modules/captcha/captcha.service.js'
  }
]

const cronRows = computed(() => data.value?.crons || [])

const healthyReplicaCount = computed(() => {
  if (!data.value?.replicas) return 0
  return data.value.replicas.filter((r) => r.secondsSinceHeartbeat <= 60).length
})

const selfLockCount = computed(() => {
  if (!data.value?.cronLocks) return 0
  return data.value.cronLocks.filter((l) => l.isSelf).length
})

function failureLabel(level) {
  if (level === 'high') return '高 — 业务立刻感知'
  if (level === 'medium') return '中 — 业务流程滞后'
  return '低 — 仅运维感知'
}

function formatUptime(sec) {
  if (sec == null) return '-'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}min ${sec % 60}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}

function formatTime(t) {
  if (!t) return '-'
  const d = new Date(t)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

function formatRelative(t) {
  if (!t) return '-'
  const sec = Math.floor((Date.now() - new Date(t).getTime()) / 1000)
  if (sec < 60) return `${sec}s 前`
  if (sec < 3600) return `${Math.floor(sec / 60)}min 前`
  return `${Math.floor(sec / 3600)}h 前`
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

function formatStats(obj) {
  try {
    return JSON.stringify(obj)
  } catch {
    return String(obj)
  }
}

async function load() {
  loading.value = true
  try {
    const res = await cronApi.status()
    data.value = res.data
  } catch (e) {
    ElMessage.error('加载 cron 状态失败')
  } finally {
    loading.value = false
  }
}

async function onTick(row) {
  try {
    await ElMessageBox.confirm(
      `手动跑一次「${row.name}」? 此操作绕过 leader 锁 (多副本场景下会在当前请求命中的副本上跑), 仅供调试 / 紧急修复 leader 卡死时使用。`,
      '手动 trigger',
      {
        type: 'warning',
        confirmButtonText: '立即跑',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  ticking[row.name] = true
  try {
    const res = await cronApi.tick(row.name)
    ElMessage.success(`${row.name} 跑完, 耗时 ${res.data.durationMs}ms`)
    await load()
  } catch (e) {
    // 409 + 404 后端有友好 message
    const msg = e?.response?.data?.message || e.message || '触发失败'
    ElMessage.error(msg)
    if (e?.response?.data?.data?.conflict) {
      // 立即刷新一次, 拿最新 inFlight 信息
      load()
    }
  } finally {
    ticking[row.name] = false
  }
}

// ===== R-4103 历史流水 =====

async function loadTicks() {
  tickLoading.value = true
  try {
    const params = {
      page: tickFilter.page,
      pageSize: tickFilter.pageSize
    }
    if (tickFilter.name) params.name = tickFilter.name
    if (tickFilter.source) params.source = tickFilter.source
    if (tickFilter.ok !== '' && tickFilter.ok !== null) params.ok = tickFilter.ok
    if (tickFilter.from) params.from = new Date(tickFilter.from).toISOString()
    if (tickFilter.to) params.to = new Date(tickFilter.to).toISOString()
    const res = await cronApi.ticks(params)
    tickItems.value = res.data.items
    tickTotal.value = res.data.total
  } catch (e) {
    ElMessage.error('加载流水失败')
  } finally {
    tickLoading.value = false
  }
}

function onTickSearch() {
  tickFilter.page = 1
  loadTicks()
}

function onTickReset() {
  tickFilter.name = ''
  tickFilter.source = ''
  tickFilter.ok = ''
  tickFilter.from = ''
  tickFilter.to = ''
  tickFilter.page = 1
  loadTicks()
}

function startStatusPolling() {
  if (timer) return
  load() // 立即跑一次
  timer = setInterval(load, 10_000)
}

function stopStatusPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startTickPolling() {
  if (tickTimer) return
  loadTicks() // 立即跑一次
  tickTimer = setInterval(loadTicks, 10_000)
}

function stopTickPolling() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

// 切 tab 启停轮询 (避免两个 tab 同时 10s 轮询 浪费请求)
watch(activeTab, (newTab) => {
  if (newTab === 'status') {
    stopTickPolling()
    startStatusPolling()
  } else if (newTab === 'ticks') {
    stopStatusPolling()
    startTickPolling()
  }
})

onMounted(() => {
  startStatusPolling()
})

onUnmounted(() => {
  stopStatusPolling()
  stopTickPolling()
})
</script>

<style scoped>
.page { padding: 8px; }
.subtitle { color: #909399; margin: 0 0 16px; font-size: 13px; line-height: 1.6; }
.subtitle code { padding: 1px 6px; background: #f5f7fa; border-radius: 3px; font-size: 12px; color: #c7254e; }
.mb { margin-bottom: 16px; }
.mt { margin-top: 16px; }
.ml { margin-left: 8px; }
.muted { color: #909399; }
.error-text { color: #f56c6c; }

.stat-card { text-align: left; }
.stat-label { color: #909399; font-size: 12px; }
.stat-value { font-size: 28px; font-weight: 600; line-height: 1.4; }
.stat-sub { color: #909399; font-size: 12px; }

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cron-name {
  padding: 1px 6px;
  background: #f5f7fa;
  border-radius: 3px;
  font-size: 12px;
  color: #c7254e;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.stats-json {
  font-size: 12px;
  color: #606266;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  word-break: break-all;
}

.doc-title {
  display: flex;
  align-items: center;
  font-size: 13px;
}
.doc-purpose {
  color: #606266;
  font-weight: normal;
}
.doc-body { padding: 8px 4px; }
.doc-line { line-height: 1.7; }

.thresholds { margin: 0; padding-left: 20px; }
.thresholds li { line-height: 1.7; }
.thresholds code {
  padding: 1px 6px;
  background: #f5f7fa;
  border-radius: 3px;
  font-size: 12px;
  color: #c7254e;
}

.checklist { margin: 0; padding-left: 20px; line-height: 1.8; }
</style>