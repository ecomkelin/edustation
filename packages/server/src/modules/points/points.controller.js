'use strict'

const s = require('./points.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 家长端积分 controller
 *
 * GET  /me           - 当前激活子女的账户 + 最近流水
 * GET  /transactions - 当前激活子女的流水分页
 * POST /earn         - [internal-only] 内部触发入账
 *                       本期未开放给家长端使用；阶段 3 分享得积分 / 签到 等业务会调此端点
 *                       （直接调 service.recordTransaction 也行，不强制走 HTTP）
 *
 * 2026-08-05: 跨孩子/全机构 dump 堵口 (审计 H4/S3)
 *   - 之前 `student = req.query.student || req.activeStudentId` 让 query 控制目标学号 → 家长可读他人余额/流水
 *   - 现在强制 student=req.activeStudentId, 拒绝 query/body 覆盖
 *   - controller 入口 fail-closed: 缺 activeStudentId 直接 400
 *   - earn 路由挂 requirePermission('points.write') (见 routes.js 同次改动)
 */
exports.me = async (req, res) => {
  if (!req.activeStudentId) {
    return res.status(400).json(ApiResponse.fail('缺少 x-active-student-id'))
  }
  const data = await s.me({ orgId: req.orgId, student: req.activeStudentId })
  res.json(ApiResponse.ok(data))
}

exports.earn = async (req, res) => {
  // earn 路由已挂 requirePermission('points.write'), 此处仅做参数清洗
  // (service.recordTransaction 仍按 trigger=manual_earn + operatorId=req.user.id 落账)
  if (!req.activeStudentId) {
    return res.status(400).json(ApiResponse.fail('缺少 x-active-student-id'))
  }
  const { trigger, reason, refType, refId, meta, remark } = req.body
  const data = await s.recordTransaction({
    orgId: req.orgId,
    studentId: req.activeStudentId, // 强制 activeStudentId, 拒绝 body.student 覆盖
    trigger: trigger || 'manual_earn',
    amount: req.body.amount,
    reasonId: reason,
    operatorId: req.user && req.user.id,
    refType,
    refId,
    meta,
    remark
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.transactions = async (req, res) => {
  if (!req.activeStudentId) {
    return res.status(400).json(ApiResponse.fail('缺少 x-active-student-id'))
  }
  const { page, pageSize } = req.query
  const data = await s.transactions({ orgId: req.orgId, student: req.activeStudentId, page, pageSize })
  res.json(ApiResponse.ok(data))
}
