'use strict'

const s = require('./studentProduct.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.remaining = async (req, res) => res.json(ApiResponse.ok(await s.remaining(req.params.id, req.orgId)))

// C 端 /student-products/me (R-2079 2026-07-01): 当前 active child 的 StudentProduct
// 复用 service.list,强制 student=req.activeStudentId,避免越权读到别人孩子的课包
exports.mine = async (req, res) =>
  res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, student: req.activeStudentId, ...req.query })))

/**
 * 赠课：员工直接为学生创建一个 StudentProduct（source='gift'）。
 * 必须在路由层校验 studentProduct.gift 权限。
 */
exports.gift = async (req, res) => {
  res.status(201).json(ApiResponse.created(await s.gift({
    orgId: req.orgId,
    operatorId: req.user && req.user.id,
    ...req.body
  })))
}

// 物理删除：超管+密码二次确认（requirePlatformPassword 路由层）；互锁检查 LessonAttendance.studentProduct + CourseEnrollment.studentProduct
// 详见 studentProduct.service.remove 与 utils/removable.assertUnused
exports.remove = async (req, res) =>
  res.json(ApiResponse.ok(await s.remove(req.params.id, req.orgId)))
// 删除预检：业务岗（studentProduct.read）即可查询，删除按钮触发前先弹挡板说明
exports.removableCheck = async (req, res) =>
  res.json(ApiResponse.ok(await s.removableCheck(req.params.id, req.orgId)))
