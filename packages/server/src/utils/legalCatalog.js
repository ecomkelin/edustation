'use strict'

const fs = require('fs')
const path = require('path')
const { marked } = require('marked')

/**
 * 平台级法律协议清单加载器 (单例 + 内存缓存)
 *
 * 设计:
 *   - 启动时 (main.js bootstrap 第 1.6 步) 调 load() 一次性加载 5 份平台协议
 *   - 文件 = shared/legal/<file>.md, frontmatter (YAML 风格) 含 version/title/effectiveAt/required/scope/summary
 *   - markdown 部分用 `marked` 编译成 HTML, 服务端预编译, 前端/client 直接 v-html / rich-text 渲染
 *   - in-memory Map<key, {frontmatter, markdown, html}>, 启动后调 get(key) 同步取
 *   - 协议升版 = 改 .md 文件 frontmatter 的 version → git push → 部署 → server 启动重新 load
 *
 * 不引入 gray-matter / js-yaml 第三方 deps:
 *   - 我们的 frontmatter 极简 (无嵌套、无数组、无多行字符串), 用 30 行手写解析即可
 *   - 减少 supply-chain 攻击面
 *
 * 错误处理:
 *   - manifest 中声明的文件缺失 / frontmatter 缺必需字段 → 直接 throw, 阻止 server 启动
 *     (协议缺失是合规风险, 必须 fail-loud)
 */

const SHARED_LEGAL_DIR = path.join(__dirname, '../../../../shared/legal')

// 内存缓存: key → { frontmatter, markdown, html }
const loaded = new Map()
let isLoaded = false

/**
 * 解析 frontmatter (YAML 风格简化版).
 * 仅支持 `key: value` 两段, value 自动 trim 引号 / 转 Number / 转 Boolean.
 *
 * 输入 (文件首尾两个 `---` 之间的部分):
 *   key: user-agreement
 *   version: 1.0.0
 *   required: true
 *
 * 输出: { key: 'user-agreement', version: '1.0.0', required: true }
 */
function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/)
  const obj = {}
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let value = m[2].trim()
    // 去除引号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    // Boolean / Number 自动转
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value)
    obj[key] = value
  }
  return obj
}

/**
 * 把 .md 文件拆成 frontmatter 部分和 markdown 部分.
 * 文件结构:
 *   <!-- 注释 -->  (可选)
 *   ---
 *   key: ...
 *   version: ...
 *   ---
 *   # 标题
 *   ...正文...
 */
function splitMarkdown(content) {
  // 去掉文件头部的 HTML 注释 (我们的 .md 有 "占位待法务审阅" 注释行)
  let body = content.replace(/^\s*<!--[\s\S]*?-->\s*/m, '')
  // 找两个 --- 之间
  const m = body.match(/^---\s*[\r\n]+([\s\S]*?)^---\s*[\r\n]+([\s\S]*)$/m)
  if (!m) {
    return { frontmatter: {}, markdown: body }
  }
  return { frontmatter: parseFrontmatter(m[1]), markdown: m[2] }
}

/**
 * 启动时加载平台协议清单 (幂等, 重复调用 no-op).
 */
function loadPlatformLegal() {
  if (isLoaded) return { count: loaded.size, status: 'already-loaded' }

  const manifest = require(path.join(SHARED_LEGAL_DIR, '_manifest.js'))
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('[legalCatalog] manifest 为空, 无法启动')
  }

  // marked 配置: 单行 \n 转 <br/> (合同条款格式友好)
  marked.setOptions({ breaks: false, gfm: true })

  for (const entry of manifest) {
    const filePath = path.join(SHARED_LEGAL_DIR, entry.file)
    if (!fs.existsSync(filePath)) {
      throw new Error(`[legalCatalog] manifest 声明的文件不存在: ${entry.file}`)
    }
    const raw = fs.readFileSync(filePath, 'utf8')
    const { frontmatter, markdown } = splitMarkdown(raw)

    // 关键字段校验
    if (!frontmatter.key) throw new Error(`[legalCatalog] ${entry.file} 缺少 frontmatter.key`)
    if (!frontmatter.version) throw new Error(`[legalCatalog] ${entry.file} 缺少 frontmatter.version`)
    if (!frontmatter.title) throw new Error(`[legalCatalog] ${entry.file} 缺少 frontmatter.title`)
    if (frontmatter.key !== entry.key) {
      throw new Error(`[legalCatalog] ${entry.file} frontmatter.key=${frontmatter.key} 与 manifest.key=${entry.key} 不一致`)
    }

    const html = marked.parse(markdown || '')
    loaded.set(entry.key, {
      key: entry.key,
      file: entry.file,
      required: !!entry.required,
      frontmatter,
      markdown,
      html
    })
  }

  isLoaded = true
  // eslint-disable-next-line no-console
  console.log(`[legal-catalog] loaded ${loaded.size} platform docs`)
  return { count: loaded.size, status: 'ok' }
}

/**
 * 取单份协议 (启动后同步调用).
 * @returns {{ key, frontmatter, markdown, html, required } | null}
 */
function get(key) {
  return loaded.get(key) || null
}

/**
 * 取全部协议清单 (manifest 顺序, 不含 markdown 原文以减小响应体).
 * @returns {Array<{ key, title, version, effectiveAt, required, scope, summary }>}
 */
function list() {
  return Array.from(loaded.values()).map((doc) => ({
    key: doc.key,
    title: doc.frontmatter.title,
    version: doc.frontmatter.version,
    effectiveAt: doc.frontmatter.effectiveAt,
    required: doc.required,
    scope: doc.frontmatter.scope || 'platform',
    summary: doc.frontmatter.summary || ''
  }))
}

/**
 * 仅取 required=true 的协议 (登录强制接受用).
 */
function getRequired() {
  return Array.from(loaded.values()).filter((d) => d.required)
}

/**
 * 返回所有平台协议 key → 当前生效版本号 的 Map.
 * 用于 computePendingConsents 与 UserConsent 对比.
 */
function getMaxVersions() {
  const m = {}
  for (const [key, doc] of loaded.entries()) {
    m[key] = doc.frontmatter.version
  }
  return m
}

module.exports = {
  loadPlatformLegal,
  get,
  list,
  getRequired,
  getMaxVersions
}
