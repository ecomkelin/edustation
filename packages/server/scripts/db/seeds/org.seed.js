'use strict'

const Org = require('@models/Org.model')
const Category = require('@models/Category.model')

async function run() {
  await Org.deleteMany({})
  const orgType = await Category.findOne({ model: 'Org', name: '艺术' }).lean()
  if (!orgType) throw new Error('请先运行 category.seed 以初始化 Org 类型')

  const org = await Org.create({
    unicode: '91110000123456789X',
    name: '示范艺术学校',
    nameAbbreviation: '示范艺术',
    type: orgType._id,
    contactPerson: '张老师',
    contactPhone: '010-12345678',
    address: '北京市朝阳区',
    establishedDate: new Date('2020-01-15'),
    isActive: true
  })
  return org.toObject()
}

module.exports = { run }
