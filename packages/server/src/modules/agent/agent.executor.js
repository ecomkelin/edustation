'use strict'

/**
 * AI 助手 - 工具执行器
 *
 * 职责:
 *  1. 权限校验 (复用 requirePermission 的逻辑, 返回 Set 不 throw)
 *  2. 高风险工具 dry-run: 返回 pendingConfirmation 给前端, 不落库
 *  3. 普通工具/已确认的高风险: 动态 require 业务 service 并执行
 *  4. 参数适配: 把 LLM 给的扁平参数映射到各 service 自己的入参形态
 *  5. 结果截断: 避免大响应撑爆 LLM token
 *
 * 设计取舍:
 *  - 落库一律走业务 service 方法, 不在 executor 内自己实现, 享受既有的:
 *    422 互锁 / 状态机校验 / 事务回滚 / audit log
 *  - 权限校验复用 UserOrgRel 聚合, 与 requirePermission 中间件保持一致 (避免漂移)
 */

const mongoose = require('mongoose')
const UserOrgRel = require('@models/UserOrgRel.model')
const TrialBooking = require('@models/TrialBooking.model')
const ApiError = require('@utils/ApiError')
const { allPermissions } = require('@shared/permissions')
const { dispatchTable } = require('./agent.tools')

const MAX_RESULT_CHARS = 4000 // 单个 tool_result 文本上限

/* ─── 权限聚合 (与 middlewares/requirePermission.js 同源) ───────── */

const _permCache = new Map()
async function getUserPerms(user, orgId) {
  if (user.isPlatformAdmin) return new Set(allPermissions)
  const key = `${user.id}:${orgId}`
  if (_permCache.has(key)) return _permCache.get(key)
  const rel = await UserOrgRel.findOne({ user: user.id, org: orgId })
    .populate({ path: 'positions', match: { isActive: { $ne: false } }, select: 'permissions' })
    .lean()
  const set = new Set()
  if (rel) {
    for (const p of rel.positions || []) {
      for (const code of p.permissions || []) set.add(code)
    }
  }
  _permCache.set(key, set)
  // 30 秒过期, 避免 stale
  setTimeout(() => _permCache.delete(key), 30_000)
  return set
}

function clearPermCache(userId, orgId) {
  if (userId && orgId) _permCache.delete(`${userId}:${orgId}`)
  else _permCache.clear()
}

/* ─── 参数适配 (各 service 签名不一致, 在此统一映射) ───────── */

/**
 * 把 LLM 给的 args 翻译成 service 期望的入参。
 * 返回 { svcModule, svcFn, args }，由调用方 invoke。
 */
