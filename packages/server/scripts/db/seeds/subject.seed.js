'use strict'

const Subject = require('@models/Subject.model')

/**
 * 学科种子。Subject.category 引用的是平台级 Category 字典（model === 'Subject'），
 * 由 category.seed 创建顶级条目（艺术 / 科技 / 综合）。这里把学科名映射到对应分类的 _id。
 *
 * 入参：subjectCategories —— category.seed.run() 返回值中 .subject 数组
 * 旧版本曾用 'art' / 'tech' 字符串占位，会导致 Subject.category 不是合法 ObjectId，
 * 进而让 GET /subjects 的 populate('category', ...) 在查询 Category._id 时抛 CastError。
 */
const DEFINITIONS = [
  { name: '美术', categoryName: '艺术' },
  { name: '音乐', categoryName: '艺术' },
  { name: '编程', categoryName: '科技' }
]

async function run(org, subjectCategories) {
  await Subject.deleteMany({ org: org._id })

  const catMap = new Map()
  if (Array.isArray(subjectCategories)) {
    for (const c of subjectCategories) catMap.set(c.name, c._id)
  }

  const docs = DEFINITIONS.map((s) => ({
    org: org._id,
    name: s.name,
    category: catMap.get(s.categoryName) || null
  }))

  const created = await Subject.insertMany(docs)
  const unassigned = DEFINITIONS.filter((s) => !catMap.has(s.categoryName))
  if (unassigned.length) {
    // eslint-disable-next-line no-console
    console.warn(`[seed.subject] 以下学科未匹配到 category 分类，置 null: ${unassigned.map((s) => s.name).join(', ')}`)
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.subject] ${created.map((d) => d.name).join(', ')}`)
  return created
}

module.exports = { run }
