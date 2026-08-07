'use strict'

/**
 * 任务模块 Service (2026-07-08 立项)
 *
 * 业务核心:
 *   - 三角色协作: creator (1 个) / assignees (≥1) / supervisors (≥1)
 *   - 多执行人各自勾选自己负责的 TaskItem;全员提交才进 submitted
 *   - 监督人审批: approved → 终态; rejected/requested_changes → 回 in_progress 留痕
 *   - 周期任务: TaskTemplate + scheduler tick,生成 Task 实例
 *
 * 设计取舍:
 *   - 进度 (Task.progress + assignees[].progress) 由 service 显式聚合并写回,
 *     列表/看板读取时不用每次重算 (避免 N+1 与 5k 行的 TaskItem 全表扫)
 *   - 状态机的"全员 submitted 才进 submitted"由 service 在每次勾选/提交后重算
 *   - 物理删除走 §8.1 弱化版 (2026-07-08 改, 工作流类特殊): 路由 requirePermission('task.delete') +
 *     requireBodyPassword (密码二次确认, 不限超管) + service.remove 校验「平台超管 OR 任务 creator」+ removableCheck
 *     (区别: 核心实体 Org/CourseProduct/Room 等仍走 requirePlatformPassword 强门挡)
 *   - 已归档任务的物理删除 (2026-07-08 二改): archived=true 时 removableCheck 跳过 status 检查
 *     (避免「已归档 + approved/submitted 终态」死锁: 挡板说"先取消或走归档", 但已归档);
 *     removeItem 同步移除 archived 拦截, 让用户清空 checklist 后能删整个任务
 */

const Task = require('@models/Task.model')
const TaskItem = require('@models/TaskItem.model')
const TaskReview = require('@models/TaskReview.model')
const TaskComment = require('@models/TaskComment.model')
// 2026-08-06: 物理删除 Task 时级联删子表 (TaskItem/Review/Comment), 用 mongoose transaction 包原子性
const mongoose = require('mongoose')
const TaskTemplate = require('@models/TaskTemplate.model')
const TaskGenerationLog = require('@models/TaskGenerationLog.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Position = require('@models/Position.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { normalizePagination } = require('@utils/pagination')
const {
  TaskStatus,
  TaskAssigneeStatus,
  TaskScheduleKind
} = require('@shared/enums')

// ─── 内部工具 ──────────────────────────────────────

/**
 * 把一批 user 限定到本机构 (避免 admin 端传外机构 id 越权)
 *
 * 2026-08-02 修: 原来 rel 过滤条件带 `isActive: true`, 但 UserOrgRel schema **没有**
 *   isActive 字段 (启停用是 User.isActive), 于是这一查永远 0 行 → 任何建任务都 400
 *   「用户 X 不属于本机构或已停用」. 现在 rel 只判归属, 停用判 User.isActive.
 */
async function assertUsersInOrg(orgId, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return
  const idSet = new Set(userIds.map((id) => String(id)))
  const rels = await UserOrgRel.find({
    org: orgId,
    user: { $in: [...idSet] }
  }).select('user').lean()
  const inOrg = new Set(rels.map((r) => String(r.user)))
  const activeUsers = await User.find({
    _id: { $in: [...idSet] },
    isActive: { $ne: false }
  }).select('_id').lean()
  const active = new Set(activeUsers.map((u) => String(u._id)))
  for (const id of userIds) {
    if (!inOrg.has(String(id)) || !active.has(String(id))) {
      throw ApiError.badRequest(`用户 ${id} 不属于本机构或已停用`)
    }
  }
}

/**
 * 可派任务的员工下拉 (R-3924, 2026-08-02)
 *
 * 为什么不复用 `GET /users` (R-0200):
 *   - R-0200 要 `user.read` 权限, 但「财务」等岗位只有 task.write 没有 user.read,
 *     建任务页拉不到人 → 下拉全空 → el-select 直接把 raw id 当 label 显示;
 *   - 任务模块只需要 {id, realName} 这点信息, 不该为了它下放整个用户档案读权限.
 *
 * 口径: 本机构 UserOrgRel 里**至少持有一个 clientLevel=0 岗位**的 user (员工 + 混合岗),
 *   纯家长 (只有 clientLevel>0 岗位) 排除; User.isActive=false 排除.
 *   与 assertUsersInOrg 的放行口径保持一致, 避免"选得到但提交 400".
 */
async function assignableUsers({ orgId }) {
  const staffPosIds = (await Position.find({ org: orgId, clientLevel: 0 })
    .select('_id').lean()).map((p) => p._id)
  if (staffPosIds.length === 0) return { items: [] }

  const rels = await UserOrgRel.find({ org: orgId, positions: { $in: staffPosIds } })
    .populate({ path: 'user', match: { isActive: { $ne: false } }, select: 'realName mobile isActive' })
    .populate({ path: 'positions', select: 'name isSystem clientLevel' })
    .lean()

  const items = rels
    .filter((r) => r.user)
    .map((r) => ({
      id: String(r.user._id),
      realName: r.user.realName || '',
      mobile: r.user.mobile || '',
      positions: (r.positions || [])
        .filter((p) => Number(p.clientLevel) === 0)
        .map((p) => ({ id: String(p._id), name: p.name, isSystem: !!p.isSystem }))
    }))
    .sort((a, b) => (a.realName || '').localeCompare(b.realName || '', 'zh-CN'))

  return { items }
}

/**
 * 重算并写回 task 的整体进度 + 各执行人个人进度 + 推断状态
 * 状态推断:
 *   - 全部条目 done                     → 各自 submitted (assignees[].status)
 *   - 全部 assignees submitted           → task.status = submitted
 *   - 部分 assignees submitted           → task.status = partial_submitted
 *   - 至少 1 个执行人开始(assignee.status != not_started) → in_progress (前提不是 submitted/approved)
 *
 * 注意: 如果 task 已经在 approved/expired/cancelled 终态, 不再覆盖
 * 2026-07-11: 从早退名单移除 'rejected' — rejected 是「被打回等待重做」, 不是审批中/终态
 *   assignees 重新提交后, 状态应按 assignees 重算 (全部 submitted → submitted 进入二次审批)
 */
async function recomputeTaskState(taskId) {
  const task = await Task.findById(taskId)
  if (!task) return null
  if (['approved', 'expired', 'cancelled', 'submitted'].includes(task.status)) {
    // 终态/审批中: 不重算状态(避免审批中又把任务标为 in_progress);只重算 progress
    return await recomputeProgressOnly(task)
  }

  const items = await TaskItem.find({ task: taskId }).select('assignee done').lean()
  const totalItems = items.length
  const doneItems = items.filter((it) => it.done).length
  const itemByAssignee = new Map() // userId -> { total, done }
  for (const it of items) {
    const k = String(it.assignee)
    if (!itemByAssignee.has(k)) itemByAssignee.set(k, { total: 0, done: 0 })
    const acc = itemByAssignee.get(k)
    acc.total += 1
    if (it.done) acc.done += 1
  }

  // 更新每个执行人的 progress + status
  let allSubmitted = true
  let anyStarted = false
  for (const a of task.assignees) {
    const acc = itemByAssignee.get(String(a.user)) || { total: 0, done: 0 }
    const personal = acc.total === 0 ? 0 : Math.round((acc.done / acc.total) * 100)
    a.progress = personal
    if (acc.total > 0 && acc.done >= acc.total) {
      if (a.status !== 'submitted') {
        a.status = 'submitted'
        a.submittedAt = new Date()
      }
    } else if (acc.done > 0) {
      if (a.status === 'not_started') a.status = 'in_progress'
      anyStarted = true
      allSubmitted = false
    } else {
      // 0 / 0 (没分配条目) 或 0 / N: 都算 not_started
      if (a.status === 'submitted') {
        // 罕见: 之前 submitted 后来被取消了勾选 → 回到 in_progress
        a.status = 'in_progress'
        a.submittedAt = null
      }
      allSubmitted = false
    }
  }

  // 任务整体进度
  task.progress = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100)

  // 推断任务状态
  if (task.assignees.length > 0 && allSubmitted && task.assignees.every((a) => a.status === 'submitted')) {
    task.status = 'submitted'
  } else if (task.assignees.some((a) => a.status === 'submitted') && anyStarted) {
    task.status = 'partial_submitted'
  } else if (anyStarted) {
    task.status = 'in_progress'
  } else if (task.status === 'draft') {
    // 草稿不动
  } else {
    task.status = 'assigned'
  }

  await task.save()
  return task
}

/**
 * 只重算 progress(终态场景)
 */