async function resolveInvocation({ toolName, args, currentUser, orgId }) {
  const meta = dispatchTable[toolName]
  if (!meta) throw ApiError.badRequest(`unknown tool: ${toolName}`)

  switch (toolName) {
    case 'create_parent_with_child':
      return {
        svcModule: meta.module, svcFn: meta.fn,
        args: { orgId, currentUser, body: pickArgs(args, ['phone', 'name', 'gender', 'age', 'school', 'grade', 'className', 'trialSubjects', 'source', 'promoteBy', 'consultant', 'inviteTeacher', 'remark', 'expectedTime', 'force']) }
      }
    case 'search_parents':
      return {
        svcModule: meta.module, svcFn: meta.fn,
        args: { orgId, currentUser, ...pickArgs(args, ['keyword', 'phone', 'lifecycle', 'tag', 'source', 'promoteBy', 'consultant', 'from', 'to', 'page', 'pageSize']) }
      }
    case 'get_parent_detail':
      return {
        svcModule: meta.module, svcFn: meta.fn,
        args: [args.id, orgId]
      }
    case 'log_parent_activity': {
      // tool 入参 {parentId, childLeadId, type, content}; service 入参 (id, orgId, currentUser, body)
      //   - id 是 childLeadId
      //   - body 是 {type, content, at?}
      const { childLeadId, type, content, at } = args
      return {
        svcModule: meta.module, svcFn: meta.fn,
        args: [childLeadId, orgId, currentUser, { type, content, at }]
      }
    }
    case 'batch_schedule_trials': {
      const body = {
        bookingIds: args.bookingIds,
        plannedStartTime: args.plannedStartTime,
        plannedEndTime: args.plannedEndTime,
        teacher: args.teacher,
        room: args.room,
        notes: args.notes
      }
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, currentUser, body } }
    }
    case 'check_in_trial': {
      const body = { actualStartTime: args.actualStartTime }
      return { svcModule: meta.module, svcFn: meta.fn, args: { id: args.bookingId, orgId, currentUser, body } }
    }
    case 'complete_trial': {
      const body = {
        actualEndTime: args.actualEndTime,
        result: args.result
      }
      return { svcModule: meta.module, svcFn: meta.fn, args: { id: args.bookingId, orgId, currentUser, body } }
    }
    case 'convert_trial':
      return { svcModule: meta.module, svcFn: meta.fn, args: { id: args.bookingId, orgId, currentUser } }
    case 'unconvert_trial': {
      // tool 入参 bookingId → childLeadId 转换
      if (!mongoose.isValidObjectId(args.bookingId)) throw ApiError.badRequest('bookingId 非法')
      const tb = await TrialBooking.findOne({ _id: args.bookingId, org: orgId }).select('preStudent').lean()
      if (!tb) throw ApiError.notFound('试听预约不存在')
      return {
        svcModule: meta.module, svcFn: meta.fn,
        args: { id: tb.preStudent, orgId, currentUser }
      }
    }
    case 'search_students':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, ...pickArgs(args, ['keyword', 'mobile', 'school', 'isActive', 'page', 'pageSize']) } }
    case 'get_student_detail':
      return { svcModule: meta.module, svcFn: meta.fn, args: [args.id, orgId] }
    case 'create_student': {
      // service 入参 { orgId, name, gender, birthday, guardianMobile, guardians, school, grade, className, notes }
      const body = pickArgs(args, ['name', 'gender', 'birthday', 'guardianMobile', 'school', 'grade', 'className', 'notes'])
      if (!body.guardianMobile) throw ApiError.badRequest('guardianMobile 必填')
      return { svcModule: meta.module, svcFn: meta.fn, args: { ...body, orgId } }
    }
    case 'list_lesson_calendar':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, ...pickArgs(args, ['from', 'to', 'teacher', 'room']) } }
    case 'complete_attendance': {
      // service 入参 { id, orgId, actualEndTime, remark, studentProduct }
      return {
        svcModule: meta.module, svcFn: meta.fn,
        args: { id: args.attendanceId, orgId, actualEndTime: args.actualEndTime, remark: null }
      }
    }
    case 'create_order': {
      // order.service.create 签名 ({orgId, student, items, actualPrice?, paymentMethod?, paidAmount?, remark?, agreements?, actor})
      // 与其他 service 不同, 没有 {body} 包装, 也没有 currentUser
      const { student, items, actualPrice, paymentMethod, paidAmount, remark } = args
      return {
        svcModule: meta.module, svcFn: meta.fn,
        args: {
          orgId, student, items, actualPrice, paymentMethod, paidAmount, remark,
          actor: { userId: currentUser.id }
        }
      }
    }
    case 'pay_order':
      return { svcModule: meta.module, svcFn: meta.fn, args: { id: args.orderId, orgId, paymentMethod: args.paymentMethod, paidAmount: args.paidAmount } }
    case 'list_subjects':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, keyword: args.keyword } }
    // ─── 今日工作台 (2026-06-23) ─────────
    // 7 个新工具全部是 read 风险, 入参只透传 limit/threshold 等可选参数
    case 'today_appointments':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId } }
    case 'today_lessons':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId } }
    case 'considering_parents':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, limit: args.limit } }
    case 'pending_followup_parents':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, staleDays: args.staleDays, limit: args.limit } }
    case 'starving_pets':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, threshold: args.threshold, limit: args.limit } }
    case 'low_points_students':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, threshold: args.threshold, limit: args.limit } }
    case 'low_classpack_students':
      return { svcModule: meta.module, svcFn: meta.fn, args: { orgId, threshold: args.threshold, limit: args.limit } }
    default:
      throw ApiError.badRequest(`tool ${toolName} 参数适配未实现`)
  }
}

/* ─── 中文摘要 (UI 显示) ───────── */

function buildSummary(toolName, args) {
  try {
    switch (toolName) {
      case 'create_parent_with_child':
        return `录入家长 ${args.phone || '?'} + 孩子 ${args.name || '?'}`
      case 'search_parents':
        return `查询家长: ${args.keyword || args.phone || (args.lifecycle ? `lifecycle=${args.lifecycle}` : '全部')}`
      case 'get_parent_detail':
        return `查看家长详情 (id=${args.id})`
      case 'log_parent_activity':
        return `记录触点 (${args.type}) 给家长 ${args.parentId || ''}`
      case 'batch_schedule_trials':
        return `批量排 ${(args.bookingIds || []).length} 笔试听课 (${args.plannedStartTime})`
      case 'check_in_trial':
        return `试听课到店打卡 (bookingId=${args.bookingId})`
      case 'complete_trial':
        return `完成试听 (bookingId=${args.bookingId})`
      case 'convert_trial':
        return `试听转学员 (bookingId=${args.bookingId}) — 将建家长账号 + 学员档案`
      case 'unconvert_trial':
        return `撤销转化 (bookingId=${args.bookingId})`
      case 'search_students':
        return `查询学员: ${args.keyword || args.mobile || '全部'}`
      case 'get_student_detail':
        return `查看学员详情 (id=${args.id})`
      case 'create_student':
        return `创建学员 ${args.name || '?'} (监护人 ${args.guardianMobile || '?'})`
      case 'list_lesson_calendar':
        return `查课表 (${args.from || '?'} ~ ${args.to || '?'})`
      case 'complete_attendance':
        return `标完成考勤 (id=${args.attendanceId})`
      case 'create_order':
        return `创建订单 (学员=${args.student || '?'}, ${(args.items || []).length} 项)`
      case 'pay_order':
        return `支付订单 ${args.orderId || '?'} 金额 ${args.paidAmount || '?'}`
      case 'list_subjects':
        return `查学科列表 (${args.keyword || '全部'})`
      // ─── 今日工作台 (2026-06-23) ─────────
      case 'today_appointments':
        return '查今日试听预约 + 今日需到校老师'
      case 'today_lessons':
        return '查今日排课 + 学生名单 + 今日需到校老师'
      case 'considering_parents':
        return '查考虑中家长 (lifecycle=considering)'
      case 'pending_followup_parents':
        return `查待跟进潜客家长 (距上次联系 > ${args.staleDays || 7} 天)`
      case 'starving_pets':
        return `查快饿死的学员宠物 (饥饿度 <= ${args.threshold != null ? args.threshold : 20})`
      case 'low_points_students':
        return `查积分余额 <= ${args.threshold != null ? args.threshold : 10} 的学员`
      case 'low_classpack_students':
        return `查剩余课时 <= ${args.threshold != null ? args.threshold : 3} 的活跃课包 (需续费)`
      default:
        return `执行 ${toolName}`
    }
  } catch (_) {
    return `执行 ${toolName}`
  }
}

