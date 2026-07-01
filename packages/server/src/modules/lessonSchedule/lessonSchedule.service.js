'use strict'

const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const CourseInstance = require('@models/CourseInstance.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const StudentProduct = require('@models/StudentProduct.model')
const Room = require('@models/Room.model')
const User = require('@models/User.model')
// 招生试听 (2026-06): 试听预约表; 排课处 usage check + detail 字段需要
const TrialBooking = require('@models/TrialBooking.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const { CourseEnrollmentStatus, AttendanceStatus, LessonScheduleStatus, CourseInstanceStatus } = require('@shared/enums')
const { pickStudentProductFIFO } = require('@modules/lessonAttendance/studentProductHelper')
const lessonAttendanceService = require('@modules/lessonAttendance/lessonAttendance.service')
const { invalidate: invalidateReportCache } = require('@modules/report/reportCache')

/**
 * 把 from/to 字符串解析为 Date, 兼容两种入参:
 *   1) 完整 ISO (含时区或毫秒): "2026-06-24T09:00:00+08:00" → 原样 new Date()
 *   2) 纯日期: "2026-06-24" → 当天 00:00:00 (start 模式) 或 次日 00:00:00 (end 模式)
 *      这样 from=to="2026-06-24" 能正确表达"整天 6/24"
 * 用法:
 *   filter.plannedStartTime.$gte = parseBoundary(from, 'start')
 *   filter.plannedStartTime.$lte = parseBoundary(to, 'end')
 *
 * 2026-06-23 修 calendar 同一天 from=to 边界 bug 时引入
 */
function parseBoundary(s, mode) {
  if (!s) return null
  // 含 'T' 或 ':' 或 'Z' 或 '+/-\d{2}:?\d{2}$' 视为完整 ISO, 直接 new Date()
  const isFullISO = /T/.test(s)
  if (isFullISO) return new Date(s)
  // 纯日期 "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return new Date(s) // fallback: 让 new Date 抛错, 不静默
  const [_, y, mo, d] = m
  if (mode === 'end') {
    // 次日 00:00:00 (= 当天 24:00:00)
    return new Date(Number(y), Number(mo) - 1, Number(d) + 1, 0, 0, 0, 0)
  }
  // start: 当天 00:00:00
  return new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0)
}

// ─── 冲突检测 ─────────────────────────────────────────────
// 同时返回冲突的排课列表（id / 时间 / 老师 / 教室 / 课程），用于 UI 上的具体提示
async function detectConflict({ orgId, teacher, room, start, end, excludeId }) {
  const baseFilter = {
    org: orgId,
    status: { $in: [LessonScheduleStatus.SCHEDULED, LessonScheduleStatus.IN_PROGRESS] },
    plannedStartTime: { $lt: end },
    plannedEndTime: { $gt: start }
  }
  if (excludeId) baseFilter._id = { $ne: excludeId }

  const [teacherHits, roomHits] = await Promise.all([
    teacher
      ? LessonSchedule.find({ ...baseFilter, teacher })
          .select('_id plannedStartTime plannedEndTime teacher room courseInstance lessonNo status')
          .populate('courseInstance', 'name')
          .populate('teacher', 'realName mobile')
          .populate('room', 'name')
          .lean()
      : Promise.resolve([]),
    room
      ? LessonSchedule.find({ ...baseFilter, room })
          .select('_id plannedStartTime plannedEndTime teacher room courseInstance lessonNo status')
          .populate('courseInstance', 'name')
          .populate('teacher', 'realName mobile')
          .populate('room', 'name')
          .lean()
      : Promise.resolve([])
  ])

  return {
    teacher: teacherHits,
    room: roomHits
  }
}

function conflictResponsePayload(conflict) {
  // 给前端的格式：合并 teacher + room 冲突去重
  const map = new Map()
  for (const c of [...conflict.teacher, ...conflict.room]) {
    map.set(String(c._id), {
      id: String(c._id),
      lessonNo: c.lessonNo,
      plannedStartTime: c.plannedStartTime,
      plannedEndTime: c.plannedEndTime,
      courseInstance: c.courseInstance && {
        id: String(c.courseInstance._id),
        name: c.courseInstance.name
      },
      teacher: c.teacher && { id: String(c.teacher._id), name: c.teacher.realName || c.teacher.mobile },
      room: c.room && { id: String(c.room._id), name: c.room.name },
      status: c.status
    })
  }
  return Array.from(map.values())
}

async function list({ orgId, from, to, courseInstance, teacher, room, statuses, page, pageSize, isTrialLesson }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (courseInstance) filter.courseInstance = courseInstance
  if (teacher) filter.teacher = teacher
  if (room) filter.room = room
  // 招生试听 (2026-06): 按是否试听课过滤; 'true'/'false'/'undefined'(不传=全部)
  if (isTrialLesson === 'true' || isTrialLesson === true) filter.isTrialLesson = true
  else if (isTrialLesson === 'false' || isTrialLesson === false) filter.isTrialLesson = { $ne: true }
  // 状态筛选: 数组 / 逗号分隔字符串
  //  - statuses: 数组 (axios paramsSerializer 把 ?statuses=a&statuses=b 展成数组)
  //  - statuses: 字符串 'a,b,c' (前端 join 后的扁平串)
  let rawStatuses = []
  if (Array.isArray(statuses)) rawStatuses = statuses
  else if (typeof statuses === 'string' && statuses.length) {
    rawStatuses = statuses.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (rawStatuses.length === 1) filter.status = rawStatuses[0]
  else if (rawStatuses.length > 1) filter.status = { $in: rawStatuses }
  if (from || to) {
    filter.plannedStartTime = {}
    if (from) filter.plannedStartTime.$gte = new Date(from)
    if (to) filter.plannedStartTime.$lte = new Date(to)
  }
  // 服务端排序规则（与 UI 约定一致）：
  //   1) 状态优先级：archived > completed > in_progress > preparing > scheduled > cancelled
  //   2) 组内时间：有 actualStartTime 的按 actualStartTime 升序（in_progress / completed / archived 走这条）；
  //               没有 actualStartTime 的按 plannedStartTime 升序（preparing / scheduled 走这条）。
  // 说明：实际是对每个 doc 计算 `sortKey`（状态 rank + 时间）然后排序；Mongo 无 computed sortKey，
  //      所以这里在 service 层先按 plan 时间拉回来，再内存里排序（limit 分页在内存里裁剪）。
  //      排课列表数据量级（单机构学期内几千条）远小于 Mongo 排序成本,可以接受。
  const fetchLimit = Math.max(p.limit * 5, 500) // 拉宽一些再在内存裁，避免漏数据
  const docs = await LessonSchedule.find(filter)
    // 2026-06-26: 把 courseInstance.status 一起带回，前端用来给"开班不在 active"的卡片降饱和度，
    //   提示用户：这些排课虽然状态是 scheduled，但后端 prepare/start/finish/archive 都会被 assertCourseInstanceActive 挡掉。
    .populate('courseInstance', 'name status')
    .populate('teacher', 'mobile realName')
    .populate('room', 'name location')
    .sort({ plannedStartTime: 1 })
    .limit(fetchLimit)
    .lean()
  const sorted = sortSchedulesForList(docs)
  const total = await LessonSchedule.countDocuments(filter)
  const items = sorted.slice(p.skip, p.skip + p.limit)
  return { items, total, page: p.page, pageSize: p.pageSize }
}

// 排课列表统一排序：状态优先级 → 组内时间升序
const STATUS_RANK = Object.freeze({
  archived: 0,
  completed: 1,
  in_progress: 2,
  preparing: 3,
  scheduled: 4,
  cancelled: 5
})

/**
 * 业务不变量：排课状态变更（prepare/start/finish/archive）必须发生在
 * 「开班处于 active 状态」的前提下。
 *
 * - planning:  开班还没真正开起来，不允许任何排课状态流转（应该先排课→切 active→再开课）
 * - enrolling: 还在招生阶段，排课已生成但不许"上课"
 * - active:    ✓ 允许所有状态变更
 * - closed:    已结班，不允许再动排课（事实上 closed 前所有排课应已 archived）
 * - cancelled: 开班被取消，不允许再动排课
 *
 * 防御性深度：即使前端按钮 / UI 做了门控，后端必须仍校验。
 */
async function assertCourseInstanceActive(courseInstanceId) {
  const inst = await CourseInstance.findOne({ _id: courseInstanceId })
    .select('status name').lean()
  if (!inst) throw ApiError.notFound('开班不存在')
  if (inst.status !== CourseInstanceStatus.ACTIVE) {
    const labelMap = {
      planning: '筹备中', enrolling: '招生中', closed: '已结班', cancelled: '已取消'
    }
    throw ApiError.badRequest(
      `开班「${inst.name}」当前为「${labelMap[inst.status] || inst.status}」，不允许变更排课状态。请先将开班切到「进行中」。`
    )
  }
}
function sortSchedulesForList(docs) {
  return [...docs].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 99
    const rb = STATUS_RANK[b.status] ?? 99
    if (ra !== rb) return ra - rb
    // 组内排序：有 actualStartTime 用它，没有用 plannedStartTime
    const ta = a.actualStartTime ? new Date(a.actualStartTime).getTime() : new Date(a.plannedStartTime).getTime()
    const tb = b.actualStartTime ? new Date(b.actualStartTime).getTime() : new Date(b.plannedStartTime).getTime()
    return ta - tb
  })
}

