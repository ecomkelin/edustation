'use strict'

/**
 * 包裹 async controller，自动捕获异常传给 next (最终到 errorHandler)。
 *
 * @param {(req,res,next)=>Promise<any>} fn
 * @returns {(req,res,next)=>void}
 *
 * @example
 *   router.get('/users', authenticate, asyncHandler(c.list))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

module.exports = asyncHandler
