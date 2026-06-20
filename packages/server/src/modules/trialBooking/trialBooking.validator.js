'use strict'

const { body, query, param } = require('express-validator')

/**
 * 招生试听 - 试听预约 (TrialBooking) 校验
 *
 * 端点矩阵:
 *   GET  /                  - 列表 (看板)
 *   GET  /:id               - 详情
 *   POST /                  - 创建 (仅跟班 attached 模式; solo 走 batch-schedule)
 *   POST /batch-schedule    - 批量排课 (核心流程)
 *   PUT  /:id               - 编辑 (cancelled / remark)
 *   POST /:id/check-in      - 到店打卡
 *   POST /:id/complete      - 完成 (填 result)
 *   POST /:id/convert-preview - 转化预览
 *   POST /:id/convert       - 转化执行
 *   POST /:id/reschedule-time      - 改预约时间 (scheduled→scheduled, 替代 markNoShow+reschedule)
 *   POST /:id/revert-to-unscheduled - 退回未约 (scheduled→awaiting_schedule)
 *   DELETE /:id             - 物理删除 (requirePlatformPassword)
 */

exports.list = [
  query('status').optional().isString(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('teacher').optional().isMongoId(),
  query('subject').optional().isMongoId(),
  query('preStudent').optional().isMongoId(),
  query('attemptNo').optional().isInt({ min: 1 }),
  // 2026-06-18: 按孩子年龄过滤 (前端年龄段下拉会同时传 min/max)
  query('ageMin').optional().isInt({ min: 0, max: 100 }),
  query('ageMax').optional().isInt({ min: 0, max: 100 }),
  // 2026-06-16: 已完成按"已报名/未报名"分桶
  //   - 'true'  → 已报名 (status=completed + result.isEnrolled === true)
  //   - 'false' → 未报名 (status=completed + result.isEnrolled ∈ [false, null])
  // 2026-06-20: 考虑期 (considering) 改走顶级 status, isEnrolled 列表参数不再接 'considering'
  query('isEnrolled').optional().isIn(['true', 'false']).withMessage('isEnrolled 需为 true/false'),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 200 })
]

exports.create = [
  body('preStudent').isMongoId().withMessage('preStudent 需为合法 id'),
  body('joinMode').isIn(['attached']).withMessage('create 接口仅支持跟班 (attached) 模式; solo 走 batch-schedule'),
  body('lessonSchedule').isMongoId().withMessage('lessonSchedule 需为合法 id'),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.update = [
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 }),
  // 状态字段: 仅允许改 'cancelled' (其他由服务流驱动)
  body('status').optional().isIn(['cancelled']).withMessage('status 仅允许主动改 cancelled')
]

/**
 * 批量排课 (核心)
 * Body: { bookingIds:[至少 1 个], plannedStartTime, plannedEndTime, teacher, room }
 *  - bookingIds: TrialBooking._id 数组, 必须全部 status='awaiting_schedule', 全部 subject 一致
 *  - plannedStartTime/EndTime: ISO 字符串
 *  - teacher/room: 必填
 *  - 业务上可选: title (排课标题), notes (备注)
 */
exports.batchSchedule = [
  body('bookingIds').isArray({ min: 1, max: 100 }).withMessage('bookingIds 需为 1-100 个 id 的数组'),
  body('bookingIds.*').isMongoId().withMessage('bookingIds 含非法 id'),
  body('plannedStartTime').isISO8601().withMessage('plannedStartTime 需为 ISO 日期'),
  body('plannedEndTime').isISO8601().withMessage('plannedEndTime 需为 ISO 日期'),
  body('teacher').isMongoId().withMessage('teacher 需为合法 id'),
  // 2026-06-16: room 改可选
  //   - 老版: 必填, 试听不排教室就报错
  //   - 业务上: 试听可以"就地谈" (咨询室/会议室), 不强制占用正式教室
  //   - service 内部: body.room || null 写入, 已兼容
  body('room').optional({ nullable: true }).isMongoId().withMessage('room 需为合法 id'),
  body('title').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 500 }),
  // 2026-06-16: 也接受 remark (统一别名, service 内 notes/remark 任一即可)
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.checkIn = [
  body('actualStartTime').optional().isISO8601().withMessage('actualStartTime 需为 ISO 日期')
]

