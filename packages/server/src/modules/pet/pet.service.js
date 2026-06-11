'use strict'

const Pet = require('@models/Pet.model')
const ApiError = require('@utils/ApiError')

async function me({ orgId, student }) {
  if (!student) throw ApiError.badRequest('缺少 student')
  const p = await Pet.findOne({ org: orgId, student }).lean()
  return p
}

async function feed({ orgId, student }) {
  if (!student) throw ApiError.badRequest('缺少 student')
  // stub
  const p = await Pet.findOne({ org: orgId, student }).lean()
  if (!p) return { level: 1, experience: 0 }
  return { level: p.level, experience: p.experience }
}

module.exports = { me, feed }
