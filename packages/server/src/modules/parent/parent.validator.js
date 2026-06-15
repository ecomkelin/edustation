'use strict'

const { body, query, param } = require('express-validator')
const { GENDERS } = require('@shared/enums')

/**
 * 招生试听 - 家长账户 (Parent) 校验
 *
 * 核心端点:
 *   - POST /parents/with-child  (核心): 1 API 创建 Parent + 1 ChildLead + N TrialBooking
 *   - POST /parents/:id/children: 同家长加孩
 *   - POST /parents/:id/tags / DELETE /parents/:id/tags/:tagId: 标签管理
 *   - POST /parents/:id/recompute-lifecycle: 手动重算
 *
 * 必填 (录入最低要求, withChild): phone + name (孩子的姓名)
 * 可选: source, sourceDetail, promoteBy, consultant, referrer, tags, trialSubjects (数组),
 *       gender, age, school, grade, className, trialFee, inviteTeacher, expectedTime,
 *       specificDate, remark, force
 */

const phonePattern = /^1[3-9]\d{9}$/

exports.withChild = [
  body('phone').matches(phonePattern).withMessage('电话需为 11 位手机号'),
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('孩子姓名 1-50 字'),
  body('gender').optional({ nullable: true }).isIn(GENDERS).withMessage('gender 非法'),
  body('age').optional({ nullable: true }).isInt({ min: 2, max: 25 }).withMessage('年龄 2-25'),
  body('school').optional({ nullable: true }).isMongoId(),
  body('grade').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('className').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('trialSubjects').optional({ nullable: true }).isArray({ max: 20 }),
  body('trialSubjects.*').optional().isMongoId(),
  body('trialSubject').optional({ nullable: true }).isMongoId(),
  body('trialFee').optional({ nullable: true }).isFloat({ min: 0 }),
  // source 改为 Channel 字典的 ObjectId; 不传 → service 兜底 = '地推'
  body('source').optional({ nullable: true }).isMongoId().withMessage('source 需为 Channel 字典 id'),
  body('sourceDetail').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('promoteBy').optional({ nullable: true }).isMongoId(),
  body('consultant').optional({ nullable: true }).isMongoId(),
  body('referrer').optional({ nullable: true }).isMongoId(),
  body('inviteTeacher').optional({ nullable: true }).isMongoId(),
  body('expectedTime').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('specificDate').optional({ nullable: true }).isISO8601(),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('force').optional({ nullable: true }).isBoolean()
]

exports.addChild = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }),
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
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 }),
  // source: Channel 字典 id; 不传 → 继承 parent.source → 兜底 '地推'
  body('source').optional({ nullable: true }).isMongoId().withMessage('source 需为 Channel 字典 id'),
  body('sameAs').optional({ nullable: true }).isArray(),
  body('sameAs.*').optional().isMongoId()
]

exports.update = [
  // source 改为 Channel 字典的 ObjectId
  body('source').optional({ nullable: true }).isMongoId().withMessage('source 需为 Channel 字典 id'),
  body('sourceDetail').optional().isString().isLength({ max: 200 }),
  body('promoteBy').optional({ nullable: true }).isMongoId(),
  body('consultant').optional({ nullable: true }).isMongoId(),
  body('referrer').optional({ nullable: true }).isMongoId(),
  body('remark').optional({ nullable: true }).isString().isLength({ max: 500 }),
  // 2026-06-15: 允许手动改 lifecycle (5 态)
  // 业务取舍: 手动改的 lifecycle 跟系统 recompute 推算的 lifecycle 可能不一致;
  // 'lost' 标签仍会强制翻 lost (优先级最高); 其他标签/转化不会反向覆盖手动值
  body('lifecycle').optional().isIn(['new', 'partial', 'full', 'lost', 'dormant'])
    .withMessage('lifecycle 必须是 new/partial/full/lost/dormant')
]

exports.list = [
  query('scope').optional().isIn(['mine', 'all']).withMessage('scope 必须是 mine|all'),
  query('lifecycle').optional().isString(),
  query('keyword').optional().isString().isLength({ max: 50 }),
  query('phone').optional().matches(phonePattern),
  query('tag').optional().isMongoId(),
  // source 过滤: Channel 字典 id
  query('source').optional().isMongoId(),
  query('promoteBy').optional().isMongoId(),
  query('consultant').optional().isMongoId(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 200 })
]

exports.addTag = [
  body('tagId').isMongoId().withMessage('tagId 需为合法 id')
]

exports.idParam = [
  param('id').isMongoId().withMessage('id 需为合法 id')
]

exports.tagIdParam = [
  param('id').isMongoId(),
  param('tagId').isMongoId()
]