async function detail(id, orgId) {
  const s = await LessonSchedule.findOne({ _id: id, org: orgId })
    .populate('courseInstance teacher room')
    .lean()
  if (!s) throw ApiError.notFound('排课不存在')
  // 解析"本节课内容"(主题/描述/目标/课件) — 三层 fallback
  // 仅在 detail 路径上做, list 路径 N+1 风险大, 让前端 schedule 列表调 detail 拿
  try {
    const { resolveLessonContent } = require('@shared/lessonContent')
    // 把 CI 的 snapshot/override 摊平到 detail 文档(lean populate 后的 courseInstance 是对象)
    const ci = s.courseInstance && typeof s.courseInstance === 'object' ? s.courseInstance : null
    const subjectId = ci && ci.subject
    const Subject = require('@models/Subject.model')
    const subject = subjectId
      ? await Subject.findOne({ _id: subjectId, org: orgId })
          .select('syllabus lessonMaterials')
          .lean()
      : null
    const resolved = resolveLessonContent({
      lessonNo: s.lessonNo,
      subject,
      courseInstance: ci,
      lessonSchedule: s
    })
    // 把课件 fileId 一次性查 File 拿 originalName + url, 塞到 resolvedContent.materialFiles
    //   - 限制最大 50 个, 防恶意课拖慢 detail
    //   - 跨 org 的 file 过滤掉(File.org 必填)
    if (resolved.materialFileIds && resolved.materialFileIds.length) {
      const ids = resolved.materialFileIds.slice(0, 50)
      const File = require('@models/File.model').File
      const files = await File.find({ _id: { $in: ids }, org: orgId, deletedAt: null })
        .select('_id url originalName mime size')
        .lean()
      const byId = new Map(files.map((f) => [String(f._id), f]))
      resolved.materialFiles = resolved.materialFileIds.map((fid) => {
        const f = byId.get(String(fid))
        return f ? { id: String(f._id), url: f.url, originalName: f.originalName, mime: f.mime, size: f.size } : { id: String(fid), missing: true }
      })
    } else {
      resolved.materialFiles = []
    }
    s.resolvedContent = resolved
  } catch (e) {
    // 解析失败不影响主返回
    s.resolvedContent = null
  }
  return s
}

/**
 * 为本开班下所有 enrolled 学生，按 FIFO 选产品，生成初始 LessonAttendance(scheduled)。
 *
 * 调用时机：service.prepare() 把排课从 scheduled 切到 preparing 时触发。
 * （**不在** LessonSchedule 创建时调用——见 create() / generate()。）
 *
 * 关键规则：报课时不强制要求 StudentProduct（见 courseEnrollment.service），
 * 所以排课时必须逐个判断——**只有当学生当前持有 CourseInstance.acceptedCourseProducts
 * 中任一课程产品下的、未过期、remainingLessons > 0 的 StudentProduct 时，才为他/她
 * 生成 LessonAttendance**。
 * 没有可用产品的学生在名单上会"缺席"（不会被生成考勤），起到提示家长续费/
 * 购课的作用，UI 上可以把这种学生单独标出来。
 *
 * 课程结束之前教务也可以通过 POST /lesson-attendances 手动为单个学生补一条考勤
 * （极个别场景：补报名 / 补名单 / 换课包）。
 */
async function generateAttendancesForSchedule({ orgId, courseInstance, lessonScheduleId }) {
  const enrollments = await CourseEnrollment.find({
    org: orgId,
    courseInstance,
    status: CourseEnrollmentStatus.ENROLLED
  }).select('student').lean()
  if (!enrollments.length) return 0

  const inst = await CourseInstance.findById(courseInstance)
    .select('courseProduct acceptedCourseProducts')
    .lean()
  if (!inst) return 0

  // 决定本次排课可匹配的 CourseProduct 列表
  // 默认 [inst.courseProduct]；若显式配置 acceptedCourseProducts，则用配置值
  const accepted = (inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
    ? inst.acceptedCourseProducts
    : [inst.courseProduct]

  // ★ 预过滤：先一次性查本排课下已有「非 makeup」考勤的学生 ID 集合，
  //   for 循环里直接跳过这些学生，不再依赖 partial unique 兜底。
  //   之前的 bug：partial 索引对 meta.makeupOf 存在的记录豁免 unique 约束，
  //   所以「被补过课的学生」再点"补齐名单"会真的多出一条 meta={} 考勤。
  const existing = await LessonAttendance.find({
    org: orgId,
    lessonSchedule: lessonScheduleId,
    'meta.makeupOf': { $exists: false }
  }).select('student').lean()
  const existingStudentIds = new Set(existing.map((a) => String(a.student)))

  const now = new Date()
  const docs = []
  for (const e of enrollments) {
    // 已有非 makeup 考勤 → 跳过（幂等核心）
    if (existingStudentIds.has(String(e.student))) continue
    // FIFO 选包：复用 studentProductHelper.pickStudentProductFIFO
    const sp = await pickStudentProductFIFO({ orgId, student: e.student, accepted, now })
    // 关键：没有可用产品的学生不生成考勤
    if (!sp) continue

    docs.push({
      org: orgId,
      lessonSchedule: lessonScheduleId,
      student: e.student,
      studentProduct: sp._id,
      status: AttendanceStatus.SCHEDULED
    })
  }
  if (!docs.length) return 0
  // 预过滤之后 docs 已无重复，insertMany 不会触发 partial unique 冲突；
  // 保留 ordered:false 仅作为并发兜底（极小概率）。
  await LessonAttendance.insertMany(docs, { ordered: false })
  return docs.length
}

// ─── 日期生成（按 schedulePlan.mode 走分支） ─────────────

/**
 * weekly 模式：每周 N 节 + 固定休息日。
 * 算法：把 lessonsPerWeek 在"非休息日"中均分；每天用 startTime 拼成 plannedStart/End。
 *
 * @returns {Array<{date: Date}>} 仅返回日期（不带时分）
 */
function generateWeeklyDates({ startDate, lessonsPerWeek, restDays, count }) {
  const restSet = new Set((restDays || []).map(Number))
  // 非休息日顺序：0..6 中剔除 restDays
  const weekOrder = [0, 1, 2, 3, 4, 5, 6].filter((d) => !restSet.has(d))
  // 每周要上课的"星期内序号"（基于 weekOrder）
  // 例：lessonsPerWeek=2, weekOrder=[1,2,4,5,6]（即周一/二/四/五/六）
  //   → 选 [1, 4]（每"周内序号"为 0 和 2 的那两个）
  //   这样在一个教学周内是均匀分布的（不会连上两天）
  if (lessonsPerWeek > weekOrder.length) {
    throw ApiError.badRequest(`weekly 模式：每周 ${lessonsPerWeek} 节 超过 非休息日总数 ${weekOrder.length}`)
  }
  const slots = []
  const step = weekOrder.length / lessonsPerWeek
  for (let i = 0; i < lessonsPerWeek; i++) {
    slots.push(weekOrder[Math.floor(i * step)])
  }

  // 每周迭代：对当前周内每个 slot 找对应日期；日期 < cursor 就跳过（不补到上一周）
  // 一周内的所有日期收集后按时间排序（slots 按 dow 顺序不一定等于周内时间顺序，如 [0,2,4]=日/二/五）
  const cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)
  let weekStart = new Date(cursor)
  const dates = []
  while (dates.length < count) {
    const weekDates = []
    for (let i = 0; i < slots.length; i++) {
      const targetDow = slots[i]
      const d = new Date(weekStart)
      const dayDiff = (targetDow - d.getDay() + 7) % 7
      d.setDate(d.getDate() + dayDiff)
      if (d >= cursor) {
        weekDates.push(d)
      }
    }
    weekDates.sort((a, b) => a - b)
    for (const d of weekDates) {
      if (dates.length >= count) break
      dates.push({ date: d })
    }
    // 推进到下一周
    weekStart = new Date(weekStart)
    weekStart.setDate(weekStart.getDate() + 7)
    // 兜底防止死循环
    if (dates.length > count * 10) break
  }
  return dates.slice(0, count)
}

