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
 *   - 物理删除走 §8.1 三重防护: 路由 requirePlatformPassword + service removableCheck
 */

const Task = require('@models/Task.model')
const TaskItem = require('@models/TaskItem.model')
const TaskReview = require('@models/TaskReview.model')
const TaskComment = require('@models/TaskComment.model')
const TaskTemplate = require('@models/TaskTemplate.model')
const TaskGenerationLog = require('@models/TaskGenerationLog.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
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
 */
async function assertUsersInOrg(orgId, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return
  const idSet = new Set(userIds.map((id) => String(id)))
  const rels = await UserOrgRel.find({
    org: orgId,
    user: { $in: [...idSet] },
    isActive: true
  }).select('user').lean()
  const found = new Set(rels.map((r) => String(r.user)))
  for (const id of userIds) {
    if (!found.has(String(id))) {
      throw ApiError.badRequest(`用户 ${id} 不属于本机构或已停用`)
    }
  }
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
 */
async function recomputeTaskState(taskId) {
  const task = await Task.findById(taskId)
  if (!task) return null
  if (['approved', 'expired', 'cancelled', 'submitted', 'rejected'].includes(task.status)) {
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
 */
async function canViewTask(actor, task) {
  if (!actor) return false
  if (actor.isPlatformAdmin) return true
  // actor.permissions 是后端 requirePermission 中间件解析后的数组
  const perms = actor.permissions || []
  if (perms.includes('task.read')) return true
  if (String(task.creator) === String(actor.userId)) return true
  if ((task.assignees || []).some((a) => String(a.user) === String(actor.userId))) return true
  if ((task.supervisors || []).some((s) => String(s) === String(actor.userId))) return true
  return false
}

// ─── 列表 ──────────────────────────────────────

async function list({ orgId, status, type, priority, assignee, creator, supervisor, myRole, keyword, dueBefore, dueAfter, page, pageSize, actor }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (status) filter.status = status
  if (type) filter.type = type
  if (priority) filter.priority = priority
  if (assignee) filter['assignees.user'] = assignee
  if (creator) filter.creator = creator
  if (supervisor) filter.supervisors = supervisor
  if (keyword) filter.title = { $regex: keyword, $options: 'i' }
  if (dueBefore || dueAfter) {
    filter.dueAt = {}
    if (dueBefore) filter.dueAt.$lte = new Date(dueBefore)
    if (dueAfter) filter.dueAt.$gte = new Date(dueAfter)
  }
  // 可见性: 无 task.read 时只能看自己相关
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

async function detail({ id, orgId, actor }) {
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
  // 关联 items / reviews / comments
  const [items, reviews, comments] = await Promise.all([
    TaskItem.find({ task: id }).populate('assignee', 'realName avatar').populate('doneBy', 'realName').sort({ order: 1, createdAt: 1 }).lean(),
    TaskReview.find({ task: id }).populate('reviewer', 'realName avatar').sort({ reviewedAt: -1 }).lean(),
    TaskComment.find({ task: id }).populate('author', 'realName avatar').sort({ createdAt: 1 }).lean()
  ])
  return { ...task, items, reviews, comments }
}

// ─── 创建 ──────────────────────────────────────

async function create({ orgId, title, description, type, priority, creator, assignees, supervisors, startAt, dueAt, tags, relatedTo, items = [] }) {
  if (!Array.isArray(assignees) || assignees.length === 0) {
    throw ApiError.badRequest('至少 1 个执行人')
  }
  if (!Array.isArray(supervisors) || supervisors.length === 0) {
    throw ApiError.badRequest('至少 1 个监督人')
  }
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
    tags: tags || [],
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
  return await detail({ id: task._id, orgId, actor: { userId: creator, isPlatformAdmin: false, permissions: [] } })
}

// ─── 编辑 ──────────────────────────────────────

async function update({ id, orgId, body, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  // 权限: creator / 持有 task.write
  const perms = (actor && actor.permissions) || []
  const isCreator = String(task.creator) === String(actor.userId)
  const canWrite = perms.includes('task.write')
  if (!isCreator && !canWrite) {
    throw ApiError.forbidden('仅任务发起人或持有 task.write 可编辑')
  }
  // 终态不能编辑业务字段
  if (['approved', 'cancelled', 'expired'].includes(task.status)) {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可编辑`)
  }
  if (body.title != null) task.title = body.title
  if (body.description != null) task.description = body.description
  if (body.type != null) task.type = body.type
  if (body.priority != null) task.priority = body.priority
  if (body.startAt !== undefined) task.startAt = body.startAt
  if (body.dueAt != null) task.dueAt = body.dueAt
  if (body.tags != null) task.tags = body.tags
  if (body.supervisors != null) {
    await assertUsersInOrg(orgId, body.supervisors)
    task.supervisors = body.supervisors
  }
  if (body.assignees != null) {
    await assertUsersInOrg(orgId, body.assignees)
    task.assignees = body.assignees.map((u) => ({ user: u, status: 'not_started', progress: 0 }))
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

function taskUsageChecks(orgId, taskId) {
  return [
    {
      model: TaskItem,
      filter: { org: orgId, task: taskId },
      label: '任务条目',
      hint: '请先删除该任务的 checklist 条目'
    },
    {
      model: TaskReview,
      filter: { org: orgId, task: taskId },
      label: '任务核查记录',
      hint: '请先删除该任务的核查历史'
    },
    {
      model: TaskComment,
      filter: { org: orgId, task: taskId },
      label: '任务评论',
      hint: '请先删除该任务的评论'
    }
  ]
}

async function remove({ id, orgId }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id status').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  await removable.assertUnused(orgId, taskUsageChecks(orgId, id))
  // 级联删除子表
  await Promise.all([
    TaskItem.deleteMany({ org: orgId, task: id }),
    TaskReview.deleteMany({ org: orgId, task: id }),
    TaskComment.deleteMany({ org: orgId, task: id }),
    Task.deleteOne({ _id: id, org: orgId })
  ])
  return { success: true, id }
}

async function removableCheck({ id, orgId }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id status').lean()
  if (!task) {
    return {
      canRemove: false,
      blockers: [{ entity: 'Task', label: '任务', count: 0, hint: '该任务不存在或不属于本机构' }]
    }
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

// ─── 状态机：执行人提交 ────────────────────────

async function submit({ id, orgId, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  if (!['assigned', 'in_progress', 'partial_submitted', 'rejected'].includes(task.status)) {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可提交`)
  }
  const me = task.assignees.find((a) => String(a.user) === String(actor.userId))
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
  } else if (result === 'rejected' || result === 'requested_changes') {
    task.status = 'rejected'
    // 执行人状态退回 in_progress,允许重做
    for (const a of task.assignees) {
      if (a.status === 'submitted') {
        a.status = 'in_progress'
        a.submittedAt = null
      }
    }
  }
  await task.save()
  await recomputeProgressOnly(task)
  return await detail({ id, orgId, actor })
}

// ─── 状态机：取消 ──────────────────────────────

async function cancel({ id, orgId, reason, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId })
  if (!task) throw ApiError.notFound('任务不存在')
  if (['approved', 'cancelled', 'expired'].includes(task.status)) {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可取消`)
  }
  // 权限: creator / 持有 task.write
  const perms = (actor && actor.permissions) || []
  const isCreator = String(task.creator) === String(actor.userId)
  if (!isCreator && !perms.includes('task.write')) {
    throw ApiError.forbidden('仅任务发起人或持有 task.write 可取消')
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
  return await detail({ id, orgId, actor })
}

// ─── 条目操作 ──────────────────────────────────

async function addItem({ id, orgId, item, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('assignees').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  if (task.status === 'approved' || task.status === 'cancelled' || task.status === 'expired') {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可加条目`)
  }
  // 校验 assignee ⊂ assignees
  const ok = task.assignees.some((a) => String(a.user) === String(item.assignee))
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
  const task = await Task.findOne({ _id: id, org: orgId }).select('assignees status').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  if (task.status === 'approved' || task.status === 'cancelled' || task.status === 'expired') {
    throw ApiError.unprocessable(`任务当前状态 ${task.status} 不可勾选条目`)
  }
  const item = await TaskItem.findOne({ _id: itemId, org: orgId, task: id })
  if (!item) throw ApiError.notFound('条目不存在')
  // 权限: 条目 assignee 本人 / task.write
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

// ─── 评论 ──────────────────────────────────────

async function addComment({ id, orgId, content, mentions, actor }) {
  const task = await Task.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!task) throw ApiError.notFound('任务不存在')
  const c = await TaskComment.create({
    task: id, org: orgId, author: actor.userId, content, mentions: mentions || []
  })
  return await TaskComment.findById(c._id).populate('author', 'realName avatar').lean()
}

// ─── 看板 ──────────────────────────────────────

async function kanban({ orgId, assignee, type, priority, scope, actor }) {
  const perms = (actor && actor.permissions) || []
  const canSeeAll = actor && (actor.isPlatformAdmin || perms.includes('task.read'))
  const baseFilter = { org: orgId }
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

// ─── 统计 ──────────────────────────────────────

async function stats({ orgId, actor }) {
  const meId = actor.userId
  const now = new Date()
  const filter = { org: orgId }
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
  const fields = ['title', 'description', 'type', 'priority', 'defaultAssignees', 'defaultSupervisors', 'itemTemplates', 'isActive']
  for (const f of fields) {
    if (body[f] != null) tpl[f] = body[f]
  }
  if (body.schedule != null) {
    tpl.schedule = body.schedule
    tpl.nextRunAt = computeNextRunAt(body.schedule)
  }
  await tpl.save()
  return tpl.toObject()
}

async function templateRemove({ id, orgId }) {
  const r = await TaskTemplate.deleteOne({ _id: id, org: orgId })
  if (r.deletedCount === 0) throw ApiError.notFound('模板不存在')
  return { success: true, id }
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
      tags: ['周期任务'],
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

module.exports = {
  // 列表/详情/CRUD
  list,
  detail,
  create,
  update,
  remove,
  removableCheck,
  // 状态机
  submit,
  review,
  cancel,
  // 条目
  addItem,
  toggleItem,
  // 评论
  addComment,
  // 看板/统计
  kanban,
  stats,
  // cron
  expireOverdue,
  // 模板
  templateCreate,
  templateList,
  templateUpdate,
  templateRemove,
  templateRunNow,
  templatePause,
  templateResume,
  // 内部
  generateFromTemplate,
  computeNextRunAt,
  recomputeTaskState
}