exports.complete = [
  body('actualEndTime').optional().isISO8601().withMessage('actualEndTime 需为 ISO 日期'),
  body('result').optional().isObject().withMessage('result 需为对象'),
  // 2026-06-20: isEnrolled 退回 boolean (考虑期 considering 改走顶级 status 字段)
  //   null 也允许 (前端 explicit 表达"未定夺")
  body('result.isEnrolled').optional({ nullable: true }).isBoolean().withMessage('isEnrolled 需为 boolean'),
  body('result.negotiateTeacher').optional({ nullable: true }).isMongoId(),
  body('result.attractionPoint').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('result.reasonNotEnrolled').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('result.considerNote').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.reschedule = [
  body('plannedStartTime').isISO8601().withMessage('plannedStartTime 需为 ISO 日期'),
  body('plannedEndTime').isISO8601().withMessage('plannedEndTime 需为 ISO 日期'),
  body('teacher').isMongoId().withMessage('teacher 需为合法 id'),
  body('room').isMongoId().withMessage('room 需为合法 id')
]

exports.idParam = [
  param('id').isMongoId().withMessage('id 需为合法 id')
]

/**
 * 改预约时间 (2026-06-16 替代 markNoShow + reschedule)
 * Body 字段 (全部可选, 但至少给一个):
 *   - plannedStartTime: ISO 日期
 *   - plannedEndTime:   ISO 日期 (与 plannedStartTime 配对, 用于算 scheduledDuration)
 *   - teacher:          ObjectId
 *   - room:             ObjectId (可空)
 * - 后端 service 校验: scheduled 状态才允许
 */
exports.rescheduleTime = [
  body('plannedStartTime').optional({ nullable: true }).isISO8601().withMessage('plannedStartTime 需为 ISO 日期'),
  body('plannedEndTime').optional({ nullable: true }).isISO8601().withMessage('plannedEndTime 需为 ISO 日期'),
  body('teacher').optional({ nullable: true }).isMongoId().withMessage('teacher 需为合法 id'),
  body('room').optional({ nullable: true }).isMongoId().withMessage('room 需为合法 id')
]

/**
 * 取消后再约一次 (2026-06-16 新增, 替代 markNoShow 后已经删的 reschedule)
 * Body 字段 (与 batchSchedule 一致):
 *   - plannedStartTime: ISO 日期 (必填)
 *   - plannedEndTime:   ISO 日期 (必填, 必须晚于开始)
 *   - teacher:          ObjectId (必填)
 *   - room:             ObjectId (可选)
 * - 后端 service 校验: cancelled 状态才允许
 *   - 旧 booking 留作审计; 新建一笔 awaiting_schedule (attemptNo=max+1) 并走 batchSchedule
 */
exports.rescheduleFromCancelled = [
  body('plannedStartTime').isISO8601().withMessage('plannedStartTime 需为 ISO 日期'),
  body('plannedEndTime').isISO8601().withMessage('plannedEndTime 需为 ISO 日期'),
  body('teacher').isMongoId().withMessage('teacher 需为合法 id'),
  body('room').optional({ nullable: true }).isMongoId().withMessage('room 需为合法 id')
]

/**
 * 为已有孩子创建一笔 awaiting_schedule 预约 (2026-06-20 新增)
 * Body:
 *   - preStudent: ChildLead._id (必填)
 *   - subject:    Subject 字典 id (可选, 回落 childLead.trialSubject[0])
 *   - remark:     备注 (可选)
 * - 不排时间, 不动 ChildLead.status; 走完后前端可继续调 batchSchedule 排课
 */
exports.createForChild = [
  body('preStudent').isMongoId().withMessage('preStudent 需为合法 id'),
  body('subject').optional({ nullable: true }).isMongoId().withMessage('subject 需为合法 id'),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 })
]