/**
 * cycle 模式：上 X 休 Y，连续滚动周期（不绑日历周）。
 * 例：上 5 休 1 = [1,1,1,1,1,0, 1,1,1,1,1,0, ...]（1=上课日 0=休）
 *
 * @returns {Array<{date: Date}>}
 */
function generateCycleDates({ startDate, cycleOnDays, cycleOffDays, count }) {
  const cycleLen = cycleOnDays + cycleOffDays
  const dates = []
  let dayIndex = 0
  let cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)
  while (dates.length < count) {
    const pos = dayIndex % cycleLen
    if (pos < cycleOnDays) {
      const d = new Date(cursor)
      d.setDate(d.getDate() + dayIndex)
      dates.push({ date: d })
    }
    dayIndex++
    // 兜底
    if (dayIndex > count * (cycleLen / cycleOnDays) * 3) break
  }
  return dates.slice(0, count)
}

/**
 * 把日期 + 时分合并成 Date 时刻（本地时区）。
 * hour/min 取自 startTime/endTime（"HH:mm"）。
 */
function combineDateTime(date, hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number)
  const d = new Date(date)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/**
 * 共用：根据 startDate + schedulePlan + 时分 + 起始 lessonNo，
 * 生成 LessonSchedule 待写入的字段数组。
 *
 * 不做冲突检测；调用方（generate / preview）按需调用 detectConflict。
 */
function buildScheduleEntries({
  courseInstanceId,
  startDate,
  startTime,
  endTime,
  teacher,
  room,
  title
}) {
  return {
    startDate, startTime, endTime, teacher, room, title,
    courseInstanceId
  }
}

/**
 * 生成排课的核心函数：同时被 preview 和 generate 复用。
 * 返回：{ entries: [{ lessonNo, plannedStartTime, plannedEndTime }], conflicts: [...] }
 *
 * 冲突检测采用「逐节精确」策略：
 *  - 对每一节 entry，单独跑 detectConflict（按它的 teacher/room/时间区间）
 *  - 这样不会把「在大区间内但与具体那节不重叠」的已有排课误报为冲突
 *  - 返回的 conflicts 每项带 entryLessonNo（指本次预览的第几节冲突），方便前端精确标红
 */
async function buildPlanAndDetectConflicts({ orgId, courseInstance, startDate, startTime, endTime, teacher, room, title, overrideCount }) {
  const inst = await CourseInstance.findOne({ _id: courseInstance, org: orgId, deletedAt: null })
    .select('schedulePlan teacher room')
    .lean()
  if (!inst) throw ApiError.notFound('开班不存在')

  // 教师/教室：未传则回落到开班默认值
  const finalTeacher = teacher || inst.teacher
  const finalRoom = room || inst.room
  if (!finalTeacher) throw ApiError.badRequest('teacher 必填（schedulePlan 未指定老师，请在请求里传）')
  if (!finalRoom) throw ApiError.badRequest('room 必填（开班未指定教室，请在请求里传）')

  if (!startDate) throw ApiError.badRequest('startDate 必填')
  if (!startTime || !endTime) throw ApiError.badRequest('startTime / endTime 必填（HH:mm）')

  const sp = inst.schedulePlan || {}
  const mode = sp.mode || 'weekly'

  // 已存在 lessonNo 的最大值；本次从 max+1 开始
  const maxLesson = await LessonSchedule.findOne({ courseInstance, org: orgId })
    .select('lessonNo')
    .sort({ lessonNo: -1 })
    .lean()
  const startLessonNo = (maxLesson?.lessonNo || 0) + 1

  // 本次要生成多少节：overrideCount（preview 限定前 N 条预览用）优先，否则用剩余
  const totalPlanned = sp.totalPlannedLessons || 0
  const alreadyScheduled = startLessonNo - 1
  const remaining = Math.max(0, totalPlanned - alreadyScheduled)
  const count = Math.min(overrideCount || remaining, remaining)
  if (count <= 0) {
    return { entries: [], conflicts: [], mode, totalPlanned, alreadyScheduled }
  }

  // 1) 按模式生成日期
  let datePlans
  if (mode === 'cycle') {
    datePlans = generateCycleDates({
      startDate: new Date(startDate),
      cycleOnDays: sp.cycleOnDays,
      cycleOffDays: sp.cycleOffDays,
      count
    })
  } else {
    datePlans = generateWeeklyDates({
      startDate: new Date(startDate),
      lessonsPerWeek: sp.lessonsPerWeek,
      restDays: sp.restDays,
      count
    })
  }

  // 2) 拼成时刻
  const entries = datePlans.map((p, idx) => {
    const plannedStartTime = combineDateTime(p.date, startTime)
    const plannedEndTime = combineDateTime(p.date, endTime)
    return {
      lessonNo: startLessonNo + idx,
      plannedStartTime,
      plannedEndTime,
      teacher: finalTeacher,
      room: finalRoom,
      title: title || undefined
    }
  })

  // 3) 逐节精确检测（每节单独查它的时间区间内、它的老师/教室下的已有排课）
  //    用 entryLessonNo 标记冲突对应的本次节号，前端按节号精确标红
  const conflictMap = new Map() // key = `${entryLessonNo}-${existingId}` -> { entryLessonNo, existing }
  for (const entry of entries) {
    const c = await detectConflict({
      orgId,
      teacher: entry.teacher,
      room: entry.room,
      start: entry.plannedStartTime,
      end: entry.plannedEndTime
    })
    for (const x of [...c.teacher, ...c.room]) {
      const key = `${entry.lessonNo}-${String(x._id)}`
      if (!conflictMap.has(key)) {
        conflictMap.set(key, { entryLessonNo: entry.lessonNo, existing: x })
      }
    }
  }
  // 用 conflictResponsePayload 把 existing 标准化成前端约定的字段，再补 entryLessonNo
  const conflicts = Array.from(conflictMap.values()).map((c) => {
    const wrapped = conflictResponsePayload({ teacher: [c.existing], room: [] })
    return { ...wrapped[0], entryLessonNo: c.entryLessonNo }
  })

  return { entries, conflicts, mode, totalPlanned, alreadyScheduled, remaining }
}