async function recomputeProgressOnly(task) {
  const items = await TaskItem.find({ task: task._id }).select('assignee done').lean()
  const total = items.length
  const done = items.filter((it) => it.done).length
  task.progress = total === 0 ? 0 : Math.round((done / total) * 100)
  await task.save()
  return task
}

/**
 * 校验 actor 是否能看见这个 task (可见性)
 *   - task.read 持有者 → 全部可见
 *   - 否则: creator / assignees[].user / supervisors / comments.mentions 之一 → 可见
 *   - 平台超管 → 全部
 *
 * 注意: creator / assignees[].user / supervisors 字段在 detail() 里被 populate 成 { _id, realName, avatar }
 *   直接 String(obj) 会得 '[object Object]', 永远跟 actor.userId 不等 — 必须取 _id 后再 String()
 */
function refId(v) {
  // populate 后是 { _id, ... }, 未 populate 时是 ObjectId / string; 都要拿到可比对的字符串
  if (v == null) return ''
  if (typeof v === 'object') return String(v._id || v.id || '')
  return String(v)
}

async function canViewTask(actor, task) {
  if (!actor) return false
  if (actor.isPlatformAdmin) return true
  // actor.permissions 是后端 requirePermission 中间件解析后的数组 (见 packages/server/src/middlewares/requirePermission.js)
  const perms = actor.permissions || []
  // 2026-07-11: 拆权限后 task.read = 看全部; task.read.own 也可"进入任务模块", 由路由层 OR 守门,
  //   此处只看 task.read 判断"能否看全部"; 若无 task.read, 走下面 4 个 fallback:
  //   自己是创建人 / 执行人 / 监督人 / 被 @  (mentioned: 服务端 MVP 暂未实现 Comment 联合查询)
  if (perms.includes('task.read')) return true
  if (refId(task.creator) === String(actor.userId)) return true
  if ((task.assignees || []).some((a) => refId(a.user) === String(actor.userId))) return true
  if ((task.supervisors || []).some((s) => refId(s) === String(actor.userId))) return true
  return false
}

// ─── 列表 ──────────────────────────────────────

