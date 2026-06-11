'use strict'

const { body } = require('express-validator')
const { COURSE_INSTANCE_STATUSES, SCHEDULE_PLAN_MODES } = require('@shared/enums')

/**
 * 排课计划子文档校验（按 mode 走分支）：
 *  - weekly 模式：lessonsPerWeek (1-7) 必填；restDays 可选（0-6 整数数组）
 *  - cycle  模式：cycleOnDays (>= 1) + cycleOffDays (>= 1) 必填
 *  - 共同：totalPlannedLessons (>= 1) 必填；minutesPerLesson 可选（>= 1 整数）
 * 业务级校验（cycle 模式、weekly 模式的字段必填互斥）放在 service 层。
 */
const schedulePlanChain = (location) => body(location)
  .custom((v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new Error('schedulePlan 必须是对象')
    }
    return true
  })

exports.create = [
  body('courseProduct').isMongoId(),
  body('subject').isMongoId(),
  body('teacher').optional().isMongoId(),
  body('room').optional().isMongoId(),
  // 描述性字段（全部可选）
  body('name').optional().isString().isLength({ max: 200 }),
  body('description').optional().isString(),
  body('teacherIntro').optional().isString(),
  // schedulePlan
  schedulePlanChain('schedulePlan'),
  body('schedulePlan.mode').optional().isIn(SCHEDULE_PLAN_MODES),
  // weekly 字段
  body('schedulePlan.lessonsPerWeek').optional().isInt({ min: 1, max: 7 }),
  body('schedulePlan.restDays').optional().isArray(),
  body('schedulePlan.restDays.*').optional().isInt({ min: 0, max: 6 }),
  // cycle 字段
  body('schedulePlan.cycleOnDays').optional().isInt({ min: 1 }),
  body('schedulePlan.cycleOffDays').optional().isInt({ min: 1 }),
  // 共同字段
  body('schedulePlan.totalPlannedLessons').isInt({ min: 1 }),
  body('schedulePlan.minutesPerLesson').optional().isInt({ min: 1 }),
  // acceptedCourseProducts：可选；缺省时回落到 [courseProduct]
  body('acceptedCourseProducts').optional().isArray(),
  body('acceptedCourseProducts.*').optional().isMongoId(),
  body('startDate').isISO8601(),
  body('maxStudents').optional().isInt({ min: 1 }),
  body('status').optional().isIn(COURSE_INSTANCE_STATUSES)
]

exports.update = [
  body('courseProduct').optional().isMongoId(),
  body('subject').optional().isMongoId(),
  body('teacher').optional().isMongoId(),
  body('room').optional().isMongoId(),
  // 描述性字段（全部可选）
  body('name').optional().isString().isLength({ max: 200 }),
  body('description').optional().isString(),
  body('teacherIntro').optional().isString(),
  // schedulePlan 可整体替换
  body('schedulePlan').optional().custom((v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new Error('schedulePlan 必须是对象')
    }
    return true
  }),
  body('schedulePlan.mode').optional().isIn(SCHEDULE_PLAN_MODES),
  body('schedulePlan.lessonsPerWeek').optional().isInt({ min: 1, max: 7 }),
  body('schedulePlan.restDays').optional().isArray(),
  body('schedulePlan.restDays.*').optional().isInt({ min: 0, max: 6 }),
  body('schedulePlan.cycleOnDays').optional().isInt({ min: 1 }),
  body('schedulePlan.cycleOffDays').optional().isInt({ min: 1 }),
  body('schedulePlan.totalPlannedLessons').optional().isInt({ min: 1 }),
  body('schedulePlan.minutesPerLesson').optional().isInt({ min: 1 }),
  // acceptedCourseProducts
  body('acceptedCourseProducts').optional().isArray(),
  body('acceptedCourseProducts.*').optional().isMongoId(),
  body('startDate').optional().isISO8601(),
  body('maxStudents').optional().isInt({ min: 1 }),
  body('status').optional().isIn(COURSE_INSTANCE_STATUSES)
]

/**
 * 状态变更校验：toStatus + reason 必填
 * 业务规则（可逆性、cancelled 死胡同、closed 不可逆）由 service.setStatus 校验
 */
exports.setStatus = [
  body('toStatus').isIn(COURSE_INSTANCE_STATUSES),
  body('reason').isString().trim().isLength({ min: 1, max: 500 })
]