// ─── 单条创建（原有 create，附带冲突 data） ─────────────
async function create({ orgId, courseInstance, lessonNo, plannedStartTime, plannedEndTime, teacher, room, status, title, notes, isTrialLesson }) {
  const ci = await CourseInstance.findOne({ _id: courseInstance, org: orgId }).select('_id status name isTrial')
  if (!ci) {
    throw ApiError.badRequest('courseInstance 不属于本机构')
  }
  // 招生试听 (2026-06): isTrialLesson=true 的课必须挂在 [试听专用] 开班下
  // (CourseInstance.isTrial=true), 防误用正常开班当试听课
  if (isTrialLesson && !ci.isTrial) {
    throw ApiError.badRequest('试听课必须挂在 [试听专用] 开班下, 请在批量排课中创建')
  }
  if (!await User.exists({ _id: teacher })) throw ApiError.badRequest('teacher 不存在')
  if (!await Room.exists({ _id: room, org: orgId })) throw ApiError.badRequest('room 不属于本机构')

  const start = new Date(plannedStartTime)
  const end = new Date(plannedEndTime)
  if (!(start < end)) throw ApiError.badRequest('开始时间必须早于结束时间')

  const conflict = await detectConflict({ orgId, teacher, room, start, end })
  const teacherHits = conflict.teacher
  const roomHits = conflict.room
  if (teacherHits.length || roomHits.length) {
    throw ApiError.unprocessable(
      teacherHits.length ? '该老师在此时间段已有排课' : '该教室在此时间段已被占用',
      { conflicts: conflictResponsePayload(conflict) }
    )
  }

  const doc = await LessonSchedule.create({
    org: orgId, courseInstance, lessonNo, plannedStartTime: start, plannedEndTime: end,
    teacher, room, status, title, notes,
    isTrialLesson: !!isTrialLesson
  })

  // ★ 不在创建 LessonSchedule 时创建 LessonAttendance。
  //   业务语义：排课阶段教务还在排计划；"准备上课 (preparing)" 才意味着这节课进入执行环节，
  //   此时才为有有效课包的学生创建考勤（参见 prepare() 中的 generateAttendancesForSchedule）。
  //   报名 / 购课 / 赠课 不再触发补考勤 —— 下一次 prepare() 会基于当时最新的 enrolled 名单全量重生成。
  //   课程结束之前教务也可以手动添加 LessonAttendance（POST /api/v1/lesson-attendances）。

  invalidateReportCache(orgId)
  return detail(doc._id, orgId)
}

// ─── 批量预览（不入库） ───────────────────────────────
async function preview({ orgId, courseInstance, startDate, startTime, endTime, teacher, room, title, count }) {
  return buildPlanAndDetectConflicts({
    orgId, courseInstance, startDate, startTime, endTime, teacher, room, title,
    overrideCount: count
  })
}

// ─── 批量生成 ────────────────────────────────────────
/**
 * @param {Object} params
 * @param {String} params.title       全局默认主题（未在 titleMap 中指定 lessonNo 的则用此）
 * @param {Object} params.titleMap    { [lessonNo:number]: string } 每节主题覆盖
 */
async function generate({ orgId, courseInstance, startDate, startTime, endTime, teacher, room, title, titleMap }) {
  const plan = await buildPlanAndDetectConflicts({
    orgId, courseInstance, startDate, startTime, endTime, teacher, room, title
  })
  if (plan.entries.length === 0) {
    return { created: 0, entries: [], conflicts: plan.conflicts }
  }
  if (plan.conflicts.length > 0) {
    // 显式拒绝：让用户先去解决冲突
    throw ApiError.unprocessable('存在冲突，请先解决', { conflicts: plan.conflicts })
  }

  // 批量插入：每节的主题优先取 titleMap[lessonNo]，否则回落到全局 title
  const docs = plan.entries.map((e) => ({
    org: orgId,
    courseInstance,
    lessonNo: e.lessonNo,
    plannedStartTime: e.plannedStartTime,
    plannedEndTime: e.plannedEndTime,
    teacher: e.teacher,
    room: e.room,
    title: (titleMap && titleMap[e.lessonNo]) || e.title,
    status: LessonScheduleStatus.SCHEDULED
  }))
  const inserted = await LessonSchedule.insertMany(docs, { ordered: true })

  // 注意：不在排课生成阶段创建 LessonAttendance。
  // 业务语义：排课阶段教务还在排计划，"准备上课 (preparing)" 才意味着这节课进入执行环节，
  // 此时才为有有效课包的学生创建考勤（参见 prepare() 中的 generateAttendancesForSchedule）。
  // 报名 / 购课 / 赠课 不再触发补考勤 —— 下一次 prepare() 会基于当时最新的 enrolled 名单全量重生成。

  return { created: inserted.length, entries: inserted.map((s) => s._id), conflicts: [] }
}

