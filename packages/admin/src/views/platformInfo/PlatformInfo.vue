<template>
  <div class="page platform-info-page">
    <!-- 顶部说明 -->
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">
            <el-icon style="vertical-align: -2px"><Platform /></el-icon>
            系统说明（仅平台超管可见）
          </h2>
          <div class="subtitle">
            集中说明平台超管身份、职位
            <code>isSystem</code> 标记、新建机构的默认职位等"只能在这里讲清楚"的事情。
          </div>
        </div>
        <el-tag type="warning" size="large" effect="dark">
          <el-icon><Warning /></el-icon>
          <span>本页仅展示给 {{ auth.user?.realName || auth.user?.mobile }}（平台超管）</span>
        </el-tag>
      </div>
    </el-card>

    <!-- 4 个说明区块 -->
    <el-collapse v-model="activeNames" class="info-collapse">

      <!-- 1. 平台超管身份 -->
      <el-collapse-item name="admin">
        <template #title>
          <div class="block-title">
            <el-icon><Key /></el-icon>
            <span class="block-title-text">1. 平台超管身份（isPlatformAdmin）</span>
            <el-tag type="danger" size="small">安全敏感</el-tag>
          </div>
        </template>

        <div class="block-content">
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            title="核心事实：没有任何 API 端点可以把用户设为平台超管"
            description="这是有意设计：防止管理员通过业务接口把自己/同伙提权成跨机构超管。授予 / 撤销 isPlatformAdmin 只能直接操作数据库。"
            style="margin-bottom: 16px"
          />

          <h4>含义</h4>
          <ul>
            <li>
              标记位于 <code>User.isPlatformAdmin</code>（<code>packages/server/src/models/User.model.js</code>），默认 <code>false</code>。
            </li>
            <li>
              登录后由 <code>authenticate</code> 中间件塞进 <code>req.user.isPlatformAdmin</code>；下游所有 <code>requirePermission</code>
              看到 <code>true</code> 会直接 <code>next()</code>，绕过权限码检查。
            </li>
            <li>
              走 <code>requireOrg</code> 时可以不传 <code>x-org-id</code>；传了则受该机构关系约束。
            </li>
          </ul>

          <h4>授予（MongoDB Shell）</h4>
          <el-input
            :model-value="grantCmd"
            type="textarea"
            :rows="3"
            readonly
            resize="none"
            class="code-block"
          />
          <div class="code-tip">把 <code>13800000000</code> 换成目标用户的手机号（唯一索引）。</div>

          <h4>撤销</h4>
          <el-input
            :model-value="revokeCmd"
            type="textarea"
            :rows="3"
            readonly
            resize="none"
            class="code-block"
          />

          <h4>MongoDB Atlas / Compass 操作步骤</h4>
          <ol>
            <li>登录 Atlas → 选集群 → <strong>Database</strong> → 选数据库 → <strong>Browse Collections</strong> → 选 <code>users</code>。</li>
            <li>用 <code>{ mobile: "13800000000" }</code> 过滤目标用户，<strong>Edit Document</strong>。</li>
            <li>把 <code>isPlatformAdmin</code> 字段值改为 <code>true</code>（撤销改 <code>false</code>），保存。</li>
            <li>该用户需重新登录才能拿到新权限（access token 短期有效，刷新后会带上新标记）。</li>
          </ol>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="配套要求"
            description="被授予 isPlatformAdmin 的用户仍需有至少一个 UserOrgRel，否则他只能访问纯平台路由（如跨机构职位同步）。要让他能看所有机构数据，先把他加到目标机构。"
            style="margin-top: 12px"
          />
        </div>
      </el-collapse-item>

      <!-- 2. isSystem 标记 -->
      <el-collapse-item name="isSystem">
        <template #title>
          <div class="block-title">
            <el-icon><Lock /></el-icon>
            <span class="block-title-text">2. 职位的 isSystem 标记</span>
            <el-tag type="info" size="small">防删除</el-tag>
          </div>
        </template>

        <div class="block-content">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="核心事实：isSystem 是一个『防删除 / 防降级』的标记，跟权限无关"
            description="系统不会因为 isSystem=true 自动授予任何权限。实际权限只看该 Position 的 permissions 数组，跟 isSystem 完全解耦。"
            style="margin-bottom: 16px"
          />

          <h4>作用（仅两条）</h4>
          <ul>
            <li>
              <code>position.service.remove()</code>：<code>if (pos.isSystem) throw '系统职位不可删除'</code>
            </li>
            <li>
              <code>position.service.update()</code>：<code>if (pos.isSystem && payload.isSystem === false) throw '系统职位不可降级'</code>
            </li>
          </ul>

          <h4>不作用（容易踩坑的地方）</h4>
          <ul>
            <li>
              <code>isSystem=true</code> <strong>不会</strong>让任何权限检查放行——权限只认 <code>permissions[]</code>。
            </li>
            <li>
              <code>isSystem=true</code> 的职位，<strong>依然可以通过</strong> <code>PUT /positions/:id/permissions</code> 改权限数组——清空即等于"系统管理员什么都不能干"。
            </li>
            <li>
              <strong>没有任何 UI 开关</strong>可以切换 <code>isSystem</code>。后端也拒绝 <code>true → false</code> 方向的降级。
            </li>
          </ul>

          <h4>如何『取消』一个系统职位的系统身份</h4>
          <p>没有干净路径。如确有必要，<strong>直接改 MongoDB</strong>：</p>
          <el-input
            :model-value="demoteCmd"
            type="textarea"
            :rows="2"
            readonly
            resize="none"
            class="code-block"
          />
          <div class="code-tip">改完后该职位就能删除、改 clientLevel；但请同步把所有『管理员』用户迁到一个新职位，否则依赖"找系统管理员"的业务代码会失效。</div>

          <h4>如何『取消』一个系统职位的实际权限</h4>
          <p>走正常流程：用 <code>position.write</code> 权限的人（包括该系统管理员自己）在 UI 上把它的权限勾选项清空。下次请求 <code>requirePermission</code> 就会按新数组判断。isSystem 标记保持不变。</p>
        </div>
      </el-collapse-item>

      <!-- 3. 默认职位 -->
      <el-collapse-item name="defaults">
        <template #title>
          <div class="block-title">
            <el-icon><Files /></el-icon>
            <span class="block-title-text">3. 新建机构的默认职位</span>
            <el-tag type="success" size="small">5 个</el-tag>
          </div>
        </template>

        <div class="block-content">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="核心事实：新机构创建时自动 seed 5 个默认职位（per-org 各自一份）"
            description="由 position.service.js 的 ensureDefaultPositions(orgId) 在 Org.create 之后调用；幂等，不会覆盖已有同名职位。"
            style="margin-bottom: 16px"
          />

          <el-table :data="defaultPositions" border size="small" class="default-positions-table">
            <el-table-column prop="name" label="名称" min-width="120">
              <template #default="{ row }">
                <span class="dp-name">{{ row.name }}</span>
                <el-tag v-if="row.isSystem" type="warning" size="small" style="margin-left: 6px">系统</el-tag>
                <el-tag v-if="row.clientLevel > 0" type="success" size="small" style="margin-left: 6px">
                  L{{ row.clientLevel }} 家长
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="desc" label="用途" min-width="180" />
            <el-table-column label="权限数" width="80" align="center">
              <template #default="{ row }">
                <el-tag size="small">{{ row.permissions.length }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="权限码" min-width="320">
              <template #default="{ row }">
                <span class="perm-codes">{{ row.permissions.join('、') }}</span>
              </template>
            </el-table-column>
          </el-table>

          <el-alert
            type="warning"
            :closable="false"
            show-icon
            title="注意：仅新机构生效"
            description="已存在的机构不会因为 DEFAULT_POSITIONS 改动而自动补齐。若要给老机构补新默认职位，需在数据库里手动 insertMany，或调用位置服务的 ensureDefaultPositions(orgId)。"
            style="margin-top: 12px"
          />
        </div>
      </el-collapse-item>

      <!-- 4. 平台专属功能 -->
      <el-collapse-item name="routes">
        <template #title>
          <div class="block-title">
            <el-icon><Connection /></el-icon>
            <span class="block-title-text">4. 平台超管专属入口一览</span>
            <el-tag size="small">对照表</el-tag>
          </div>
        </template>

        <div class="block-content">
          <el-table :data="platformOnlyRoutes" border size="small">
            <el-table-column prop="path" label="路由 / 操作" min-width="200" />
            <el-table-column prop="where" label="入口位置" min-width="160" />
            <el-table-column prop="desc" label="说明" min-width="280" />
          </el-table>

          <h4>权限边界提示</h4>
          <ul>
            <li>
              平台超管对 <strong>本机构</strong> 的业务操作仍然受 <code>x-org-id</code> 限制；切换机构才能切换上下文。
            </li>
            <li>
              平台路由（如 <code>/api/v1/positions/source-orgs</code>）是 <code>requirePlatformAdmin</code> 硬门，<strong>不</strong>走 <code>requirePermission</code>，跟 Position 的 <code>permissions</code> 数组完全无关。
            </li>
            <li>
              <code>permissions.json</code> 里的 <code>platform.*</code> 4 个码（platform.org.read/write、platform.dict.read/write）是<strong>预留位</strong>，当前没有默认职位持有它们；即便勾上也只在 UI 展示，平台路由只认 <code>isPlatformAdmin</code>。
            </li>
          </ul>
        </div>
      </el-collapse-item>

    </el-collapse>

    <div class="footer-note">
      本页内容由代码生成（"文档即代码"还不够格，这里是"文档随版本走"）。如实现有变，请同步修改本文件。
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const activeNames = ref(['admin', 'isSystem'])

// MongoDB 操作样例（target 用占位符，文档里一眼能看懂要替换什么）
const TARGET_MOBILE = '13800000000'
const grantCmd = `// 授予：把指定手机号的用户设为平台超管
db.users.updateOne(
  { mobile: "${TARGET_MOBILE}" },
  { $set: { isPlatformAdmin: true } }
)`

const revokeCmd = `// 撤销：恢复普通用户
db.users.updateOne(
  { mobile: "${TARGET_MOBILE}" },
  { $set: { isPlatformAdmin: false } }
)`

const demoteCmd = `// 把一个 isSystem=true 的职位改为 false（绕过 API 限制）
db.positions.updateOne(
  { _id: ObjectId("64xxxxxxxxxxxxxxxxxxxxxx") },
  { $set: { isSystem: false } }
)`

// 默认职位快照——必须与 packages/server/src/modules/position/position.service.js 的 DEFAULT_POSITIONS 保持一致
const defaultPositions = [
  {
    name: '管理员',
    isSystem: true,
    clientLevel: 0,
    desc: '机构最高权限；不可删除',
    permissions: [
      'user.read', 'user.write', 'user.resetPassword',
      'position.read', 'position.write',
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read'
    ]
  },
  {
    name: '教务',
    isSystem: false,
    clientLevel: 0,
    desc: '核心教务业务（不开 user/position 权限）',
    permissions: [
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'lessonAttendance.read',
      'studentWork.read',
      'points.read', 'pet.read'
    ]
  },
  {
    name: '老师',
    isSystem: false,
    clientLevel: 0,
    desc: '看自己开班的考勤、上传作品',
    permissions: [
      'student.read',
      'courseInstance.read',
      'room.read',
      'lessonSchedule.read',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write'
    ]
  },
  {
    name: '家长',
    isSystem: false,
    clientLevel: 1,
    desc: 'C 端登录用；每个 clientLevel 最多一个',
    permissions: [
      'student.read',
      'lessonSchedule.read',
      'lessonAttendance.read',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read'
    ]
  },
  {
    name: '财务',
    isSystem: false,
    clientLevel: 0,
    desc: '订单收退款 + 学生只读',
    permissions: [
      'order.read', 'order.write', 'order.pay',
      'student.read', 'studentProduct.read'
    ]
  }
]

const platformOnlyRoutes = [
  { path: '/orgs', where: '系统管理 → 机构管理', desc: '跨机构管理：新建/编辑/停用/删除机构' },
  { path: '/categories', where: '基础数据 → 类别字典', desc: '维护系统级 Category 字典（如机构类型）' },
  { path: '/regions', where: '基础数据 → 地区字典', desc: '维护系统级 Region 树' },
  { path: '跨机构同步职位', where: '职位权限 → 顶部按钮', desc: '从其他机构复制职位到当前机构' },
  { path: '误操删除职位', where: '职位权限 → 行操作', desc: '删除自定义职位（系统职位不允许删）；需要超管密码二次确认' },
  { path: '开班 cancel/delete', where: '开班详情', desc: '对 courseInstance 强制 cancel/delete；需超管密码' }
]
</script>

<style scoped>
.platform-info-page { display: flex; flex-direction: column; gap: 12px; }
.header-card { border: none; }
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.title { margin: 0 0 4px 0; font-size: 20px; display: flex; align-items: center; gap: 6px; }
.subtitle { color: #606266; font-size: 13px; line-height: 1.6; }

.info-collapse { background: #fff; }
.info-collapse :deep(.el-collapse-item__header) {
  padding-left: 16px;
}
.info-collapse :deep(.el-collapse-item__content) {
  padding: 4px 20px 20px;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.block-title-text { font-weight: 600; font-size: 15px; }

.block-content h4 { margin: 14px 0 6px 0; font-size: 14px; color: #303133; }
.block-content h4:first-child { margin-top: 0; }
.block-content ul, .block-content ol { margin: 6px 0 6px 0; padding-left: 22px; line-height: 1.8; color: #303133; font-size: 13px; }
.block-content code {
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #d6336c;
}

.code-block :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
  font-size: 12px !important;
  background: #1e1e1e !important;
  color: #d4d4d4 !important;
  border-radius: 4px;
}
.code-tip {
  color: #909399;
  font-size: 12px;
  margin: 4px 2px 12px;
}

.default-positions-table { margin-top: 4px; }
.dp-name { font-weight: 600; color: #303133; }
.perm-codes {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #606266;
  word-break: break-all;
}

.footer-note {
  text-align: center;
  color: #909399;
  font-size: 12px;
  padding: 12px 0;
}
</style>