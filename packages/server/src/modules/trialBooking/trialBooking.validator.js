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
 *   POST /:id/reschedule    - 再约一次 (no_show 走 batch-schedule)
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
  body('room').isMongoId().withMessage('room 需为合法 id'),
  body('title').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.checkIn = [
  body('actualStartTime').optional().isISO8601().withMessage('actualStartTime 需为 ISO 日期')
]

exports.complete = [
  body('actualEndTime').optional().isISO8601().withMessage('actualEndTime 需为 ISO 日期'),
  body('result').optional().isObject().withMessage('result 需为对象'),
  body('result.isEnrolled').optional().isBoolean().withMessage('result.isEnrolled 需为布尔'),
  body('result.negotiateTeacher').optional({ nullable: true }).isMongoId(),
  body('result.attractionPoint').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('result.reasonNotEnrolled').optional({ nullable: true }).isString().isLength({ max: 500 })
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