// ─── 更新（带冲突 data） ─────────────────────────────
// 关键约束：编辑保存**不切状态**。状态机只走 /prepare /start /finish /archive /cancel 专用端点；
// 这里只接受"元数据"字段（计划时间/老师/教室/主题/备注/实际上课时间/理由）。
async function update(id, orgId, payload) {
  const exist = await LessonSchedule.findOne({ _id: id, org: orgId })
  if (!exist) throw ApiError.notFound('排课不存在')

  // 1) 过滤掉不允许在 update 里改的字段（status 等）
  const STATUS_CHANGE_FIELDS = ['status']
  for (const k of STATUS_CHANGE_FIELDS) {
    if (payload[k] !== undefined) {
      // 静默丢弃 —— 让前端"状态变更"走专用端点；这里不允许顺手改
      delete payload[k]
    }
  }

  // 2) 已完成 / 已归档的排课只允许改"备注 / 标题"
  if (exist.status === LessonScheduleStatus.COMPLETED || exist.status === LessonScheduleStatus.ARCHIVED) {
    const allowed = ['notes', 'title']
    const attempted = Object.keys(payload).filter((k) => !allowed.includes(k) && payload[k] !== undefined)
    if (attempted.length > 0) {
      throw ApiError.badRequest(`已结束/已归档的排课不可修改字段：${attempted.join(', ')}`)
    }
  }

  // 3) 已取消的排课完全锁死
  if (exist.status === LessonScheduleStatus.CANCELLED) {
    throw ApiError.badRequest('已取消的排课不可编辑')
  }

  // 4) 实际上课时间允许在 update 里编辑（教务补录 / 修正）；但 actualStartTime 和 actualEndTime
  //    一旦与计划时间相差 5 分钟以上，actualStartReason / actualEndReason 必须填，否则 400。
  //    - 仅当字段被显式传入(payload 里有这个 key)才校验
  //    - 传 null 表示清空 reason（前端可主动清）
  const finalActualStart = (payload.actualStartTime !== undefined)
    ? (payload.actualStartTime ? new Date(payload.actualStartTime) : null)
    : exist.actualStartTime
  const finalActualEnd = (payload.actualEndTime !== undefined)
    ? (payload.actualEndTime ? new Date(payload.actualEndTime) : null)
    : exist.actualEndTime
  // 计算 reason 的最终值：先看 payload，没有就保持 exist
  const finalStartReason = (payload.actualStartReason !== undefined)
    ? (payload.actualStartReason || null)
    : exist.actualStartReason
  const finalEndReason = (payload.actualEndReason !== undefined)
    ? (payload.actualEndReason || null)
    : exist.actualEndReason

  // 5) 5 分钟差异校验（仅在 actualStartTime 实际被设置/变化时校验）
  //    校验条件：abs(actualStart - plannedStart) ≥ 5min → 必须有 actualStartReason
  if (finalActualStart) {
    const diffMin = Math.abs(finalActualStart.getTime() - exist.plannedStartTime.getTime()) / 60000
    if (diffMin >= 5 && !finalStartReason) {
      throw ApiError.badRequest('实际上课开始时间与计划相差 5 分钟以上，请填写理由')
    }
  }
  if (finalActualEnd) {
    const diffMin = Math.abs(finalActualEnd.getTime() - exist.plannedEndTime.getTime()) / 60000
    if (diffMin >= 5 && !finalEndReason) {
      throw ApiError.badRequest('实际上课结束时间与计划相差 5 分钟以上，请填写理由')
    }
  }

  const teacher = payload.teacher || exist.teacher
  const room = payload.room || exist.room
  const start = payload.plannedStartTime ? new Date(payload.plannedStartTime) : exist.plannedStartTime
  const end = payload.plannedEndTime ? new Date(payload.plannedEndTime) : exist.plannedEndTime
  if (!(start < end)) throw ApiError.badRequest('开始时间必须早于结束时间')

  // 6) 仅当 老师/教室/时间 真的变了才重做冲突检测
  const timeChanged = start.getTime() !== exist.plannedStartTime.getTime() ||
                      end.getTime() !== exist.plannedEndTime.getTime() ||
                      String(teacher) !== String(exist.teacher) ||
                      String(room) !== String(exist.room)
  if (timeChanged) {
    const conflict = await detectConflict({ orgId, teacher, room, start, end, excludeId: exist._id })
    if (conflict.teacher.length || conflict.room.length) {
      throw ApiError.unprocessable(
        conflict.teacher.length ? '该老师在此时间段已有排课' : '该教室在此时间段已被占用',
        { conflicts: conflictResponsePayload(conflict) }
      )
    }
  }

  // 7) materials 字段更新 → fileBind diff（ObjectId 数组）
  const prevMaterials = (exist.materials || []).map((x) => String(x))
  if (Object.prototype.hasOwnProperty.call(payload, 'materials')) {
    if (Array.isArray(payload.materials)) {
      payload.materials = payload.materials.filter((x) => x != null).map((x) => String(x))
    } else {
      payload.materials = []
    }
  }

  // 8) 写回（注意：actualStartReason/actualEndReason 是新增字段，需显式赋值；planTime/teacher/room 已通过 Object.assign 写）
  Object.assign(exist, payload, {
    plannedStartTime: start,
    plannedEndTime: end,
    actualStartTime: finalActualStart,
    actualEndTime: finalActualEnd,
    actualStartReason: finalStartReason,
    actualEndReason: finalEndReason
  })
  await exist.save()

  if (Object.prototype.hasOwnProperty.call(payload, 'materials')) {
    const { REF_ENTITY } = require('@models/File.model')
    const fileBind = require('@modules/storage/fileBind')
    await fileBind.diffArrayById({
      orgId,
      oldIds: prevMaterials,
      newIds: (exist.materials || []).map((x) => String(x)),
      entity: REF_ENTITY.LESSON_SCHEDULE,
      entityId: exist._id,
      field: 'materials'
    })
  }

  return detail(exist._id, orgId)
}

// ─── 准备上课：scheduled → preparing（仅在 plannedStartTime 24h 窗口内可转） ───
// 业务规则：
//   - 仅 scheduled 可转（其他状态一律拒绝；状态变更在"上课表"页面做）
//   - now ≥ plannedStartTime - 24h（即"上课前 24 小时内"才能转 preparing）
//   - 转 preparing 后，课前请假的学生考勤可以提前登记
async function prepare({ id, orgId }) {
  const exist = await LessonSchedule.findOne({ _id: id, org: orgId })
  if (!exist) throw ApiError.notFound('排课不存在')
  await assertCourseInstanceActive(exist.courseInstance)
  if (exist.status !== LessonScheduleStatus.SCHEDULED) {
    throw ApiError.badRequest('只有「未上课」状态的排课可转为「准备上课」')
  }
  const now = new Date()
  // 24 小时窗口校验（临时跳过）
  // ============================================================
  // TODO[product-flag:REACTIVATE_PREPARE_24H_WINDOW]
  // 测试期间先跳过"上课前 24 小时内"的限制，方便教务在任何时候把排课切到 preparing。
  // 重新启用时把下面的 if 分支去掉注释即可。
  // ============================================================
  // const windowStart = new Date(exist.plannedStartTime.getTime() - 24 * 60 * 60 * 1000)
  // if (now < windowStart) {
  //   const minutes = Math.ceil((windowStart.getTime() - now.getTime()) / 60000)
  //   throw ApiError.badRequest(`距离上课还有 ${minutes} 分钟，需在上课前 24 小时内才能转为「准备上课」`)
  // }
  // 顺带：实际开课时间已超过 plannedStartTime 但还没人开课 → 提醒
  if (now > exist.plannedStartTime) {
    // 允许转：迟到的也允许进入 preparing，方便补登记
  }
  exist.status = LessonScheduleStatus.PREPARING
  await exist.save()

  // ★ 业务变更：考勤在"准备上课"阶段生成，而非排课生成时。
  //   - 此时为本开班下所有 enrolled 且有有效课包的学生生成 LessonAttendance(scheduled)；
  //   - 没有课包的学生不生成（业务信号：提示家长续费）；
  //   - 幂等：如果已有考勤（兼容遗留数据 / 后续补报名补考勤）则跳过，
  //           这里 generateAttendancesForSchedule 内部已用 student 查重 + insertMany ordered:false 实现幂等。
  let createdAttendances = 0
  try {
    createdAttendances = await generateAttendancesForSchedule({
      orgId,
      courseInstance: exist.courseInstance,
      lessonScheduleId: exist._id
    })
  } catch (e) {
    // 考勤生成失败不应阻断 prepare 状态切换（教务还能手动补名单）
    // eslint-disable-next-line no-console
    console.error('auto-generate attendance failed in prepare()', exist._id, e.message)
  }

  const result = await detail(exist._id, orgId)
  result._createdAttendances = createdAttendances // 附加字段，controller 透传给前端
  return result
}

// ─── 开始上课：写 actualStartTime + status = in_progress ───
// 业务规则（2026-06 修订）：
//   - 仅 preparing → in_progress；**拒绝** scheduled → in_progress 的跨状态跳转。
//   - 原因：业务上「准备上课」才是生成 LessonAttendance 的入口，跨过去会导致
//     名单为空 / 无法标记 no_show / finish 时把所有 scheduled 都按「来了」扣课时。
//   - completed / cancelled / archived 一律拒绝。
async function start({ id, orgId }) {
  const exist = await LessonSchedule.findOne({ _id: id, org: orgId })
  if (!exist) throw ApiError.notFound('排课不存在')
  await assertCourseInstanceActive(exist.courseInstance)
  if (exist.status === LessonScheduleStatus.SCHEDULED) {
    throw ApiError.badRequest('请先点「准备上课」生成考勤名单，再开始上课')
  }
  if (exist.status === LessonScheduleStatus.CANCELLED) {
    throw ApiError.badRequest('已取消的排课不可开始')
  }
  if (exist.status === LessonScheduleStatus.COMPLETED || exist.status === LessonScheduleStatus.ARCHIVED) {
    throw ApiError.badRequest('已结束/已归档的排课不可再次开始')
  }
  exist.actualStartTime = new Date()
  exist.status = LessonScheduleStatus.IN_PROGRESS
  await exist.save()
  return detail(exist._id, orgId)
}

