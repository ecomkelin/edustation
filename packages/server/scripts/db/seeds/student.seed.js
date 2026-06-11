'use strict'

const Student = require('@models/Student.model')

const STUDENTS = [
  { name: '赵小明', gender: 'male', birthday: '2016-03-12' },
  { name: '赵小红', gender: 'female', birthday: '2018-07-21' },
  { name: '钱小宝', gender: 'male', birthday: '2015-11-05' },
  { name: '孙小花', gender: 'female', birthday: '2017-01-30' },
  { name: '李乐乐', gender: 'male', birthday: '2019-09-09' },
  { name: '李甜甜', gender: 'female', birthday: '2020-05-15' }
]

async function run(ctx) {
  const { org, users } = ctx
  await Student.deleteMany({ org: org._id })

  // 家长 = 139 开头的 mobile
  const parents = users.filter((u) => u.mobile.startsWith('139'))
  const docs = STUDENTS.map((s, i) => {
    const guardian = parents[i % parents.length]
    return {
      ...s,
      org: org._id,
      guardians: [guardian._id],
      guardianUser: guardian._id,
      notes: `家长: ${guardian.realName}`,
      isActive: true
    }
  })
  return Student.insertMany(docs)
}

module.exports = { run }
