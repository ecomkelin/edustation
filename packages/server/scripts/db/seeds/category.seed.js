'use strict'

const Category = require('@models/Category.model')

/**
 * 类别字典种子：初始化 Org 类型、Student 顶级、Subject 顶级（学科分类）。
 *
 * 返回值结构：{ org, subject }，供后续 seed 消费
 *   - org     : Org 类型 Category 文档数组（培训 / 艺术 / 综合）
 *   - subject : Subject 顶级 Category 文档数组（艺术 / 科技 / 综合）
 *               学科种子根据这里的 _id 给 Subject.category 赋真实 ObjectId
 */
async function run() {
  await Category.deleteMany({})

  // ---- Org 类型
  const orgTypes = ['培训', '艺术', '综合']
  const orgCats = []
  for (let i = 0; i < orgTypes.length; i++) {
    const c = await Category.create({ model: 'Org', name: orgTypes[i], level: 0, sort: i, isActive: true })
    orgCats.push(c.toObject())
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.category] Org 类型: ${orgCats.map((c) => c.name).join(', ')}`)

  // ---- Student 顶级
  await Category.insertMany([
    { model: 'Student', name: '常规', level: 0, sort: 0 },
    { model: 'Student', name: '试学', level: 0, sort: 1 }
  ])
  // eslint-disable-next-line no-console
  console.log('[seed.category] Student 顶级: 常规, 试学')

  // ---- Subject 顶级（学科分类）
  const subjectTypes = ['艺术', '科技', '综合']
  const subjectCats = []
  for (let i = 0; i < subjectTypes.length; i++) {
    const c = await Category.create({ model: 'Subject', name: subjectTypes[i], level: 0, sort: i, isActive: true })
    subjectCats.push(c.toObject())
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.category] Subject 类型: ${subjectCats.map((c) => c.name).join(', ')}`)

  return { org: orgCats, subject: subjectCats }
}

module.exports = { run }