// ─── 结束上课：写 actualEndTime + status = completed ───
// 要求来源：in_progress；preparing 需先 start；scheduled 也需先 start（不可跳过）
async function finish({ id, orgId, actualEndTime, actualEndReason }) {
  const exist = await LessonSchedule.findOne({ _id: id, org: orgId })
  if (!exist) throw ApiError.notFound('排课不存在')
  await assertCourseInstanceActive(exist.courseInstance)
  if (exist.status === LessonScheduleStatus.CANCELLED) {
    throw ApiError.badRequest('已取消的排课不可结束')
  }
  if (exist.status === LessonScheduleStatus.COMPLETED || exist.status === LessonScheduleStatus.ARCHIVED) {
    throw ApiError.badRequest('已结束/已归档的排课不可再次结束')
  }
  if (exist.status === LessonScheduleStatus.SCHEDULED || exist.status === LessonScheduleStatus.PREPARING) {
    throw ApiError.badRequest('未开始上课的排课不可结束（请先点"开始上课"）')
  }
  // 若之前没点"开始"，自动用 plannedStartTime 作为 actualStartTime
  if (!exist.actualStartTime) {
    exist.actualStartTime = exist.plannedStartTime
  }
  // 实际下课时间：可由前端传（教务补录），默认 = now
  const finalEnd = actualEndTime ? new Date(actualEndTime) : new Date()
  // 5 分钟差异校验（临时跳过）
  // ============================================================
  // TODO[product-flag:REACTIVATE_FINISH_DIFF_VALIDATION]
  // 测试期间先跳过 5 分钟差异校验，方便教务直接调 finish。
  // 重新启用时把下面的 if 分支去掉注释即可。
  // 关联位置：ClassSchedulePage.submitFinish 的 finishNeedsReason 也对应跳过。
  // ============================================================
  // const diffMin = Math.abs(finalEnd.getTime() - exist.plannedEndTime.getTime()) / 60000
  // if (diffMin >= 5 && !actualEndReason && !exist.actualEndReason) {
  //   throw ApiError.badRequest('实际下课时间与计划下课时间相差 5 分钟以上，请填写理由')
  // }
  exist.actualEndTime = finalEnd
  if (actualEndReason) exist.actualEndReason = actualEndReason
  exist.status = LessonScheduleStatus.COMPLETED
  await exist.save()

  // ★自动消课：本节课所有 checked_in / scheduled 的考勤 → completed，
  //   并对每条按 FIFO 扣 StudentProduct 1 课时。
  // leave / no_show 不动也不扣；已 completed 的幂等跳过。
  // 失败明细进 _consumeReport.failed，不阻断 finish 整体成功。
  const consumeReport = await lessonAttendanceService.bulkCompleteForSchedule({
    orgId, lessonSchedule: id
  })

  const detailDoc = await detail(exist._id, orgId)
  detailDoc._consumeReport = consumeReport
  return detailDoc
}

/**
 * 归档：已完成 → 已归档。
 * 业务规则：
 *   - 仅 completed → archived；cancelled/in_progress/scheduled 一律拒绝；
 *   - 再次归档幂等（直接返回详情）；
 *   - 「可归档」校验：所有 LessonAttendance 必须满足
 *       (no_show || leave)                                  // 不需要课评
 *       || (completed && evaluation.evaluatedAt !== null)  // 已消课且有课评
 *   - 没有考勤记录（roster 为空，例如全部学生无可用课包）也允许归档；
 *   - 兜底 actualEndTime，状态切到 archived。
 */
async function archive({ id, orgId }) {
  const exist = await LessonSchedule.findOne({ _id: id, org: orgId })
  if (!exist) throw ApiError.notFound('排课不存在')
  await assertCourseInstanceActive(exist.courseInstance)
  if (exist.status === LessonScheduleStatus.CANCELLED) {
    throw ApiError.badRequest('已取消的排课不可归档')
  }
  if (exist.status === LessonScheduleStatus.ARCHIVED) {
    return detail(exist._id, orgId) // 幂等
  }
  if (exist.status !== LessonScheduleStatus.COMPLETED) {
    throw ApiError.badRequest(`当前状态「${exist.status}」不可归档；请先结束课程`)
  }

  const atts = await LessonAttendance.find({ lessonSchedule: id, org: orgId })
    .select('status evaluation meta').lean()
  const missing = []
  for (const a of atts) {
 //2026-06修订：仅「已消课/已补」且未写课评的考勤阻塞归档；
 // 其他状态（leave / no_show / scheduled / checked_in）都不算 missing，
 // 让已结束排课即使有未消课的学生也能归档（这些学生后续走「补课」机制）。
 // 2026-06：增加 madeup（补课记录同样视为已扣课时，必须有课评才能归档）。
 if (a.status !== AttendanceStatus.COMPLETED && a.status !== AttendanceStatus.MADEUP) continue
 if (a.evaluation && a.evaluation.evaluatedAt) continue
 missing.push(a._id)
 }
 if (missing.length >0) {
 throw ApiError.unprocessable(
 `有 ${missing.length} 条「已消课/已补」考勤尚未完成课评，无法归档`,
 { missingAttendanceIds: missing.map(String) }
 )
 }

  exist.status = LessonScheduleStatus.ARCHIVED
  if (!exist.actualEndTime) exist.actualEndTime = exist.plannedEndTime
  await exist.save()
  invalidateReportCache(orgId)
  return detail(exist._id, orgId)
}

/**
 * 物理删除排课。
 * 入口:超管+密码(routing);业务上:
 *  - 若本排课下有任何「已消课」考勤(completed),禁止删除 —— 课时已扣,
 *    删除会破坏账目,需要走"作废"流程(status -> cancelled)
 *  - 若有作品(StudentWork)挂在本排课下,禁止删除 —— 作品是家长/老师的可
 *    见产物,删除会丢历史
 *  - 同步清掉本排课的「未开始」考勤(scheduled),避免悬挂引用
 */
function lessonScheduleUsageChecks(orgId, scheduleId) {
  return [
    {
      // 已消课 + 已补 都算"已扣课时"，删除会破坏账目
      model: LessonAttendance, filter: { lessonSchedule: scheduleId, status: { $in: [AttendanceStatus.COMPLETED, AttendanceStatus.MADEUP] } },
      label: '已消课/已补考勤', hint: '本排课已有扣课时记录,请改用「作废」操作'
    },
    {
      model: StudentWork, filter: { lessonSchedule: scheduleId, org: orgId },
      label: '学员作品', hint: '本排课下已有作品上传,请先清理作品后再删'
    }
  ]
}

