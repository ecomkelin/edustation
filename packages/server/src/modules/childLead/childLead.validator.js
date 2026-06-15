'use strict'

const { body, query, param } = require('express-validator')
const { GENDERS } = require('@shared/enums')

/**
 * 招生试听 - 孩子潜客 (ChildLead) 校验
 *
 * 端点:
 *   - POST /child-leads (单创建, parentId 必填)
 *   - PUT  /child-leads/:id (基础信息)
 *   - POST /child-leads/:id/activities (记触点)
 *   - POST /child-leads/:id/unconvert (5 分钟内撤销)
 *
 * 必填: parentId, name
 * 可选: gender, age, school, grade, className, trialSubjects, trialSubject,
 *       trialFee, inviteTeacher, expectedTime, specificDate, source, sameAs, remark
 */

exports.create = [
  body('parentId').isMongoId().withMessage('parentId 必填且为合法 id'),
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('孩子姓名 1-50 字'),
  body('gender').optional({ nullable: true }).isIn(GENDERS),
  body('age').optional({ nullable: true }).isInt({ min: 2, max: 25 }),
  body('school').optional({ nullable: true }).isMongoId(),
  body('grade').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('className').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('trialSubjects').optional({ nullable: true }).isArray({ max: 20 }),
  body('trialSubjects.*').optional().isMongoId(),
  body('trialSubject').optional({ nullable: true }).isMongoId(),
  body('trialFee').optional({ nullable: true }).isFloat({ min: 0 }),
  body('inviteTeacher').optional({ nullable: true }).isMongoId(),
  body('expectedTime').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('specificDate').optional({ nullable: true }).isISO8601(),
  // source 改为 Channel 字典的 ObjectId; 不传 → 继承 parent.source → 兜底 '地推'
  body('source').optional({ nullable: true }).isMongoId().withMessage('source 需为 Channel 字典 id'),
  body('sameAs').optional({ nullable: true }).isArray(),
  body('sameAs.*').optional().isMongoId(),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 })
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
  body('inviteTeacher').optional({ nullable: true }).isMongoId(),
  body('expectedTime').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('specificDate').optional({ nullable: true }).isISO8601(),
  // source 改为 Channel 字典的 ObjectId (编辑时允许改, 跟家长对齐)
  body('source').optional({ nullable: true }).isMongoId().withMessage('source 需为 Channel 字典 id'),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('status').optional().isIn(['contacted', 'lost']).withMessage('status 仅允许主动改 contacted/lost'),
  body('lostReason').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.list = [
  query('scope').optional().isIn(['mine', 'all']).withMessage('scope 必须是 mine|all'),
  query('status').optional().isString(),
  query('keyword').optional().isString().isLength({ max: 50 }),
  query('parent').optional().isMongoId(),
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

exports.updateActivity = [
  body('type').optional().isIn(['call', 'wechat', 'visit', 'sms', 'note']).withMessage('type 必须为 call/wechat/visit/sms/note'),
  body('at').optional().isISO8601().withMessage('at 需为 ISO 日期'),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 })
]

exports.idParam = [
  param('id').isMongoId().withMessage('id 需为合法 id')
]

exports.actIdParam = [
  param('id').isMongoId().withMessage('id 需为合法 id'),
  param('actId').isMongoId().withMessage('actId 需为合法 id')
]
