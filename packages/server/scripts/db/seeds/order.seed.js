'use strict'

const Order = require('@models/Order.model')
const CourseProduct = require('@models/CourseProduct.model')
const { OrderStatus } = require('@shared/enums')

async function run(ctx) {
  const { org, students, courseProducts } = ctx
  await Order.deleteMany({ org: org._id })

  const docs = []
  for (let i = 0; i < 5; i++) {
    const student = students[i % students.length]
    const product = courseProducts[i % courseProducts.length]
    docs.push({
      org: org._id,
      student: student._id,
      courseProduct: product._id,
      originalPrice: product.price,
      actualPrice: product.price,
      paidAmount: product.price,
      status: OrderStatus.PAID,
      paymentMethod: 'wechat',
      remark: '种子订单 (自动支付)'
    })
  }
  return Order.insertMany(docs)
}

module.exports = { run }