async function remove({ id, orgId }) {
  const doc = await LessonSchedule.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('排课不存在')

  // 互锁:用统一工具
  const { assertUnused } = require('@utils/removable')
  await assertUnused(orgId, lessonScheduleUsageChecks(orgId, id))

  // 同步清掉未开始的考勤(避免悬挂引用)
  await LessonAttendance.deleteMany({ lessonSchedule: id, status: AttendanceStatus.SCHEDULED })
  // 解绑本排课的 materials file 引用, 让 file 自身可被清理
  const materialIds = (doc.materials || []).map((x) => String(x))
  await doc.deleteOne()
  if (materialIds.length) {
    try {
      const { REF_ENTITY } = require('@models/File.model')
      const fileBind = require('@modules/storage/fileBind')
      await fileBind.unbindByIds({
        orgId,
        ids: materialIds,
        entity: REF_ENTITY.LESSON_SCHEDULE,
        entityId: id,
        field: 'materials'
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[lessonSchedule.remove] unbind materials failed for', id, e && e.message)
    }
  }
  invalidateReportCache(orgId)
  return { success: true }
}

async function removableCheck({ id, orgId }) {
  const doc = await LessonSchedule.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'LessonSchedule', label: '排课', count: 0, hint: '该排课不存在或不属于本机构' }] }
  const { check } = require('@utils/removable')
  return check(orgId, lessonScheduleUsageChecks(orgId, id))
}

/**
 * FullCalendar 友好格式：[{ id, title, start, end, status, ... }]
 * 支持筛选：开班 / 老师 / 教室 / 日期范围 / 状态
 */
async function calendar({ orgId, from, to, teacher, room, courseInstance, status, isTrialLesson }) {
  const filter = { org: orgId }
  if (courseInstance) filter.courseInstance = courseInstance
  if (teacher) filter.teacher = teacher
  if (room) filter.room = room
  // 招生试听 (2026-06): 按是否试听课过滤
  if (isTrialLesson === 'true' || isTrialLesson === true) filter.isTrialLesson = true
  else if (isTrialLesson === 'false' || isTrialLesson === false) filter.isTrialLesson = { $ne: true }
  if (status) {
    // 状态支持逗号分隔多值
    const arr = String(status).split(',').map((s) => s.trim()).filter(Boolean)
    filter.status = arr.length > 1 ? { $in: arr } : arr[0]
  }
  if (from || to) {
    filter.plannedStartTime = {}
    if (from) filter.plannedStartTime.$gte = parseBoundary(from, 'start')
    // 修 bug (2026-06-23): 之前错把字段名写成 plannedEndTime, 导致同一天的 from=to 查不出任何数据
    //   例: from=2026-06-24 to=2026-06-24 → 实际 filter = {plannedEndTime: {$lte: 2026-06-24 00:00:00}}
    //   所有课 plannedEndTime > 00:00:00, 全部被滤掉, 返回空数组
    //   截图复现: AI 调 list_lesson_calendar 查 6/24, 后端返回 [], AI 据此说"无任何排课",
    //             但日历页面明明显示当天有 3 节课
    if (to) filter.plannedStartTime.$lte = parseBoundary(to, 'end')
  }
  const items = await LessonSchedule.find(filter)
    // 2026-06-26: 把 courseInstance.status 一起带回。日历前端用它判断「开班是否进行中」，
    //   非 active 的开班走更浅的底色 + 深色文字，避免跟正常「白字+饱和底」的"可上课"事件混淆。
    .populate('courseInstance', 'name status')
    .populate('teacher', 'realName')
    .populate('room', 'name')
    .sort({ plannedStartTime: 1 })
    .lean()
  return items.map((s) => ({
    id: String(s._id),
    title: s.title || (s.courseInstance && s.courseInstance.name) || '排课',
    start: s.plannedStartTime,
    end: s.plannedEndTime,
    status: s.status,
    lessonNo: s.lessonNo,
    // 2026-06-26: teacher/room 改成 object（之前压成 realName/name 字符串，导致日历弹考勤抽屉时
    //   AttendanceRosterTable 读不到 teacher.realName / room.name → 显示 "—"）。
    //   跟 detail 接口 / list 接口的 populate 形状对齐。
    teacher: s.teacher && { id: String(s.teacher._id), realName: s.teacher.realName, mobile: s.teacher.mobile },
    room: s.room && { id: String(s.room._id), name: s.room.name, location: s.room.location },
    // 把 status + 关键开班字段一并回传：日历 drawer 弹出后展示开班周期 / 排课计划 / 招生上限
    //   让用户不仅看到"这是哪一节课"，还能看到这节课所在的整个开班上下文。
    //   schedulePlan / syllabusSnapshot 体积可控（前者几条 string+number，后者 lessons 数组最多几十条），全量回传比单独再发一次 detail 体验好。
    courseInstance: s.courseInstance && {
      id: String(s.courseInstance._id),
      name: s.courseInstance.name,
      status: s.courseInstance.status,
      isTrial: s.courseInstance.isTrial,
      startDate: s.courseInstance.startDate,
      estimatedEndDate: s.courseInstance.estimatedEndDate,
      maxStudents: s.courseInstance.maxStudents,
      schedulePlan: s.courseInstance.schedulePlan,
      syllabusSnapshot: s.courseInstance.syllabusSnapshot,
      syllabusOverride: s.courseInstance.syllabusOverride
    }
  }))
}

/**
 * C 端家长: 当前 active child 的课表 (R-1492 2026-07-01)
 *  - 绕过 permission code (家长不是员工)
 *  - 入口约定: 仅传 studentId (=req.activeStudentId), courseInstance/teacher/room 等不过滤
 *  - 业务范围: 通过 CourseEnrollment.status='enrolled' 拿到该孩子所在开班;
 *    仅返回这些开班下属的 LessonSchedule,自动防越权读到别家孩子
 *  - 字段形状跟 admin calendar() 完全一致,前端可用同一渲染逻辑
 *
 * @param {Object} args
 * @param {String} args.orgId
 * @param {String} args.studentId  // 必填, controller 已强制 = req.activeStudentId
 * @param {String|Date} [args.from]
 * @param {String|Date} [args.to]
 * @param {Boolean|String} [args.isTrialLesson]  // 招生试听 (本期不展开,留口)
 * @param {String} [args.status]                 // 状态过滤
 * @returns {Promise<Array>}
 */
async function calendarForStudent({ orgId, studentId, from, to, isTrialLesson, status }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!studentId) throw ApiError.badRequest('缺少 studentId')

  // 1) 通过 CourseEnrollment 反查孩子所在的开班 ID 列表
  const enrollments = await CourseEnrollment.find({
    org: orgId,
    student: studentId,
    status: CourseEnrollmentStatus.ENROLLED
  })
    .select('courseInstance')
    .lean()

  if (!enrollments.length) return []
  const courseInstanceIds = enrollments.map((e) => e.courseInstance)

  // 2) 基础过滤: 课程实例 + 日期范围 + 状态
  const filter = { org: orgId, courseInstance: { $in: courseInstanceIds } }

  if (isTrialLesson === 'true' || isTrialLesson === true) filter.isTrialLesson = true
  else if (isTrialLesson === 'false' || isTrialLesson === false) filter.isTrialLesson = { $ne: true }

  if (status) {
    const arr = String(status).split(',').map((s) => s.trim()).filter(Boolean)
    filter.status = arr.length > 1 ? { $in: arr } : arr[0]
  }
  if (from || to) {
    filter.plannedStartTime = {}
    if (from) filter.plannedStartTime.$gte = parseBoundary(from, 'start')
    if (to) filter.plannedStartTime.$lte = parseBoundary(to, 'end')
  }

  // 3) 跟 admin calendar 同样的 populate + 字段裁剪
  const items = await LessonSchedule.find(filter)
    .populate('courseInstance', 'name status')
    .populate('teacher', 'realName')
    .populate('room', 'name')
    .sort({ plannedStartTime: 1 })
    .lean()

  return items.map((s) => ({
    id: String(s._id),
    title: s.title || (s.courseInstance && s.courseInstance.name) || '排课',
    // 2026-07-01: 同时返回 start/end (FullCalendar 习惯) 和 plannedStartTime/plannedEndTime
    // (项目其它接口的命名),避免调用方拿到字段名时踩坑。home.vue 等老代码用的是 plannedStartTime
    start: s.plannedStartTime,
    end: s.plannedEndTime,
    plannedStartTime: s.plannedStartTime,
    plannedEndTime: s.plannedEndTime,
    status: s.status,
    lessonNo: s.lessonNo,
    teacher: s.teacher && { id: String(s.teacher._id), realName: s.teacher.realName, mobile: s.teacher.mobile },
    room: s.room && { id: String(s.room._id), name: s.room.name, location: s.room.location },
    courseInstance: s.courseInstance && {
      id: String(s.courseInstance._id),
      name: s.courseInstance.name,
      status: s.courseInstance.status,
      isTrial: s.courseInstance.isTrial,
      startDate: s.courseInstance.startDate,
      estimatedEndDate: s.courseInstance.estimatedEndDate,
      maxStudents: s.courseInstance.maxStudents,
      schedulePlan: s.courseInstance.schedulePlan,
      syllabusSnapshot: s.courseInstance.syllabusSnapshot,
      syllabusOverride: s.courseInstance.syllabusOverride
    }
  }))
}

