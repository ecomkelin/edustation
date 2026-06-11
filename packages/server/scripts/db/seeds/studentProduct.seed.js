'use strict'

const StudentProduct = require('@models/StudentProduct.model')
const CourseProduct = require('@models/CourseProduct.model')

/**
 * 同步为 paid 订单生成 StudentProduct
 */
async function run(ctx) {
  const { org, orders } = ctx
  await StudentProduct.deleteMany({ org: org._id })

  const docs = []
  for (const o of orders) {
    const p = await CourseProduct.findById(o.courseProduct).lean()
    if (!p) continue
    docs.push({
      org: org._id,
      student: o.student,
      order: o._id,
      courseProduct: p._id,
      totalLessons: p.totalLessons,
      remainingLessons: p.totalLessons,
      expireDate: new Date(Date.now() + p.validDays * 24 * 60 * 60 * 1000),
      isActive: true
    })
  }
  return StudentProduct.insertMany(docs)
}

module.exports = { run }