/* ─── 截断工具结果, 避免 LLM token 爆 ───────── */

function truncate(value, max = MAX_RESULT_CHARS) {
  let s
  try {
    s = JSON.stringify(value)
  } catch (_) {
    s = String(value)
  }
  if (s.length <= max) return value
  return { _truncated: true, originalLength: s.length, preview: s.slice(0, max) + '...(已截断)' }
}

/* ─── 主体入口 ───────── */

/**
 * 执行一个工具调用。
 *
 * @param {Object} p
 * @param {string} p.toolName
 * @param {Object} p.args  LLM 给的 JSON Schema 参数
 * @param {Object} p.currentUser  req.user
 * @param {string} p.orgId
 * @param {boolean} [p.confirmed=false]  高风险工具的二次确认标志
 * @returns {Promise<Object>}
 *   - 普通工具: { ok: true, toolName, summary, result }
 *   - 高风险首次: { ok: true, pendingConfirmation: true, toolName, summary, args, requiredPermission }
 *   - 失败: throw ApiError
 */
async function execute({ toolName, args, currentUser, orgId, confirmed = false }) {
  const meta = dispatchTable[toolName]
  if (!meta) throw ApiError.badRequest(`unknown tool: ${toolName}`)

  // 1. 权限
  const perms = await getUserPerms(currentUser, orgId)
  if (!currentUser.isPlatformAdmin && !perms.has(meta.perm)) {
    throw ApiError.forbidden(`AI 助手调用 "${toolName}" 需要权限: ${meta.perm}`)
  }

  // 2. 高风险 dry-run
  if (meta.risk === 'high' && !confirmed) {
    return {
      ok: true,
      pendingConfirmation: true,
      toolName,
      summary: buildSummary(toolName, args),
      args,
      requiredPermission: meta.perm
    }
  }

  // 3. 解析 service + 参数
  const inv = await resolveInvocation({ toolName, args, currentUser, orgId })

  // 4. 动态 require + 执行
  const svc = require(`@modules/${inv.svcModule}/${inv.svcModule}.service`)
  const startTs = Date.now()
  let result
  try {
    result = await svc[inv.svcFn](...asArray(inv.args))
  } catch (e) {
    // 审计: 失败也记一行 (便于排查 / 统计 AI 调用失败率)
    // eslint-disable-next-line no-console
    console.warn(
      `[agent.audit] FAIL org=${orgId} user=${currentUser.id} ` +
      `tool=${toolName} risk=${meta.risk} durationMs=${Date.now() - startTs} ` +
      `error="${(e && e.message || '').replace(/[\n\r"]/g, ' ').slice(0, 200)}"`
    )
    throw e
  }

  // 审计: 成功记录 (脱敏: 不打印 args 详情, 仅摘要)
  // eslint-disable-next-line no-console
  console.log(
    `[agent.audit] OK org=${orgId} user=${currentUser.id} ` +
    `tool=${toolName} risk=${meta.risk} durationMs=${Date.now() - startTs} ` +
    `summary="${buildSummary(toolName, args).replace(/[\n\r"]/g, ' ').slice(0, 120)}"`
  )

  return {
    ok: true,
    toolName,
    summary: buildSummary(toolName, args),
    result: truncate(result)
  }
}

/* ─── helpers ───────── */

function pickArgs(src, keys) {
  const out = {}
  for (const k of keys) {
    if (src && src[k] !== undefined && src[k] !== null) out[k] = src[k]
  }
  return out
}

function asArray(v) {
  return Array.isArray(v) ? v : [v]
}

module.exports = {
  execute,
  buildSummary,
  getUserPerms,
  clearPermCache
}