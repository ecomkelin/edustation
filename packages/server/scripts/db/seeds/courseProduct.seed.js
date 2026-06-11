'use strict'

const CourseProduct = require('@models/CourseProduct.model')

/**
 * 课程产品（合并自原 CourseTemplate + CoursePackage）：
 * 既是教学大纲，也是可售卖单位。
 */
const DEFINITIONS = [
  { subjectIdx: 0, name: '儿童创意美术启蒙', totalLessons: 20, price: 2400, validDays: 180, syllabus: '线条 / 色彩 / 创意手工' },
  { subjectIdx: 0, name: '素描基础', totalLessons: 30, price: 3600, validDays: 240, syllabus: '几何 / 静物 / 人物' },
  { subjectIdx: 1, name: '少儿声乐', totalLessons: 10, price: 1500, validDays: 90, syllabus: '气息 / 节奏 / 演唱' },
  { subjectIdx: 2, name: 'Scratch 编程入门', totalLessons: 20, price: 2800, validDays: 180, syllabus: '顺序 / 循环 / 条件 / 事件' },
  { subjectIdx: 2, name: 'Python 进阶', totalLessons: 30, price: 4500, validDays: 365, syllabus: '语法 / 数据结构 / 小项目' }
]

async function run(ctx) {
  const { org, subjects } = ctx
  await CourseProduct.deleteMany({ org: org._id })
  return CourseProduct.insertMany(
    DEFINITIONS.map((d) => ({
      ...d,
      subject: subjects[d.subjectIdx]._id,
      org: org._id
    }))
  )
}

module.exports = { run }
