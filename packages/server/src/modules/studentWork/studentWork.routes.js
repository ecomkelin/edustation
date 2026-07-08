'use strict'

/**
 * 学生作品 (StudentWork) 路由 (MM=16)
 *
 * 路由编号 (R-MMPP):
 *   R-1600 GET    /student-works               列表 (admin / 教务 / 老师)
 *   R-1601 GET    /student-works/:id           详情 (admin / 教务 / 老师)
 *   R-1602 POST   /student-works               上传作品 (员工)
 *   R-1603 PATCH  /student-works/:id           编辑作品 4 字段 (员工)
 *   R-1604 DELETE /student-works/:id           物理删除 (超管+密码)
 *   R-1605 GET    /student-works/:id/removable-check  删除预检
 *   R-1606 GET    /student-works/stats         KPI 聚合 (admin)
 *   R-1640 GET    /student-works/export.csv    CSV 导出 (admin; AuditLogs 同款)
 *   R-1670 GET    /student-works/me            C 端家长 (active student)
 */
const router = require('express').Router()
const c = require('./studentWork.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 全局：认证 + 机构 + active student（activeStudent 在没传 header 时直接 next，不影响 admin 端点）
router.use(mws.authenticate, mws.requireOrg, mws.activeStudent)

// ─── C 端家长 ─────────────────────────────────────────────────────────
// /me 必须定义在 /:id 之前，否则会被 :id 路由吞掉
// 复用 requirePermission (家长无员工权限码; activeStudent middleware 已校验是监护人)
router.get('/me', asyncHandler(c.mine)) // R-1670

// ─── Admin 业务端 (聚合 / 导出) ───────────────────────────────────────
router.get('/stats', mws.requirePermission('studentWork.read'), asyncHandler(c.stats)) // R-1606
router.get('/export.csv', mws.requirePermission('studentWork.read'), asyncHandler(c.exportCsv)) // R-1640

// ─── Admin 业务端 (列表 / 详情 / CRUD) ────────────────────────────────
// 列表（分页；支持多维过滤 + 日期范围 + 等级范围 + 上传者 + 排序，详见 service.list）
router.get('/', mws.requirePermission('studentWork.read'), asyncHandler(c.list)) // R-1600
// 单条详情（C 端 detail.vue 用，替代原来从 list 过滤的 hack）
router.get('/:id', mws.requirePermission('studentWork.read'), asyncHandler(c.detail)) // R-1601
// 创建：JSON 入参 { lessonAttendance, title, fileIds: [id...], description?, level? }
//   文件已由前端先调 /storage/upload?scope=work (单) 或 /storage/upload-many?scope=work (多) 拿 fileIds
router.post('/', mws.requirePermission('studentWork.write'), asyncHandler(c.upload)) // R-1602
// 员工编辑：改 title / description / fileUrls / level；4 个 snapshot 字段不可改
router.patch('/:id', mws.requirePermission('studentWork.write'), asyncHandler(c.update)) // R-1603
// 物理删除（"误操"场景）：超管+密码二次确认（作品是孤儿数据，无业务互锁）
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove)) // R-1604
// 预检：作品无业务引用，始终 canRemove=true
router.get('/:id/removable-check', mws.requirePermission('studentWork.read'), asyncHandler(c.removableCheck))

// 2026-07-08: 归档 / 取消归档 (软隐藏, 与物理删除互为补充; 复用 studentWork.write 权限)
// R-1607 POST /student-works/:id/archive
router.post('/:id/archive', mws.requirePermission('studentWork.write'), asyncHandler(c.archive))
// R-1608 POST /student-works/:id/unarchive
router.post('/:id/unarchive', mws.requirePermission('studentWork.write'), asyncHandler(c.unarchive)) // R-1605

module.exports = router
