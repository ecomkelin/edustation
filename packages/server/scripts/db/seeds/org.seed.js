'use strict'

const Org = require('@models/Org.model')

/**
 * Org 演示种子 (2026-06 整改: type 不再引用 Category, 直接 hardcode 'arts').
 *
 * 历史: org.type 是 ObjectId ref Category, 本文件依赖 category.seed 先创建 '艺术' 分类.
 * 整改后: Org.type 是 String enum (10 种, 见 @shared/enums#ORG_TYPES), 无依赖.
 */
async function run() {
  await Org.deleteMany({})
  const org = await Org.create({
    unicode: '91110000123456789X',
    name: '示范艺术学校',
    nameAbbreviation: '示范艺术',
    type: 'arts',
    contactPerson: '张老师',
    contactPhone: '010-12345678',
    address: '北京市朝阳区',
    establishedDate: new Date('2020-01-15'),
    isActive: true
  })
  return org.toObject()
}

module.exports = { run }