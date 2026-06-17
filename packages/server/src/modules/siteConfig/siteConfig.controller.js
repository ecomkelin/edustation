'use strict'

const s = require('./siteConfig.service')
const ApiResponse = require('@utils/ApiResponse')

exports.get = async (req, res) => {
  res.json(ApiResponse.ok(await s.get()))
}

exports.update = async (req, res) => {
  // fileBindOrgId 取 req.orgId (若有) 用于 logo 文件绑定校验;
  // 平台超管通常不带 orgId, 此时 fileBind 走 null 路径
  const data = await s.update(req.body, { fileBindOrgId: req.orgId || null })
  res.json(ApiResponse.ok(data))
}
