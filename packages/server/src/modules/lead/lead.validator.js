'use strict'

const { body, query, param } = require('express-validator')
const { GENDERS } = require('@shared/enums')

/**
 * 招生试听 - 潜客 (Lead) 校验
 *
 * 必填 (录入最低要求): name, phone
 * 可选: age, gender, school, grade, className, trialSubjects, trialFee, source,
 *       inviteTeacher, expectedTime, specificDate, remark
 * 兼容: trialSubject (单值, 已弃用)
 *
 * 创建时 (POST /leads):
 *   - 若同 org 下 phone 命中, 服务端走软唯一, 返回 { duplicate: true, lead }
 *   - 服务端按 trialSubjects 数组长度自动建 N 笔 TrialBooking (status=awaiting_schedule)
 *   - 兼容老 payload: 仅传 trialSubject 时, 包成 [trialSubject]
 *
 * 更新时 (PUT /leads/:id):
 *   - 不可改 createdBy
 *   - 不可直接改 status (状态由服务流驱动: scheduled/tried/converted/lost)
 *   - lostReason 在 PUT 时可填 (与 status='lost' 联动)
 */

const phonePattern = /^1[3-9]\d{9}$/

exports.create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('孩子姓名 1-50 字'),
  body('phone').matches(phonePattern).withMessage('电话需为 11 位手机号'),
  body('gender').optional({ nullable: true }).isIn(GENDERS).withMessage('gender 非法'),
  body('age').optional({ nullable: true }).isInt({ min: 2, max: 25 }).withMessage('年龄 2-25'),
  body('school').optional({ nullable: true }).isMongoId().withMessage('school 需为合法 id'),
  body('grade').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('className').optional({ nullable: true }).isString().isLength({ max: 30 }),
  // 试听科目: 优先数组; 兼容老单值
  body('trialSubjects').optional({ nullable: true }).isArray({ max: 20 }).withMessage('trialSubjects 最多 20 项'),
  body('trialSubjects.*').optional().isMongoId().withMessage('trialSubjects 各项需为合法 id'),
  body('trialSubject').optional({ nullable: true }).isMongoId().withMessage('trialSubject 需为合法 id'),
  body('trialFee').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('trialFee 需为非负数'),
  body('source').optional({ nullable: true }).isString().isLength({ max: 50 }),
  body('inviteTeacher').optional({ nullable: true }).isMongoId().withMessage('inviteTeacher 需为合法 id'),
  body('expectedTime').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('specificDate').optional({ nullable: true }).isISO8601().withMessage('specificDate 需为 ISO 日期'),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 }),
  // 2026-06 业务: 1 家长带多孩 (同 phone 多 Lead) 合法, force=true 跳过软唯一检查
  body('force').optional({ nullable: true }).isBoolean().withMessage('force 需为 boolean')
]

exports.update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('gender').optional({ nullable: true }).isIn(GENDERS),
  body('age').optional({ nullable: true }).isInt({ min: 2, max: 25 }),
  body('school').optional({ nullable: true }).isMongoId(),
  body('grade').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('className').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('trialSubjects').optional({ nullable: true }).isArray({ max: 20 }),
  body('trialSubjects.*').optional().isMongoId(),
  body('trialSubject').optional({ nullable: true }).isMongoId(),
  body('trialFee').optional({ nullable: true }).isFloat({ min: 0 }),
  body('source').optional({ nullable: true }).isString().isLength({ max: 50 }),
  body('inviteTeacher').optional({ nullable: true }).isMongoId(),
  body('expectedTime').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('specificDate').optional({ nullable: true }).isISO8601(),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 }),
  // 状态字段: 仅允许 contact (contacted) / lost 流转; 其他由服务驱动
  body('status').optional().isIn(['contacted', 'lost']).withMessage('status 仅允许主动改 contacted/lost'),
  body('lostReason').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.list = [
  query('scope').optional().isIn(['mine', 'all']).withMessage('scope 必须是 mine|all'),
  query('status').optional().isString(),
  query('keyword').optional().isString().isLength({ max: 50 }),
  query('phone').optional().matches(phonePattern).withMessage('phone 需为 11 位手机号'),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 200 })
]

exports.createActivity = [
  body('type').isIn(['call', 'wechat', 'visit', 'sms', 'note']).withMessage('type 必须为 call/wechat/visit/sms/note'),
  body('at').optional().isISO8601().withMessage('at 需为 ISO 日期'),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.idParam = [
  param('id').isMongoId().withMessage('id 需为合法 id')
]
