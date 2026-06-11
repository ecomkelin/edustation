'use strict'

const Region = require('@models/Region.model')

/**
 * 地区种子：示范用北京市/海淀区。
 */
async function run() {
  await Region.deleteMany({})
  const bj = await Region.create({ name: '北京市', level: 0, sort: 0, isActive: true })
  await Region.create({ name: '海淀区', parent: bj._id, level: 1, sort: 0, isActive: true })
  await Region.create({ name: '朝阳区', parent: bj._id, level: 1, sort: 1, isActive: true })
  return { bj }
}

module.exports = { run }