/**
 * 冲突预检（独立端点）：给定一个时间段 + 老师/教室/课程实例，
 * 返回所有冲突排课（用于编辑对话框的"实时校验"）
 */
async function checkConflicts({ orgId, teacher, room, plannedStartTime, plannedEndTime, excludeId }) {
  if (!plannedStartTime || !plannedEndTime) {
    throw ApiError.badRequest('plannedStartTime / plannedEndTime 必填')
  }
  const start = new Date(plannedStartTime)
  const end = new Date(plannedEndTime)
  if (!(start < end)) throw ApiError.badRequest('开始时间必须早于结束时间')
  const conflict = await detectConflict({ orgId, teacher, room, start, end, excludeId })
  return { conflicts: conflictResponsePayload(conflict) }
}

/**
 * 今日工作台: 今日排课 (含 teacher / room / 学生名单)
 *  - 排除已归档 status='archived'
 *  - 每个 schedule 附带 LessonAttendance 名单 (status != 'cancelled') → 学生名 + 考勤状态
 *  - 排序按 plannedStartTime 升序
 *  - 返回 { date, items, teachers }
 *    teachers: 去重的 teacher (含今日节数), 用于"今日需哪些老师"
 */
async function listTodayWithRoster({ orgId }) {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
  const end = new Date(start.getTime() + 24 * 3600 * 1000)

  const items = await LessonSchedule.find({
    org: orgId,
    status: { $ne: 'archived' },
    plannedStartTime: { $gte: start, $lt: end }
  })
    .populate('teacher', 'mobile realName')
    .populate('room', 'name')
    .populate('courseInstance', 'title subject')
    .sort({ plannedStartTime: 1 })
    .lean()

  if (items.length === 0) {
    const pad = (n) => String(n).padStart(2, '0')
    const dateStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
    return { date: dateStr, items: [], teachers: [], count: 0 }
  }

  const ids = items.map((s) => s._id)
  const LessonAttendance = require('@models/LessonAttendance.model')
  const attendances = await LessonAttendance.find({
    org: orgId,
    lessonSchedule: { $in: ids },
    status: { $ne: 'cancelled' }
  })
    .populate('student', 'name')
    .lean()

  const rosterByLesson = new Map()
  for (const a of attendances) {
    const key = String(a.lessonSchedule)
    if (!rosterByLesson.has(key)) rosterByLesson.set(key, [])
    rosterByLesson.get(key).push({
      studentId: a.student?._id,
      studentName: a.student?.name || null,
      status: a.status
    })
  }

  const teacherMap = new Map()
  for (const s of items) {
    s.roster = rosterByLesson.get(String(s._id)) || []
    s.studentCount = s.roster.length
    if (s.teacher) {
      const key = String(s.teacher._id)
      if (!teacherMap.has(key)) {
        teacherMap.set(key, {
          id: s.teacher._id,
          name: s.teacher.realName || s.teacher.mobile,
          mobile: s.teacher.mobile,
          lessonCount: 0,
          studentCount: 0
        })
      }
      const t = teacherMap.get(key)
      t.lessonCount += 1
      t.studentCount += s.studentCount
    }
  }

  const pad = (n) => String(n).padStart(2, '0')
  const dateStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
  return {
    date: dateStr,
    items,
    teachers: Array.from(teacherMap.values()),
    count: items.length
  }
}

/**
 * 「补齐名单」：为该排课补建尚未生成考勤的已报名学生。
 *
 * 业务背景：考勤只在 prepare() 阶段批量生成；prepare 之后再有报名/购课/赠课的学生
 * 不会被自动加入本节课考勤。教务可在 preparing 及之后任意状态手动触发"补齐名单"。
 *
 * 复用 generateAttendancesForSchedule：
 * - 只对 enrolled + 持有有效课包 (FIFO) 的学生生成；没课包的学生不生成（业务信号：提示续费）
 * - insertMany ordered:false + partial unique 索引保证幂等（重复的 (schedule, student) 抛 duplicate key 被吞掉）
 *
 * @returns { created } 实际新增考勤条数
 */
async function syncAttendances({ id, orgId }) {
  const sched = await LessonSchedule.findOne({ _id: id, org: orgId })
    .select('_id courseInstance status').lean()
  if (!sched) throw ApiError.notFound('排课不存在')
  if (!['preparing', 'in_progress', 'completed', 'archived'].includes(sched.status)) {
    // scheduled 阶段：尚未"准备上课"，名单应走 prepare 自动生成；此处不允许手动补齐
    throw ApiError.badRequest('仅「准备上课」及之后的状态可手动补齐名单')
  }
  const created = await generateAttendancesForSchedule({
    orgId,
    courseInstance: sched.courseInstance,
    lessonScheduleId: sched._id
  })
  return { created }
}

/**
 * 「补齐名单」预览：统计"已 enrolled 且本排课下尚无非 makeup 考勤"的学生数。
 *
 * 用途：UI 端在 schedule 卡片展开后调一次，按"toCreate > 0"决定是否显示"补齐名单"按钮
 * 并附带数字徽标。属保守估计（不查 StudentProduct；没课包的学生 syncAttendances 实际不会建），
 * 对决定按钮显隐足够准确。
 *
 * @returns { toCreate } 潜在需要补齐的最大学生数
 */
async function previewSyncAttendances({ id, orgId }) {
  const sched = await LessonSchedule.findOne({ _id: id, org: orgId })
    .select('_id courseInstance status').lean()
  if (!sched) throw ApiError.notFound('排课不存在')
  if (!['preparing', 'in_progress', 'completed', 'archived'].includes(sched.status)) {
    return { toCreate: 0 }
  }
  const [enrolledCount, existingCount] = await Promise.all([
    CourseEnrollment.countDocuments({
      org: orgId,
      courseInstance: sched.courseInstance,
      status: CourseEnrollmentStatus.ENROLLED
    }),
    LessonAttendance.countDocuments({
      org: orgId,
      lessonSchedule: sched._id,
      'meta.makeupOf': { $exists: false }
    })
  ])
  return { toCreate: Math.max(0, enrolledCount - existingCount) }
}

module.exports = {
  list, detail, create, update, remove, removableCheck, calendar,
  calendarForStudent,
  preview, generate, prepare, start, finish, archive, checkConflicts,
  detectConflict,
  generateAttendancesForSchedule,
  syncAttendances,
  previewSyncAttendances,
  sortSchedulesForList,
  // 2026-06-23: AI 助手今日工作台
  listTodayWithRoster
}
