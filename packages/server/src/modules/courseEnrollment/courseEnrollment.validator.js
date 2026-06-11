'use strict'

const { body } = require('express-validator')
const { COURSE_ENROLLMENT_STATUSES } = require('@shared/enums')

// 报名创建:支持两种入参形态(为了兼容客户端单值调用 + admin 批量调用)
//  - 老形态:{ courseInstance, student }   —— 单个学生(client/uni-app 在用)
//  - 新形态:{ courseInstance, students: [..] } —— 批量学生(admin 后台用)
// 业务上(service 层)会把两种形态统一成数组处理,且校验"至少传一个"。
exports.create = [
  body('courseInstance').isMongoId().withMessage('courseInstance 必填'),
  body('student').optional().isMongoId().withMessage('student 必须是 ObjectId'),
  body('students').optional().isArray({ min: 1 }).withMessage('students 必须是非空数组'),
  body('students.*').optional().isMongoId().withMessage('students 元素必须是 ObjectId'),
  body().custom((value) => {
    if (!value.student && (!Array.isArray(value.students) || value.students.length === 0)) {
      throw new Error('请提供 student 或 students')
    }
    return true
  })
]

exports.setStatus = [
  body('toStatus').isIn(COURSE_ENROLLMENT_STATUSES).withMessage('toStatus 非法'),
  body('reason').optional().isString().isLength({ max: 500 })
]

// 调整班级(分班)。仅允许 courseInstance / student 形状校验;
// 业务约束(不能改 status / enrolledAt;不能 student 改人;enrolled 才允许;
// 目标开班状态等)由 service 层把关。
exports.update = [
  body('courseInstance').optional().isMongoId(),
  body('student').optional().isMongoId(),
  // 教务手动指定/调整该学生在该开班的主用课包；null / '' 表示清空
  body('studentProduct').optional({ nullable: true }).custom((v) => {
    if (v === null || v === '') return true
    return /^[0-9a-fA-F]{24}$/.test(String(v))
  }).withMessage('studentProduct 必须是 ObjectId 或 null')
]

// 误操删除(物理删除):仅超管可用,需二次输入自己的登录密码确认。
// 长度 6-64 防止误传空串或超长串拖库;真实校验由 service 走 argon2.verify。
exports.remove = [
  body('password').isString().isLength({ min: 6, max: 64 }).withMessage('请输入 6-64 位操作密码以确认')
]
