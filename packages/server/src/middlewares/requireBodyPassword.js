'use strict'

const ApiError = require('@utils/ApiError')

/**
 * 操作密码二次确认中间件 (2026-07-08 立项, task 模块率先使用)
 *
 * 与 requirePlatformPassword 的区别:
 *   - requirePlatformPassword: 仅限平台超管 (isPlatformAdmin=true) + 输密码
 *     适用: 跨机构核心实体的物理删除 (Org 禁用, CourseProduct/Room 等)
 *   - requireBodyPassword:     不限超管, 只要当前已登录用户输对自身密码即可
 *     适用: 工作流类实体的物理删除 (Task 等), 权限位由前置 requirePermission 决定
 *
 * 用法 (挂在 DELETE 路由上, 必须 requirePermission 在前):
 *   router.delete('/:id', mws.requirePermission('task.delete'), mws.requireBodyPassword, asyncHandler(c.remove))
 *
 * 行为:
 *   1) 必须已登录 (req.user) — 由 authenticate 保证, 此处只兜底
 *   2) body.password 必填
 *   3) argon2.verify 对照 req.user 自己的 passwordHash
 *
 * 失败响应:
 *   - 未登录       → 401
 *   - 缺密码       → 400
 *   - 账号失效     → 401
 *   - 密码错误     → 401
 *
 * 业务互锁 (无引用才放行 / 状态机校验) 由各 service.remove 自己负责, 本中间件
 * 只管身份/密码, 不做业务校验 — 单一职责 + 可复用。
 *
 * 注意: 必须挂在 authenticate 之后 (依赖 req.user.id); 可与 requirePermission 串联。
 */
module.exports = async function requireBodyPassword(req, res, next) {
  try {
    if (!req.user || !req.user.id) return next(ApiError.unauthorized())
    const pwd = req.body && req.body.password
    if (!pwd || !String(pwd).trim()) {
      return next(ApiError.badRequest('请输入操作密码以确认'))
    }
    const User = require('@models/User.model')
    const password = require('@utils/password')
    const user = await User.findOne({ _id: req.user.id, isActive: true }).select('+passwordHash')
    if (!user) return next(ApiError.unauthorized('账号不存在或已停用'))
    const ok = await password.verify(user.passwordHash, String(pwd))
    if (!ok) return next(ApiError.unauthorized('操作密码错误'))
    next()
  } catch (e) {
    next(e)
  }
}
