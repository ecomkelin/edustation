'use strict'

const service = require('./audit.service')

exports.list = async (req, res) => {
  const data = await service.list(req.query)
  res.json({ success: true, data })
}

exports.detail = async (req, res) => {
  const data = await service.detail(req.params.id)
  if (!data) {
    return res.status(404).json({ success: false, message: '审计日志不存在' })
  }
  res.json({ success: true, data })
}

exports.stats = async (req, res) => {
  const data = await service.stats(req.query)
  res.json({ success: true, data })
}

exports.options = async (req, res) => {
  const data = await service.options()
  res.json({ success: true, data })
}

exports.exportCsv = async (req, res) => {
  const csv = await service.exportCsv(req.query)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`)
  // BOM 让 Excel 识别 UTF-8
  res.write('﻿')
  res.end(csv)
}
