'use strict'

/**
 * AI 助手 - 文件解析器
 *
 * 支持格式：
 *  - Excel (.xlsx / .xls / sheet): 转 JSON 行数据, 限 500 行
 *  - PDF: 抽文字, 限 50k 字
 *  - 图片 (image/*): 转 base64 (OpenAI vision 协议)
 *  - 其他: 抛错 (前端 AiFileUploader 已限定 mime, 兜底)
 *
 * 流程：
 *  1. File.findOne({_id, org, deletedAt:null}) 校验存在性 + 跨租户隔离
 *  2. fs.readFile 按 driver+key 读 buffer
 *  3. 按 mime 分发到具体 parser
 *  4. 返回 {kind, text, rows?, imageBase64?, mime, size, fileId}
 */

const fs = require('fs/promises')
const path = require('path')
const mongoose = require('mongoose')
const { File } = require('@models/File.model')
const ApiError = require('@utils/ApiError')
const config = require('@config/index')
const xlsx = require('xlsx')

const MAX_XLSX_ROWS = 500
const MAX_PDF_CHARS = 50_000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB（图片 base64 会膨胀 ~33%，控成本）

/**
 * 解析单个 fileId。返回结构化数据，供 controller 拼到 user message。
 *
 * @param {Object} args
 * @param {string} args.fileId
 * @param {string} args.orgId
 * @returns {Promise<{
 *   fileId: string,
 *   kind: 'xlsx' | 'pdf' | 'image' | 'unknown',
 *   text: string,
 *   rows?: Array<{sheetName: string, rows: any[]}>,
 *   imageBase64?: string,
 *   mime?: string,
 *   size?: number,
 *   originalName?: string
 * }>}
 */
async function parse({ fileId, orgId }) {
  if (!mongoose.isValidObjectId(fileId)) throw ApiError.badRequest('fileId 非法')
  if (!orgId) throw ApiError.badRequest('缺少 orgId')

  const file = await File.findOne({ _id: fileId, org: orgId, deletedAt: null }).lean()
  if (!file) throw ApiError.notFound('文件不存在或不属于本机构')

  const mime = file.mime || ''
  const absPath = path.join(config.upload.dir, file.key)

  // 图片路径：base64 直接进 vision 块
  if (mime.startsWith('image/')) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw ApiError.badRequest(`图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB (实际 ${Math.round(file.size / 1024 / 1024)}MB)，请压缩后再上传`)
    }
    const buf = await fs.readFile(absPath)
    return {
      fileId: String(file._id),
      kind: 'image',
      text: '[图片]',
      imageBase64: buf.toString('base64'),
      mime,
      size: file.size,
      originalName: file.originalName || ''
    }
  }

  // Excel 路径
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('spreadsheet')) {
    const buf = await fs.readFile(absPath)
    const wb = xlsx.read(buf, { type: 'buffer' })
    const sheets = []
    for (const sheetName of wb.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
      sheets.push({
        sheetName,
        rows: rows.slice(0, MAX_XLSX_ROWS).map((r) => {
          // xlsx 头部去空格 (兼容人类编辑时常加的空格)
          const out = {}
          for (const k of Object.keys(r)) out[String(k).trim()] = r[k]
          return out
        })
      })
    }
    let text = ''
    for (const s of sheets) {
      text += `\n[Sheet: ${s.sheetName}, 共 ${s.rows.length} 行]\n`
      text += JSON.stringify(s.rows, null, 2)
    }
    if (text.length > 80_000) {
      text = text.slice(0, 80_000) + `\n...(已截断，完整数据请调用 list_* 系列工具逐条查询)`
    }
    return {
      fileId: String(file._id),
      kind: 'xlsx',
      text,
      rows: sheets,
      mime,
      size: file.size,
      originalName: file.originalName || ''
    }
  }

  // PDF 路径
  if (mime === 'application/pdf') {
    let pdfParse
    try {
      pdfParse = require('pdf-parse')
    } catch (e) {
      throw ApiError.internal('pdf-parse 未安装, 请运行 pnpm --filter @edustation/server add pdf-parse')
    }
    const buf = await fs.readFile(absPath)
    const { text: fullText } = await pdfParse(buf)
    const text = (fullText || '').slice(0, MAX_PDF_CHARS)
    const truncated = (fullText || '').length > MAX_PDF_CHARS
    return {
      fileId: String(file._id),
      kind: 'pdf',
      text: truncated ? text + '\n...(PDF 已截断)' : text,
      mime,
      size: file.size,
      originalName: file.originalName || ''
    }
  }

  // 其他格式：尝试当文本读
  try {
    const buf = await fs.readFile(absPath)
    const text = buf.toString('utf8').slice(0, MAX_PDF_CHARS)
    return {
      fileId: String(file._id),
      kind: 'unknown',
      text,
      mime,
      size: file.size,
      originalName: file.originalName || ''
    }
  } catch (e) {
    throw ApiError.badRequest(`不支持的文件类型: ${mime}`)
  }
}

module.exports = { parse }