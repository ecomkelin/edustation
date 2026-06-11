'use strict'

const { validationResult } = require('express-validator')
const ApiError = require('@utils/ApiError')

/**
 * express-validator 错误转 ApiError(400)。
 * 用法：router.post('/xxx', [...validators], validateRequest, controller)
 */
module.exports = function validateRequest(req, res, next) {
  const result = validationResult(req)
  if (result.isEmpty()) return next()

  const errors = result.array().map((e) => ({
    field: e.path || e.param,
    message: e.msg,
    value: e.value
  }))
  return next(ApiError.badRequest(errors[0].message, errors))
}