async function list({ orgId, status, type, priority, assignee, creator, supervisor, myRole, keyword, dueBefore, dueAfter, page, pageSize, archived, actor, tag, tags }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  // 2026-07-08: 归档过滤 — 默认隐藏已归档, ?archived=true 才看历史
  //   undefined → 默认 false (隐藏); 'true' / true → 看归档
  if (archived === true || archived === 'true') {
    filter.archived = true
  } else {
    filter.archived = { $ne: true }
  }
  if (status) filter.status = status
  if (type) filter.type = type
  if (priority) filter.priority = priority
  if (assignee) filter['assignees.user'] = assignee
  if (creator) filter.creator = creator
  if (supervisor) filter.supervisors = supervisor
  if (keyword) filter.title = { $regex: keyword, $options: 'i' }
  // 2026-08-06: P1.1 — 列表 chip 点击筛选 (?tag=单值 或 ?tag=a,b 多值 $in)
  if (tag) {
    const arr = String(tag).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length === 1) filter.tags = arr[0]
    else if (arr.length > 1) filter.tags = { $in: arr }
  }
  // 2026-08-06: P2.1 — 多选标签 AND 筛选 (?tags=a,b,c 必须同时含全部)
  if (tags) {
    const arr = String(tags).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length === 1) filter.tags = arr[0]
    else if (arr.length > 1) filter.tags = { $all: arr }
  }
  if (dueBefore || dueAfter) {
    filter.dueAt = {}
    if (dueBefore) filter.dueAt.$lte = new Date(dueBefore)
    if (dueAfter) filter.dueAt.$gte = new Date(dueAfter)
  }
  // 可见性: 无 task.read 时只能看自己相关 (task.read.own 持有者进得了接口但只能看自己的)
  // 路由层已经 OR 守门 (requirePermission('task.read', 'task.read.own')) — 此处只要判 task.read 看全部即可
  const perms = (actor && actor.permissions) || []
  const canSeeAll = actor && (actor.isPlatformAdmin || perms.includes('task.read'))
  if (!canSeeAll) {
    filter.$or = [
      { creator: actor.userId },
      { 'assignees.user': actor.userId },
      { supervisors: actor.userId }
    ]
  }
  // myRole 进一步过滤
  if (myRole && myRole !== 'all') {
    if (myRole === 'creator') filter.creator = actor.userId
    else if (myRole === 'assignee') filter['assignees.user'] = actor.userId
    else if (myRole === 'supervisor') filter.supervisors = actor.userId
    // mentioned: 需要再 union Comment 查询,MVP 简化不做
  }
  const [items, total] = await Promise.all([
    Task.find(filter)
      .populate('creator', 'realName avatar')
      .populate('assignees.user', 'realName avatar')
      .populate('supervisors', 'realName avatar')
      .sort({ dueAt: 1, createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Task.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

// ─── 详情 ──────────────────────────────────────

async function detail({ id, orgId, includeArchived, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
    .populate('creator', 'realName avatar')
    .populate('assignees.user', 'realName avatar')
    .populate('supervisors', 'realName avatar')
    .lean()
  if (!task) throw ApiError.notFound('任务不存在')
  // 可见性
  if (!(await canViewTask(actor, task))) {
    throw ApiError.forbidden('无权查看该任务')
  }
  // 2026-07-08: 已归档的任务默认不可看 (前端要先 toggle "显示已归档" 才能看)
  //   反向场景: 前端在归档 tab 里点"查看详情", 必须显式传 includeArchived=true 绕过
  if (task.archived && !includeArchived) {
    throw ApiError.forbidden('任务已归档,请在「已归档」列表中查看')
  }
  // 关联 items / reviews / comments
  const [items, reviews, comments] = await Promise.all([
    TaskItem.find({ task: id }).populate('assignee', 'realName avatar').populate('doneBy', 'realName').sort({ order: 1, createdAt: 1 }).lean(),
    TaskReview.find({ task: id }).populate('reviewer', 'realName avatar').sort({ reviewedAt: -1 }).lean(),
    TaskComment.find({ task: id }).populate('author', 'realName avatar').sort({ createdAt: 1 }).lean()
  ])
  return { ...task, items, reviews, comments }
}

// ─── 创建 ──────────────────────────────────────

async function create({ orgId, title, description, type, priority, creator, assignees, supervisors, startAt, dueAt, tags, relatedTo, items = [], actor }) {
  if (!Array.isArray(assignees) || assignees.length === 0) {
    throw ApiError.badRequest('至少 1 个执行人')
  }
  if (!Array.isArray(supervisors) || supervisors.length === 0) {
    throw ApiError.badRequest('至少 1 个监督人')
  }
  // 2026-07-09: 监督人 ≠ 执行人 — 同一人不能在同一个任务里既是监督人又是执行人
  //   (失去"双人"机制的意义, 单人任务等于没监督)
  //   校验顺序: 在同机构校验之前先做, 错误信息更具体
  assertNoSupervisorAssigneeOverlap(assignees, supervisors)
  // 同机构校验
  await assertUsersInOrg(orgId, [...assignees, ...supervisors, creator])
  // 条目 assignee ⊂ assignees
  const assigneeSet = new Set(assignees.map((id) => String(id)))
  for (const it of items) {
    if (!assigneeSet.has(String(it.assignee))) {
      throw ApiError.badRequest(`条目执行人 ${it.assignee} 不在任务执行人列表中`)
    }
  }
  const task = await Task.create({
    org: orgId,
    title,
    description: description || '',
    type: type || 'other',
    priority: priority || 'normal',
    creator,
    assignees: assignees.map((u) => ({ user: u, status: 'not_started', progress: 0 })),
    supervisors,
    startAt: startAt || null,
    dueAt,
    status: items.length > 0 ? 'assigned' : 'assigned',
    progress: 0,
    tags: _sanitizeTags(tags),
    relatedTo: relatedTo || {}
  })
  // 创建条目
  if (items.length > 0) {
    await TaskItem.insertMany(items.map((it, i) => ({
      org: orgId,
      task: task._id,
      title: it.title,
      assignee: it.assignee,
      order: typeof it.order === 'number' ? it.order : i,
      done: false
    })))
  }
  // 2026-07-13: 触发 task_assigned — 创建任务 = 把全部 assignees 指派给全员
  // 2026-08-02: 监督人也要收 (被指派监督也是 inbound event)
  //   assignees ∪ supervisors, 用 Set 去重 (虽然 assertNoSupervisorAssigneeOverlap 已挡过,
  //   但万一未来放宽, 这里兜一下)
  const allRecipientIds = Array.from(new Set([...(assignees || []), ...(supervisors || [])].map(String)))
  setImmediate(() => {
    publishTaskAssigned({
      task,
      recipientIds: allRecipientIds,
      actor,
      orgId
    }).catch((e) => console.warn('[task.create] publishTaskAssigned error:', e.message))
  })
  // 2026-07-08: post-create detail() 必须用真实请求者 (actor), 不能用新 creator
  //   场景: 超管创建时把 creator 改成"机构管理员", 但 detail 内部 canViewTask 用新 creator 校验,
  //   若新 creator 没 task.read 权限则抛 403 "无权查看该任务". 这里 actor 来自 controller 透传的 req.user.
  return await detail({ id: task._id, orgId, actor: actor || { userId: creator, isPlatformAdmin: false, permissions: [] } })
}

// ─── 编辑 ──────────────────────────────────────

async function update({ id, orgId, body, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  assertNotArchived(task)
  // 权限: creator / 持有 task.write
  const perms = (actor && actor.permissions) || []
  const isCreator = refId(task.creator) === String(actor.userId)
  const canWrite = perms.includes('task.write')
  if (!isCreator && !canWrite) {
    throw ApiError.forbidden('仅任务发起人或持有 task.write 可编辑')
  }
  // 终态不能编辑业务字段
  if (['approved', 'cancelled', 'expired'].includes(task.status)) {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可编辑`)
  }
  // 2026-07-09: 执行中也不能编辑 — 见 assertNotInExecution
  assertNotInExecution(task, '编辑')
  if (body.title != null) task.title = body.title
  if (body.description != null) task.description = body.description
  if (body.type != null) task.type = body.type
  if (body.priority != null) task.priority = body.priority
  if (body.startAt !== undefined) task.startAt = body.startAt
  if (body.dueAt != null) task.dueAt = body.dueAt
  if (body.tags != null) task.tags = _sanitizeTags(body.tags)
  // 2026-08-02: 收集新加入的 assignees + supervisors, 一次性发 task_assigned
  //   diff 在写库前算 (避免被前面赋值覆盖)
  const newRecipientIds = []
  if (body.supervisors != null) {
    await assertUsersInOrg(orgId, body.supervisors)
    const prevSupIds = new Set((task.supervisors || []).map(String))
    const newSupIds = body.supervisors.filter((u) => !prevSupIds.has(String(u)))
    newRecipientIds.push(...newSupIds)
    task.supervisors = body.supervisors
  }
  if (body.assignees != null) {
    await assertUsersInOrg(orgId, body.assignees)
    // 2026-07-13: 触发 task_assigned (仅新加入的执行人) — diff 旧 assignees 避免重复打扰
    const prevAssigneeIds = new Set(
      (task.assignees || []).map((a) => String(a.user))
    )
    const newAssigneeIds = body.assignees.filter((u) => !prevAssigneeIds.has(String(u)))
    newRecipientIds.push(...newAssigneeIds)
    task.assignees = body.assignees.map((u) => ({ user: u, status: 'not_started', progress: 0 }))
  }
  // 一次性派发 (assignees + supervisors 都收 task_assigned)
  if (newRecipientIds.length) {
    // 去重 (assignees ∪ supervisors 可能有交集, 后续 assignee==supervisor 也会被
    // assertNoSupervisorAssigneeOverlap 拒, 这里兜一下)
    const deduped = Array.from(new Set(newRecipientIds.map(String)))
    setImmediate(() => {
      publishTaskAssigned({
        task,
        recipientIds: deduped,
        actor,
        orgId
      }).catch((e) => console.warn('[task.update] publishTaskAssigned error:', e.message))
    })
  }
  // 2026-07-09: 监督人 ≠ 执行人 — 只在两个列表都变了或其中一个变了时校验
  //   (单改 supervisors 时拿当前 assignees 比, 单改 assignees 时拿当前 supervisors 比)
  if (body.supervisors != null || body.assignees != null) {
    const finalAssignees = (body.assignees || task.assignees.map((a) => a.user)).map((u) =>
      typeof u === 'object' && u.user ? u.user : u
    )
    const finalSupervisors = body.supervisors || task.supervisors
    assertNoSupervisorAssigneeOverlap(finalAssignees, finalSupervisors)
  }
  if (body.status != null) {
    // 仅允许: cancelled(前端 cancel 端点会处理); approved 不允许通过 update 走
    if (!['cancelled'].includes(body.status)) {
      throw ApiError.badRequest(`status=${body.status} 不能通过 PATCH 设置,请走专用端点`)
    }
    task.status = body.status
  }
  await task.save()
  return await detail({ id, orgId, actor })
}

// ─── 物理删除 + 预检 (§8.1) ───────────────────

// 2026-08-06: 物理删除 Task 时**自动级联**删 TaskItem / TaskReview / TaskComment
//   (决策: 三子表都级联删; 事务保证原子性; 复合 audit 日志 withChild)
//   → 不再用 assertUnused 阻挡这三张子表 (它们会随 Task 一起消失, 不算外部业务引用)
//   → taskUsageChecks 保留函数壳 (removableCheck 还在调), 返回空数组
function taskUsageChecks(orgId, taskId) {
  // 留空: 三子表都是 Task 自身的子表 (Task.* 是 ref), 删除 Task 时一起消失
  return []
}

async function remove({ id, orgId, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id status creator').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  // 2026-07-08: 业务权限 — 平台超管 OR 任务 creator 本人才能物理删除
  //   (路由层 requirePermission('task.delete') + requireBodyPassword 已挡了一轮;
  //    这里再加 creator 校验, 防止 task.delete 持有者删别人的任务)
  if (!actor) throw ApiError.unauthorized()
  const isPlatformAdmin = !!actor.isPlatformAdmin
  const isCreator = refId(task.creator) === String(actor.userId)
  if (!isPlatformAdmin && !isCreator) {
    throw ApiError.forbidden('仅任务创建人或平台超管可物理删除该任务')
  }
  // 业务互锁校验 (现在空跑, 留位以便未来加外部业务引用)
  await removable.assertUnused(orgId, taskUsageChecks(orgId, id))
  // ─── 事务包裹级联删除 (2026-08-06 决策) ───
  //   范式参考 packages/server/src/modules/lessonSchedule/lessonSchedule.service.js:1009
  //   顺序: 子表 → 主表 (避免主表先删了但子表还在的孤儿)
  //   失败: 整批回滚, 数据保持一致
  // ─── 单机 MongoDB 兼容 (2026-08-06): ───
  //   standalone mongod 不支持多文档事务 (即使 4.2+ 也要求 --replSet 启用副本集).
  //   dev 环境单机, 跑 withTransaction 会抛 "Transaction numbers are only allowed on a replica set member or mongos".
  //   try/catch 抓这个错降级到非事务顺序删; prod 集群触发不到这个分支.
  //   dev 没事务保护可接受 (CLAUDE.md §0: 开发阶段不考虑脏数据).
  let cascade
  try {
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const [items, reviews, comments, tasks] = await Promise.all([
          TaskItem.deleteMany({ org: orgId, task: id }, { session }),
          TaskReview.deleteMany({ org: orgId, task: id }, { session }),
          TaskComment.deleteMany({ org: orgId, task: id }, { session }),
          Task.deleteOne({ _id: id, org: orgId }, { session })
        ])
        cascade = {
          taskItems: items.deletedCount || 0,
          taskReviews: reviews.deletedCount || 0,
          taskComments: comments.deletedCount || 0,
          task: tasks.deletedCount || 0
        }
      }, { readPreference: 'primary' })
    } finally {
      await session.endSession()
    }
  } catch (err) {
    // 20 = IllegalOperation (mongo error code). 错误信息含 "Transaction numbers are only allowed"
    const msg = (err && err.message) || ''
    const isStandalone = err?.code === 20 || /Transaction numbers are only allowed/i.test(msg)
    if (!isStandalone) throw err
    // 单机降级: 无事务保护的并行删
    const [items, reviews, comments, tasks] = await Promise.all([
      TaskItem.deleteMany({ org: orgId, task: id }),
      TaskReview.deleteMany({ org: orgId, task: id }),
      TaskComment.deleteMany({ org: orgId, task: id }),
      Task.deleteOne({ _id: id, org: orgId })
    ])
    cascade = {
      taskItems: items.deletedCount || 0,
      taskReviews: reviews.deletedCount || 0,
      taskComments: comments.deletedCount || 0,
      task: tasks.deletedCount || 0
    }
  }
  // 返回 cascade 计数, controller 会写入 req.body._cascade 给 auditTrail 捕获
  //   → AuditLog body 自动含 { _cascade: { taskItems, taskReviews, ... } } 单条复合日志
  return { success: true, id, cascade }
}

async function removableCheck({ id, orgId }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id status archived').lean()
  if (!task) {
    return {
      canRemove: false,
      blockers: [{ entity: 'Task', label: '任务', count: 0, hint: '该任务不存在或不属于本机构' }]
    }
  }
  // 2026-07-08: 已归档任务 = §8.2 业务退役, 不再被业务引用, 跳过 status 检查 (终态也可以物理删)
  //   否则会出现"已归档 + approved 终态"的死锁: 挡板说"先取消或走归档", 但已经归档
  if (task.archived) {
    return removable.check(orgId, taskUsageChecks(orgId, id))
  }
  if (['approved', 'submitted'].includes(task.status)) {
    return {
      canRemove: false,
      blockers: [{
        entity: 'Task', label: '任务状态', count: 1,
        hint: `状态为 ${task.status} 的任务不允许物理删除（请先取消或走归档）`
      }]
    }
  }
  return removable.check(orgId, taskUsageChecks(orgId, id))
}

// ─── 归档 / 取消归档 (2026-07-08) ────────────────
// 归档是「软隐藏」, 反归档可逆, 与 §8.1 物理删除互为补充:
//   - 物理删除: 移除所有子表 + 任务本体, 不可逆, 走超管+密码
//   - 归档: 只翻 archived 标志位, 子表保留, 列表/看板/统计默认隐藏
// 2026-07-11: 归档仅 platform admin 或任务 creator (与 remove 对齐)
//   原逻辑任何持有 task.delete 的人都能归档别人任务, 是 bug
async function archive({ id, orgId, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  const isCreator = refId(task.creator) === String(actor.userId)
  if (!actor.isPlatformAdmin && !isCreator) {
    throw ApiError.forbidden('仅任务发起人可归档')
  }
  if (task.archived) {
    return task.toObject() // 幂等
  }
  task.archived = true
  task.archivedAt = new Date()
  task.archivedBy = actor.userId
  await task.save()
  return task.toObject()
}

async function unarchive({ id, orgId, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  const isCreator = refId(task.creator) === String(actor.userId)
  if (!actor.isPlatformAdmin && !isCreator) {
    throw ApiError.forbidden('仅任务发起人可取消归档')
  }
  if (!task.archived) {
    return task.toObject() // 幂等
  }
  task.archived = false
  task.archivedAt = null
  task.archivedBy = null
  await task.save()
  return task.toObject()
}

/**
 * 内部工具: 校验写操作时 task 未归档
 * 列表/详情/归档/取消归档/物理删除 走自己的 filter (已 include archived);
 * 写操作 (update/submit/review/cancel/addItem/toggleItem/addComment) 必须确保没归档
 */
function assertNotArchived(task) {
  if (task && task.archived) {
    throw ApiError.unprocessable('任务已归档,不可操作;请先取消归档')
  }
}

/**
 * 2026-07-09: 锁执行中状态 — "任务执行期间不能修改任务"。
 * "执行中" 窗口: assigned/in_progress/partial_submitted/submitted/rejected (除终态 + draft 之外的所有状态)。
 *   - draft / assigned: 还在前置期, 允许 creator 修字段
 *   - in_progress / partial_submitted / submitted / rejected: 已进入执行, 主体字段不可改
 *   - approved / expired / cancelled: 终态, 本来就锁
 * 不豁免 creator (业务规则: "执行期间不能修改" 无例外)。
 * 唯一例外: addItemRemark (子任务备注) 走另一条不受此锁约束的端点 — 那才是规则 3b 的豁免。
 */
const EXECUTION_STATUSES = Object.freeze(['in_progress', 'partial_submitted', 'submitted', 'rejected'])
function assertNotInExecution(task, opName = '修改') {
  if (task && EXECUTION_STATUSES.includes(task.status)) {
    throw ApiError.unprocessable(`任务执行中(${task.status}),不可${opName};如需调整请先 cancel 或走子任务备注`)
  }
}

/**
 * 2026-07-09: 监督人 ≠ 执行人 — 同一人不能在同一个任务里既是监督人又是执行人。
 * assignees 可以是 userId 字符串数组, 也可以是 { user, ... } 对象数组 (来自 update body 的展平);
 * supervisors 一定是 userId 字符串数组。
 * 错误信息列具体哪个 userId 冲突, 方便用户定位修正。
 */
function assertNoSupervisorAssigneeOverlap(assignees, supervisors) {
  if (!Array.isArray(assignees) || !Array.isArray(supervisors)) return
  const supSet = new Set(supervisors.map((u) => String(u)))
  const overlap = assignees
    .map((u) => (u && typeof u === 'object' && u.user ? String(u.user) : String(u)))
    .filter((u) => supSet.has(u))
  if (overlap.length) {
    throw ApiError.badRequest(`监督人与执行人不能为同一人: ${[...new Set(overlap)].join(', ')}`)
  }
}

/**
 * 2026-08-06: tags 字段统一清洗 (P0.2) — trim + 拒空串 + 去重 + 限长(单标签 30, 总数 30)。
 * 任何写入路径(create / update / generateFromTemplate)都过这个函数, 保证存进 DB 的 tags 永远
 * 是干净的标准数组。前端可信赖后端, 不必自己做清洗。
 */
function _sanitizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const seen = new Set()
  const out = []
  for (const raw of tags) {
    if (typeof raw !== 'string') continue
    const t = raw.trim()
    if (!t || t.length > 30) continue        // 拒空 + 限单标签长
    if (seen.has(t)) continue                  // 去重
    seen.add(t)
    out.push(t)
    if (out.length >= 30) break                // 限总标签数
  }
  return out
}

// ─── 状态机：执行人提交 ────────────────────────

async function submit({ id, orgId, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  assertNotArchived(task)
  if (!['assigned', 'in_progress', 'partial_submitted', 'rejected'].includes(task.status)) {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可提交`)
  }
  const me = task.assignees.find((a) => refId(a.user) === String(actor.userId))
  if (!me) {
    throw ApiError.forbidden('你不是该任务的执行人')
  }
  // 校验: 自己负责的所有条目都已 done
  const myItems = await TaskItem.find({ task: id, assignee: actor.userId }).select('done').lean()
  const undone = myItems.filter((it) => !it.done)
  if (undone.length > 0) {
    throw ApiError.unprocessable(`还有 ${undone.length} 个未完成条目,无法提交`)
  }
  if (myItems.length === 0) {
    throw ApiError.badRequest('你没有分配到任何条目,无需提交')
  }
  me.status = 'submitted'
  me.submittedAt = new Date()
  await task.save()
  await recomputeTaskState(id)
  return await detail({ id, orgId, actor })
}

// ─── 状态机：监督人审批 ────────────────────────

async function review({ id, orgId, result, comment, score, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  assertNotArchived(task)
  // 监督人校验
  const isSupervisor = task.supervisors.some((s) => String(s) === String(actor.userId))
  if (!isSupervisor) {
    throw ApiError.forbidden('只有任务的监督人可以审批')
  }
  if (task.status !== 'submitted') {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可审批,需要先全员提交`)
  }
  // 写核查记录
  await TaskReview.create({
    task: id,
    org: orgId,
    reviewer: actor.userId,
    result,
    comment: comment || '',
    score: score || null
  })
  // 更新任务状态
  if (result === 'approved') {
    task.status = 'approved'
    // 2026-07-13: 触发 task_approved — 推给所有 assignees + creator (发起人也想知道通过)
    setImmediate(() => {
      publishTaskApproved({
        task,
        actor,
        orgId,
        reviewComment: comment || '',
        reviewScore: score || null
      }).catch((e) => console.warn('[task.review] publishTaskApproved error:', e.message))
    })
  } else if (result === 'rejected' || result === 'requested_changes') {
    task.status = 'rejected'
    // 执行人状态退回 in_progress,允许重做
    for (const a of task.assignees) {
      if (a.status === 'submitted') {
        a.status = 'in_progress'
        a.submittedAt = null
      }
    }
    // 2026-07-13: 触发 task_rejected — 推给所有 assignees (被打回, 需修改)
    setImmediate(() => {
      publishTaskRejected({
        task,
        actor,
        orgId,
        reviewComment: comment || '',
        reviewScore: score || null
      }).catch((e) => console.warn('[task.review] publishTaskRejected error:', e.message))
    })
  }
  await task.save()
  await recomputeProgressOnly(task)
  return await detail({ id, orgId, actor })
}

// ─── 状态机：取消 ──────────────────────────────

async function cancel({ id, orgId, reason, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  assertNotArchived(task)
  if (['approved', 'cancelled', 'expired'].includes(task.status)) {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可取消`)
  }
  // 2026-07-11: 取消任务仅 platform admin 或任务 creator, 移除原 task.write 兜底
  //   原逻辑让持有 task.write 的执行人/监督人也能取消别人的任务, 是 bug
  const isCreator = refId(task.creator) === String(actor.userId)
  if (!actor.isPlatformAdmin && !isCreator) {
    throw ApiError.forbidden('仅任务发起人可取消')
  }
  task.status = 'cancelled'
  await task.save()
  if (reason) {
    await TaskComment.create({
      task: id, org: orgId, author: actor.userId,
      content: `[取消] ${reason}`,
      mentions: []
    })
  }
  // 2026-07-13: 触发 task_cancelled — 推给所有 assignees + supervisors (业务相关人都知道)
  setImmediate(() => {
    publishTaskCancelled({
      task,
      actor,
      orgId,
      reason: reason || ''
    }).catch((e) => console.warn('[task.cancel] publishTaskCancelled error:', e.message))
  })
  return await detail({ id, orgId, actor })
}

// ─── 条目操作 ──────────────────────────────────

async function addItem({ id, orgId, item, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('assignees status archived').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  if (task.archived) throw ApiError.unprocessable('任务已归档,不可加条目')
  if (task.status === 'approved' || task.status === 'cancelled' || task.status === 'expired') {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可加条目`)
  }
  // 2026-07-09: 执行中不能加条目 (跟 update 同语义: 执行期间不能改任务结构)
  if (EXECUTION_STATUSES.includes(task.status)) {
    throw ApiError.unprocessable(`任务执行中(${task.status}),不可加条目`)
  }
  // 校验 assignee ⊂ assignees
  const ok = task.assignees.some((a) => refId(a.user) === String(item.assignee))
  if (!ok) throw ApiError.badRequest('条目执行人必须在任务执行人列表中')
  const created = await TaskItem.create({
    org: orgId,
    task: id,
    title: item.title,
    assignee: item.assignee,
    order: item.order || 0
  })
  await recomputeTaskState(id)
  return created.toObject()
}

async function toggleItem({ id, itemId, orgId, done, assignee, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('assignees status archived').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  if (task.archived) throw ApiError.unprocessable('任务已归档,不可勾选条目')
  if (task.status === 'approved' || task.status === 'cancelled' || task.status === 'expired') {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可勾选条目`)
  }
  const item = await TaskItem.findOne({ _id: itemId, org: orgId, task: id })
  if (!item) throw ApiError.notFound('条目不存在')
  // 权限: 条目 assignee 本人 / task.write
  // (requirePermission 已为 isPlatformAdmin 注入 ['*'] 通配符, perms.includes() 始终 true)
  const perms = (actor && actor.permissions) || []
  const isAssignee = String(item.assignee) === String(actor.userId)
  if (!isAssignee && !perms.includes('task.write')) {
    throw ApiError.forbidden('只能勾选分配给自己的条目')
  }
  // 重新分配(可选,需 task.write)
  if (assignee && String(assignee) !== String(item.assignee)) {
    if (!perms.includes('task.write')) {
      throw ApiError.forbidden('只有 task.write 可调整条目分配')
    }
    const ok = task.assignees.some((a) => String(a.user) === String(assignee))
    if (!ok) throw ApiError.badRequest('新执行人必须在任务执行人列表中')
    item.assignee = assignee
  }
  item.done = !!done
  item.doneBy = done ? actor.userId : null
  item.doneAt = done ? new Date() : null
  await item.save()
  await recomputeTaskState(id)
  return item.toObject()
}

// 删除条目 (2026-07-08): 配合挡板, 让用户删空 checklist 后能物理删除整个任务
//   2026-07-08 二改: 移除 archived 检查 — 物理删除已归档任务的配套动作, 必须放行
//     (toggleItem/addItem/addComment 仍保留 archived 拦截, 不影响此路径)
async function removeItem({ id, itemId, orgId, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id status archived creator').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  if (task.status === 'approved' || task.status === 'cancelled' || task.status === 'expired') {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可删条目`)
  }
  // 2026-07-09: 执行中不能删条目 — 但 §8.1 配套路径(物理删除任务前的清理)不受此约束
  //   物理删除任务路径走的是 archived + 终态检查, 不会走到这里
  if (EXECUTION_STATUSES.includes(task.status)) {
    throw ApiError.unprocessable(`任务执行中(${task.status}),不可删条目`)
  }
  // 2026-07-08 扩: 权限模型从「assignee/task.write」扩到「assignee/task.write/task.delete/任务 creator」
  //   死锁场景: 任务创建者想删整个任务, 但他不是 item.assignee, 又没 task.write → 永远清不掉 checklist
  //   → 任务本身也永远删不掉. 加 task.delete 持有者 (任务模块超管) + 任务 creator 两条, 解死锁.
  //   (requirePermission 已为 isPlatformAdmin 注入 ['*'] 通配符, perms.includes() 始终 true)
  const perms = (actor && actor.permissions) || []
  const item = await TaskItem.findOne({ _id: itemId, org: orgId, task: id }).select('assignee')
  if (!item) throw ApiError.notFound('条目不存在')
  const isAssignee = String(item.assignee) === String(actor.userId)
  const isCreator = refId(task.creator) === String(actor.userId)
  const isPlatformAdmin = !!(actor && actor.isPlatformAdmin)
  if (!isAssignee && !isCreator && !isPlatformAdmin && !perms.includes('task.write') && !perms.includes('task.delete')) {
    throw ApiError.forbidden('只能删除分配给自己的条目,或持有 task.write/task.delete,或是任务创建人')
  }
  await TaskItem.deleteOne({ _id: itemId, org: orgId, task: id })
  await recomputeTaskState(id)
  return { success: true, id: itemId }
}

// ─── 子任务备注 (2026-07-09 新增) ────────────────────
//   业务规则: 仅该 item.assignee 本人 / task.write 持有者可写
//   不受 "执行期间不可改" 锁约束 — 这是规则 3b 的豁免口子, 执行人必须能留备注
//   仍受 archived 约束 — 归档后一律不可操作
async function addItemRemark({ id, itemId, orgId, content, mentions, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id archived').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  if (task.archived) throw ApiError.unprocessable('任务已归档,不可加备注')
  const item = await TaskItem.findOne({ _id: itemId, org: orgId, task: id }).select('assignee')
  if (!item) throw ApiError.notFound('条目不存在')
  // 权限: item.assignee 本人 / task.write 持有者 (跟 toggleItem 一致)
  // (requirePermission 已为 isPlatformAdmin 注入 ['*'] 通配符)
  const perms = (actor && actor.permissions) || []
  const isAssignee = String(item.assignee) === String(actor.userId)
  if (!isAssignee && !perms.includes('task.write')) {
    throw ApiError.forbidden('仅本条目执行人或 task.write 可加备注')
  }
  item.remarks.push({
    author: actor.userId,
    content,
    mentions: mentions || []
  })
  await item.save()
  // 返回带 populate 的最新备注, 跟 addComment 风格一致
  const lastRemark = item.remarks[item.remarks.length - 1]
  return {
    _id: lastRemark._id,
    author: actor.userId,
    content: lastRemark.content,
    mentions: lastRemark.mentions,
    createdAt: lastRemark.createdAt
  }
}

// ─── 评论 ──────────────────────────────────────

async function addComment({ id, orgId, content, mentions, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id archived').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  if (task.archived) throw ApiError.unprocessable('任务已归档,不可评论;请先取消归档')
  const c = await TaskComment.create({
    task: id, org: orgId, author: actor.userId, content, mentions: mentions || []
  })
  return await TaskComment.findById(c._id).populate('author', 'realName avatar').lean()
}

// ─── 看板 ──────────────────────────────────────

async function kanban({ orgId, assignee, type, priority, scope, actor, view }) {
  // 2026-08-06 P2.2: ?view=byTag → 按标签分桶 (与原 4 状态桶并列, 不互斥)
  if (view === 'byTag') {
    return kanbanByTag({ orgId, assignee, type, priority, scope, actor })
  }
  // 2026-07-11: 与 list 同语义 — task.read.own 持有者能进接口但只能看自己的 (走 $or)
  const perms = (actor && actor.permissions) || []
  const canSeeAll = actor && (actor.isPlatformAdmin || perms.includes('task.read'))
  const baseFilter = { org: orgId, archived: { $ne: true } }
  if (assignee) baseFilter['assignees.user'] = assignee
  if (type) baseFilter.type = type
  if (priority) baseFilter.priority = priority
  if (!canSeeAll || scope === 'mine') {
    baseFilter.$or = [
      { creator: actor.userId },
      { 'assignees.user': actor.userId },
      { supervisors: actor.userId }
    ]
  }
  // 取 4 列 + 终态
  const tasks = await Task.find(baseFilter)
    .populate('creator', 'realName avatar')
    .populate('assignees.user', 'realName avatar')
    .sort({ dueAt: 1, priority: -1 })
    .lean()
  // 简单分桶
  const buckets = {
    todo: [],         // assigned
    inProgress: [],   // in_progress, partial_submitted, rejected (业务上等同 in_progress)
    pendingReview: [],// submitted
    done: []          // approved
  }
  for (const t of tasks) {
    if (t.status === 'assigned' || t.status === 'draft') buckets.todo.push(t)
    else if (['in_progress', 'partial_submitted', 'rejected'].includes(t.status)) buckets.inProgress.push(t)
    else if (t.status === 'submitted') buckets.pendingReview.push(t)
    else if (t.status === 'approved') buckets.done.push(t)
    // expired / cancelled 不进看板(避免污染)
  }
  return buckets
}

// 2026-08-06 P2.2: 看板按标签分组 (?view=byTag, 复用 R-3913 路径不新增 R 号)
//   每个 tag 一列, 每列内嵌原 4 状态子列 (todo/inProgress/pendingReview/done) — 与 status 看板"并列"而非互斥
//   复用 _bucketOf 状态→桶映射, 与原 kanban() 保持 100% 一致
function _bucketOf(status) {
  if (status === 'assigned' || status === 'draft') return 'todo'
  if (['in_progress', 'partial_submitted', 'rejected'].includes(status)) return 'inProgress'
  if (status === 'submitted') return 'pendingReview'
  if (status === 'approved') return 'done'
  return null  // expired / cancelled / 其他不进看板
}

async function kanbanByTag({ orgId, assignee, type, priority, scope, actor }) {
  const perms = (actor && actor.permissions) || []
  const canSeeAll = actor && (actor.isPlatformAdmin || perms.includes('task.read'))
  const baseFilter = { org: orgId, archived: { $ne: true }, tags: { $exists: true, $ne: [] } }
  if (assignee) baseFilter['assignees.user'] = assignee
  if (type) baseFilter.type = type
  if (priority) baseFilter.priority = priority
  if (!canSeeAll || scope === 'mine') {
    baseFilter.$or = [
      { creator: actor.userId },
      { 'assignees.user': actor.userId },
      { supervisors: actor.userId }
    ]
  }
  const tasks = await Task.find(baseFilter)
    .populate('creator', 'realName avatar')
    .populate('assignees.user', 'realName avatar')
    .sort({ dueAt: 1, priority: -1 })
    .lean()
  const byTag = {}
  for (const t of tasks) {
    const bucket = _bucketOf(t.status)
    if (!bucket) continue                                  // 终态不进看板
    for (const tag of (t.tags || [])) {
      if (!byTag[tag]) byTag[tag] = { todo: [], inProgress: [], pendingReview: [], done: [] }
      byTag[tag][bucket].push(t)
    }
  }
  const allTags = Object.keys(byTag).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return { byTag, allTags }
}

// ─── 统计 ──────────────────────────────────────

async function stats({ orgId, actor }) {
  const meId = actor.userId
  const now = new Date()
  const filter = { org: orgId, archived: { $ne: true } }
  // 限定到与我相关
  filter.$or = [
    { creator: meId },
    { 'assignees.user': meId },
    { supervisors: meId }
  ]
  const [mineTotal, mineDue, mineOverdue, mineSubmitted, mineReview] = await Promise.all([
    Task.countDocuments({ ...filter, status: { $in: ['assigned', 'in_progress', 'partial_submitted', 'rejected'] } }),
    Task.countDocuments({ ...filter, status: { $in: ['assigned', 'in_progress', 'partial_submitted'] }, dueAt: { $gte: now } }),
    Task.countDocuments({ ...filter, status: { $in: ['assigned', 'in_progress', 'partial_submitted'] }, dueAt: { $lt: now } }),
    Task.countDocuments({ ...filter, 'assignees.user': meId, 'assignees.status': 'submitted', status: { $in: ['partial_submitted', 'submitted'] } }),
    Task.countDocuments({ ...filter, supervisors: meId, status: 'submitted' })
  ])
  return { mineTotal, mineDue, mineOverdue, mineSubmitted, mineReview }
}

// ─── 过期扫描(cron 调) ───────────────────────

async function expireOverdue() {
  const now = new Date()
  const result = await Task.updateMany(
    { status: { $in: ['assigned', 'in_progress', 'partial_submitted', 'submitted', 'rejected'] }, dueAt: { $lt: now } },
    { $set: { status: 'expired' } }
  )
  return { modified: result.modifiedCount || 0 }
}

/**
 * (2026-07-11 v0.9 通知): 扫"今天到期"的任务, 给每个 assignee + supervisor 发 task_due 通知
 *   - 触发时机: taskCron 每分钟 tick, 任务 dueAt 是今天且当前时间 ≥ 当天 9:00 时
 *   - 幂等: 通过 Notification.findOne({ type, 'payload.entityId': taskId }) 防止重复发送
 *   - 单条失败不影响其他任务
 *
 * @returns {Promise<{notified: number, skipped: number, errors: number}>}
 */
async function notifyDueToday() {
  const notificationService = require('@modules/notification/notification.service')
  const Notification = require('@models/Notification.model')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  // 仅当当前 ≥ 9:00 才发 (一天只发一次, 上午提醒)
  if (now.getHours() < 9) return { notified: 0, skipped: 0, errors: 0 }

  const stats = { notified: 0, skipped: 0, errors: 0 }
  // 找今天到期、且非终态的任务
  const tasks = await Task.find({
    dueAt: { $gte: todayStart, $lte: todayEnd },
    status: { $nin: ['approved', 'cancelled', 'expired'] }
  })
    .select('_id org title dueAt assignees supervisors creator')
    .limit(200)
    .lean()
  if (!tasks.length) return stats

  for (const t of tasks) {
    try {
      // 幂等: 已发过则跳过
      const existing = await Notification.findOne({
        org: t.org,
        type: 'task_due',
        'payload.entityId': t._id
      }).select('_id').lean()
      if (existing) { stats.skipped++; continue }

      const recipients = new Set()
      for (const a of (t.assignees || [])) recipients.add(String(a.user))
      for (const s of (t.supervisors || [])) recipients.add(String(s))
      if (t.creator) recipients.add(String(t.creator))
      if (!recipients.size) { stats.skipped++; continue }

      for (const recipientId of recipients) {
        notificationService.publish({
          orgId: t.org,
          recipientId,
          type: 'task_due',
          payload: {
            entityType: 'task',
            entityId: t._id,
            deeplink: `/admin/tasks/${t._id}`
          },
          vars: {
            reason: t.title,
            time: t.dueAt ? `${String(t.dueAt.getMonth() + 1).padStart(2, '0')}-${String(t.dueAt.getDate()).padStart(2, '0')} ${String(t.dueAt.getHours()).padStart(2, '0')}:${String(t.dueAt.getMinutes()).padStart(2, '0')}` : ''
          },
          scheduledFor: null,
          source: 'cron'
        }).catch((e) => {
          console.warn('[task.notifyDueToday] publish error:', e.message)
        })
      }
      stats.notified++
    } catch (e) {
      stats.errors++
      console.warn('[task.notifyDueToday] task error:', e.message)
    }
  }
  return stats
}

// ─── 通知触发点 (2026-07-13) ───────────────────────
//
// 5 个新触发点: task_assigned / task_rejected / task_approved / task_cancelled
//   - 全部走 notificationService.publish({ recipientRole: 'staff' }) — 接收人是员工
//   - 单条失败不阻塞其他收件人 (for...of + .catch)
//   - 单条失败不阻塞主流程 (调用方 setImmediate + .catch)
//   - 模板占位符白名单: taskTitle / actorName / comment / score / dueAt / priority
//
// 共享变量计算:
//   - actorName       : actor 姓名 (查一次, 失败 fallback '上级' / '监督人' / '系统')
//   - dueAtText       : task.dueAt 友好文本 (沿用 notifyDueToday 写法)
//   - taskTitle       : task.title
//   - priority        : task.priority (友好中文)
//   - comment         : review/cancel 时的意见/原因

function formatDueText(d) {
  if (!d) return '无'
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return '无'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

const PRIORITY_LABELS = { urgent: '紧急', high: '高', normal: '普通', low: '低' }
function priorityLabel(p) { return PRIORITY_LABELS[p] || p || '普通' }

async function getActorName(actor) {
  if (!actor || !actor.userId) return '系统'
  const u = await User.findById(actor.userId).select('realName name').lean()
  return (u && (u.realName || u.name)) || '系统'
}

/**
 * task_assigned: 任务被分配
 * - create 时: 全体 assignees 都收
 * - update 时: 仅 diff 出的新 assignee 收 (caller 负责)
 * - deeplink: /admin/tasks/:id
 */
async function publishTaskAssigned({ task, recipientIds, actor, orgId }) {
  if (!Array.isArray(recipientIds) || !recipientIds.length) return
  const notificationService = require('@modules/notification/notification.service')
  const actorName = await getActorName(actor)
  const taskTitle = task.title || ''
  const dueAtText = formatDueText(task.dueAt)
  const priority = priorityLabel(task.priority)
  for (const recipientId of recipientIds) {
    if (!recipientId) continue
    notificationService
      .publish({
        orgId,
        recipientId: String(recipientId),
        recipientRole: 'staff',
        type: 'task_assigned',
        payload: {
          entityType: 'task',
          entityId: task._id,
          deeplink: `/admin/tasks/${task._id}`
        },
        vars: {
          taskTitle,
          actorName,
          dueAt: dueAtText,
          priority
        },
        scheduledFor: null,
        source: 'event'
      })
      .catch((e) => console.warn('[publishTaskAssigned] publish error:', e.message))
  }
}

/**
 * task_rejected: 监督人打回任务
 * - 接收人: 所有 assignees (被打回, 需修改重做)
 */
async function publishTaskRejected({ task, actor, orgId, reviewComment, reviewScore }) {
  const notificationService = require('@modules/notification/notification.service')
  const actorName = await getActorName(actor)
  const assignees = (task.assignees || []).map((a) => a.user).filter(Boolean)
  if (!assignees.length) return
  for (const recipientId of assignees) {
    notificationService
      .publish({
        orgId,
        recipientId: String(recipientId),
        recipientRole: 'staff',
        type: 'task_rejected',
        payload: {
          entityType: 'task',
          entityId: task._id,
          deeplink: `/admin/tasks/${task._id}`
        },
        vars: {
          taskTitle: task.title || '',
          actorName,
          comment: reviewComment || '无',
          score: reviewScore != null ? String(reviewScore) : ''
        },
        scheduledFor: null,
        source: 'event'
      })
      .catch((e) => console.warn('[publishTaskRejected] publish error:', e.message))
  }
}

/**
 * task_approved: 监督人通过任务
 * - 接收人: 所有 assignees + creator (发起人也想知道)
 */
async function publishTaskApproved({ task, actor, orgId, reviewComment, reviewScore }) {
  const notificationService = require('@modules/notification/notification.service')
  const actorName = await getActorName(actor)
  const recipients = new Set()
  for (const a of (task.assignees || [])) {
    if (a && a.user) recipients.add(String(a.user))
  }
  if (task.creator) recipients.add(String(task.creator))
  for (const recipientId of recipients) {
    notificationService
      .publish({
        orgId,
        recipientId,
        recipientRole: 'staff',
        type: 'task_approved',
        payload: {
          entityType: 'task',
          entityId: task._id,
          deeplink: `/admin/tasks/${task._id}`
        },
        vars: {
          taskTitle: task.title || '',
          actorName,
          comment: reviewComment || '',
          score: reviewScore != null ? String(reviewScore) : ''
        },
        scheduledFor: null,
        source: 'event'
      })
      .catch((e) => console.warn('[publishTaskApproved] publish error:', e.message))
  }
}

/**
 * task_cancelled: 任务被取消
 * - 接收人: 所有 assignees + supervisors + creator
 */
async function publishTaskCancelled({ task, actor, orgId, reason }) {
  const notificationService = require('@modules/notification/notification.service')
  const actorName = await getActorName(actor)
  const recipients = new Set()
  for (const a of (task.assignees || [])) {
    if (a && a.user) recipients.add(String(a.user))
  }
  for (const s of (task.supervisors || [])) {
    if (s) recipients.add(String(s))
  }
  if (task.creator) recipients.add(String(task.creator))
  for (const recipientId of recipients) {
    notificationService
      .publish({
        orgId,
        recipientId,
        recipientRole: 'staff',
        type: 'task_cancelled',
        payload: {
          entityType: 'task',
          entityId: task._id,
          deeplink: `/admin/tasks/${task._id}`
        },
        vars: {
          taskTitle: task.title || '',
          actorName,
          comment: reason || ''
        },
        scheduledFor: null,
        source: 'event'
      })
      .catch((e) => console.warn('[publishTaskCancelled] publish error:', e.message))
  }
}

// ─── 模板 ──────────────────────────────────────

function computeNextRunAt(schedule, fromDate = new Date()) {
  // 简单实现: 找到 fromDate 之后的下一个匹配时刻
  // 规则: 同一时刻 0~23 hour 中匹配
  const from = new Date(fromDate)
  if (schedule.kind === 'daily') {
    const hours = schedule.hour && schedule.hour.length > 0 ? schedule.hour : [9]
    // 找今天 next hour
    for (let h = 0; h < 24; h++) {
      if (hours.includes(h) && h > from.getHours()) {
        const d = new Date(from); d.setHours(h, 0, 0, 0); return d
      }
    }
    // 否则明天第一个 hour
    const d = new Date(from); d.setDate(d.getDate() + 1); d.setHours(hours[0], 0, 0, 0); return d
  }
  if (schedule.kind === 'weekly') {
    const weekdays = schedule.weekdays || []
    const hours = schedule.hour && schedule.hour.length > 0 ? schedule.hour : [9]
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(from); d.setDate(d.getDate() + offset)
      if (weekdays.includes(d.getDay())) {
        for (const h of hours) {
          if (offset === 0 && h <= from.getHours()) continue
          d.setHours(h, 0, 0, 0)
          return d
        }
      }
    }
    return null
  }
  if (schedule.kind === 'monthly') {
    const days = schedule.daysOfMonth || []
    const hours = schedule.hour && schedule.hour.length > 0 ? schedule.hour : [9]
    for (let offset = 0; offset < 31; offset++) {
      const d = new Date(from); d.setDate(d.getDate() + offset)
      if (days.includes(d.getDate())) {
        for (const h of hours) {
          if (offset === 0 && h <= from.getHours()) continue
          d.setHours(h, 0, 0, 0)
          return d
        }
      }
    }
    return null
  }
  // cron kind: 留口子,阶段 2 实现
  return null
}

async function templateCreate({ orgId, body, actor }) {
  await assertUsersInOrg(orgId, [...(body.defaultAssignees || []).map((a) => a.user), ...(body.defaultSupervisors || [])])
  const schedule = body.schedule
  const nextRunAt = computeNextRunAt(schedule)
  const tpl = await TaskTemplate.create({
    org: orgId,
    title: body.title,
    description: body.description || '',
    type: body.type || 'other',
    priority: body.priority || 'normal',
    defaultAssignees: body.defaultAssignees || [],
    defaultSupervisors: body.defaultSupervisors,
    itemTemplates: body.itemTemplates || [],
    // 2026-08-06 P3.1: 模板默认标签 — 复用 P0.2 _sanitizeTags 统一清洗
    defaultTags: _sanitizeTags(body.defaultTags || []),
    schedule,
    nextRunAt,
    isActive: body.isActive !== false,
    createdBy: actor.userId
  })
  return tpl.toObject()
}

async function templateList({ orgId, page, pageSize, isActive }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (isActive != null) filter.isActive = isActive
  const [items, total] = await Promise.all([
    TaskTemplate.find(filter)
      .populate('defaultAssignees.user', 'realName')
      .populate('defaultSupervisors', 'realName')
      .populate('createdBy', 'realName')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    TaskTemplate.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function templateUpdate({ id, orgId, body }) {
  const tpl = await TaskTemplate.findOne({ _id: id, org: orgId })
  if (!tpl) throw ApiError.notFound('模板不存在')
  // 2026-08-06 P3.1: defaultTags 单独处理, 写库前过 _sanitizeTags
  const fields = ['title', 'description', 'type', 'priority', 'defaultAssignees', 'defaultSupervisors', 'itemTemplates', 'isActive']
  for (const f of fields) {
    if (body[f] != null) tpl[f] = body[f]
  }
  if (body.defaultTags != null) tpl.defaultTags = _sanitizeTags(body.defaultTags)
  if (body.schedule != null) {
    tpl.schedule = body.schedule
    tpl.nextRunAt = computeNextRunAt(body.schedule)
  }
  await tpl.save()
  return tpl.toObject()
}

/**
 * 2026-08-05: 模板删除互锁补漏 (审计 H10 §8.1)
 *   之前 templateRemove 直接 TaskTemplate.deleteOne, 无 assertUnused 互锁:
 *     - Task.fromTemplate (required 默认值 = null, 但实例化过的 Task 该字段非空) 会悬空
 *     - TaskGenerationLog.template (required: true 强 ref) 会悬空, join 报表失败
 *   现在按 §8.1 范式补 templateUsageChecks + assertUnused, 与 task.taskUsageChecks 共用风格.
 */
function templateUsageChecks(orgId, templateId) {
  return [
    {
      model: Task, filter: { org: orgId, fromTemplate: templateId },
      label: '模板生成的 Task 实例', hint: '请先删除/解绑由该模板生成的任务后再删模板'
    },
    {
      model: TaskGenerationLog, filter: { org: orgId, template: templateId },
      label: '模板生成日志', hint: '请先清理该模板的生成日志记录后再删模板'
    }
  ]
}

async function templateRemove({ id, orgId }) {
  const tpl = await TaskTemplate.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!tpl) throw ApiError.notFound('模板不存在')
  // 互锁 (审计 H10)
  await removable.assertUnused(orgId, templateUsageChecks(orgId, tpl._id))
  const r = await TaskTemplate.deleteOne({ _id: tpl._id, org: orgId })
  if (r.deletedCount === 0) throw ApiError.conflict('模板已被他人操作，请刷新后重试')
  return { success: true, id }
}

/**
 * R-3917 配套预检端点 (供前端删除按钮弹挡板)
 * 2026-08-05: 与 service.templateRemove 走同一组 templateUsageChecks, 预检与实际删除语义完全一致
 */
async function templateRemovableCheck({ id, orgId }) {
  const tpl = await TaskTemplate.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!tpl) return { canRemove: false, blockers: [{ entity: 'TaskTemplate', label: '任务模板', count: 0, hint: '该模板不存在或不属于本机构' }] }
  return removable.check(orgId, templateUsageChecks(orgId, tpl._id))
}

async function templateRunNow({ id, orgId, actor }) {
  const tpl = await TaskTemplate.findOne({ _id: id, org: orgId })
  if (!tpl) throw ApiError.notFound('模板不存在')
  return await generateFromTemplate(tpl, actor, true)
}

/**
 * 由 scheduler 调度的"根据模板生成 Task 实例"核心逻辑
 *   - orgId 从模板取
 *   - 把模板的 defaultAssignees/defaultSupervisors 复制成 Task
 *   - 把 itemTemplates 展开为 TaskItem(assignee 默认给 defaultAssignees[0])
 *   - dueAt = now + 24h(简单实现;阶段 2 可加 dueOffsetHours)
 *   - 写 TaskGenerationLog
 */
async function generateFromTemplate(tpl, actor, isManualRun = false) {
  const now = new Date()
  try {
    const assignees = (tpl.defaultAssignees || []).map((a) => a.user)
    const firstAssignee = assignees[0]
    const task = await Task.create({
      org: tpl.org,
      title: tpl.title,
      description: tpl.description,
      type: tpl.type,
      priority: tpl.priority,
      creator: actor ? actor.userId : tpl.createdBy,
      assignees: assignees.map((u) => ({ user: u, status: 'not_started', progress: 0 })),
      supervisors: tpl.defaultSupervisors,
      startAt: now,
      dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: 'assigned',
      progress: 0,
      // 2026-08-06 P3.1: 模板 defaultTags 兜底向后兼容 — 无 defaultTags 时仍写 ['周期任务']
      //   用户在模板编辑里把 defaultTags 设为 [], 这里就走空数组, 完全去掉
      tags: _sanitizeTags(tpl.defaultTags && tpl.defaultTags.length ? tpl.defaultTags : ['周期任务']),
      fromTemplate: tpl._id
    })
    if (tpl.itemTemplates && tpl.itemTemplates.length > 0) {
      await TaskItem.insertMany(tpl.itemTemplates.map((it) => ({
        org: tpl.org,
        task: task._id,
        title: it.title,
        assignee: firstAssignee, // 阶段 1 简化: 全部给第一个执行人
        order: it.order || 0,
        done: false
      })))
    }
    tpl.lastRunAt = now
    tpl.nextRunAt = isManualRun ? tpl.nextRunAt : computeNextRunAt(tpl.schedule, now)
    await tpl.save()
    await TaskGenerationLog.create({
      template: tpl._id,
      org: tpl.org,
      task: task._id,
      runAt: now,
      status: 'success',
      scheduledFor: tpl.nextRunAt
    })
    // 2026-07-14: 模板"立即跑"生成的任务 = 同样需要给 assignees 发 task_assigned 通知
    //   跟 service.create 保持一致 (setImmediate fire-and-forget, 单条失败不阻塞)
    // 2026-08-02: 监督人也要收
    const allRecipientIds = Array.from(new Set([...assignees, ...((task.supervisors || []).map(String))].map(String)))
    if (allRecipientIds.length > 0) {
      setImmediate(() => {
        publishTaskAssigned({
          task,
          recipientIds: allRecipientIds,
          actor,
          orgId: tpl.org
        }).catch((e) => console.warn('[generateFromTemplate] publishTaskAssigned error:', e.message))
      })
    }
    return { task: task.toObject(), template: tpl.toObject() }
  } catch (e) {
    await TaskGenerationLog.create({
      template: tpl._id,
      org: tpl.org,
      runAt: now,
      status: 'failed',
      error: e.message
    })
    throw e
  }
}

async function templatePause({ id, orgId }) {
  const tpl = await TaskTemplate.findOne({ _id: id, org: orgId })
  if (!tpl) throw ApiError.notFound('模板不存在')
  tpl.isActive = false
  tpl.nextRunAt = null
  await tpl.save()
  return tpl.toObject()
}

async function templateResume({ id, orgId }) {
  const tpl = await TaskTemplate.findOne({ _id: id, org: orgId })
  if (!tpl) throw ApiError.notFound('模板不存在')
  tpl.isActive = true
  tpl.nextRunAt = computeNextRunAt(tpl.schedule)
  await tpl.save()
  return tpl.toObject()
}

/**
 * 2026-08-06: R-3925 P1.2 — 本机构所有出现过的标签去重 + 字典序。
 * 走 Mongoose Model.distinct (multikey 索引 {org, tags} 直接命中, 万级 < 50ms)。
 * 已归档任务的标签不进选项 (前端 TagEditor suggestions 应只提示"当前活跃"标签)。
 */
async function distinctTags({ orgId }) {
  const raw = await Task.distinct('tags', { org: orgId, archived: { $ne: true } })
  return raw
    .filter((t) => typeof t === 'string' && t.trim())
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

module.exports = {
  // 列表/详情/CRUD
  list,
  detail,
  create,
  update,
  remove,
  removableCheck,
  // 可派任务员工下拉 (R-3924, 2026-08-02)
  assignableUsers,
  // 标签历史 (R-3925, 2026-08-06 P1.2)
  distinctTags,
  // 归档 (2026-07-08)
  archive,
  unarchive,
  // 状态机
  submit,
  review,
  cancel,
  // 条目
  addItem,
  toggleItem,
  removeItem,
  // 子任务备注 (2026-07-09, 规则 3b 豁免)
  addItemRemark,
  // 评论
  addComment,
  // 看板/统计
  kanban,
  kanbanByTag,   // 2026-08-06 P2.2 — 内部走 ?view=byTag 分支, 不外部直接调
  stats,
  // cron
  expireOverdue,
  notifyDueToday,
  // 模板
  templateCreate,
  templateList,
  templateUpdate,
  templateRemove,
  templateRemovableCheck, // 2026-08-05: R-3917 配套预检 (审计 H10)
  templateRunNow,
  templatePause,
  templateResume,
  // 内部
  generateFromTemplate,
  computeNextRunAt,
  recomputeTaskState,
  // 通知触发 (2026-07-13)
  publishTaskAssigned,
  publishTaskRejected,
  publishTaskApproved,
  publishTaskCancelled
}