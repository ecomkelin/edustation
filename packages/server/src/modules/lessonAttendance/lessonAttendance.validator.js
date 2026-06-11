'use strict'

const { body } = require('express-validator')
const { ATTENDANCE_STATUSES } = require('@shared/enums')

const checkIn = [
  body('lessonSchedule').isMongoId(),
  body('student').isMongoId(),
  body('studentProduct').isMongoId(),
  body('remark').optional().isString().isLength({ max: 200 })
]

// 教务手动添加考勤（preparing 之后补报名 / 补名单场景）
// studentProduct 可选：不传则按 FIFO 自动预选；传 null 或空字符串也表示"不预选"
const addManual = [
  body('lessonSchedule').isMongoId().withMessage('lessonSchedule 必填'),
  body('student').isMongoId().withMessage('student 必填'),
  body('studentProduct').optional({ nullable: true }).custom((v) => {
    if (v === null || v === '') return true
    return /^[0-9a-fA-F]{24}$/.test(String(v))
  }).withMessage('studentProduct 必须是 ObjectId 或 null'),
  body('remark').optional().isString().isLength({ max: 200 })
]

const complete = [
  body('actualEndTime').optional().isISO8601(),
  body('remark').optional().isString().isLength({ max: 200 })
]

const noShow = [
  body('remark').optional().isString().isLength({ max: 200 })
]

// 开课批量登记
const bulkMark = [
  body('lessonSchedule').isMongoId(),
  body('items').isArray({ min: 1 }),
  body('items.*.attendance').isMongoId(),
  body('items.*.status').isIn([
    require('@shared/enums').AttendanceStatus.CHECKED_IN,
    require('@shared/enums').AttendanceStatus.NO_SHOW,
    require('@shared/enums').AttendanceStatus.LEAVE
  ]),
  body('items.*.remark').optional().isString().isLength({ max: 200 })
]

// 课评写入（结构化子文档的 patch 接口；任一字段均可选）
const updateEvaluation = [
  body('score').optional({ nullable: true }).isInt({ min: 1, max: 5 }),
  body('content').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('strengths').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('improvements').optional({ nullable: true }).isString().isLength({ max: 1000 })
]

//补课（为已结束/已归档排课的某条未消课考勤补建一条 completed记录）
const makeup = [
 body('actualStartTime').optional().isISO8601(),
 body('actualEndTime').optional().isISO8601(),
 body('remark').optional().isString().isLength({ max:200 })
]

module.exports = { checkIn, addManual, complete, noShow, bulkMark, updateEvaluation, makeup, ATTENDANCE_STATUSES }
