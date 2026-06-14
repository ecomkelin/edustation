'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')

/**
 * LocalDriver —— 阶段 1 默认驱动
 *
 * 把对象写到 `dir + key` 的位置，返回 `${baseUrl}/${key}` 作为 URL。
 * 阶段 1 的 ${baseUrl} 由 app.js 的 express.static 暴露。
 *
 * 路径布局：
 *   <dir>/<scope>/YYYY-MM/YYYYMMDD/<uuid>.<ext>
 *   URL：/uploads/<scope>/YYYY-MM/YYYYMMDD/<uuid>.<ext>
 */
class LocalDriver {
  constructor(opts) {
    this.name = 'local'
    this.dir = opts.dir
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '') // 去掉尾斜杠
  }

  /**
   * @param {object} args
   * @param {string} args.key 相对 dir 的路径
   * @param {Buffer} args.buffer 文件字节
   * @returns {Promise<{key:string, url:string, size:number}>}
   */
  async putObject({ key, buffer }) {
    const abs = path.join(this.dir, key)
    const dir = path.dirname(abs)
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(abs, buffer)
    const stat = await fsp.stat(abs)
    return { key, url: this.getPublicUrl(key), size: stat.size }
  }

  async removeObject(key) {
    const abs = path.join(this.dir, key)
    if (!fs.existsSync(abs)) return // 已不存在视为成功
    await fsp.unlink(abs)
    // 不递归删空目录（保留 YYYY-MM/ 结构便于排查）
  }

  getPublicUrl(key) {
    return `${this.baseUrl}/${key}`.replace(/\\+/g, '/')
  }
}

module.exports = LocalDriver
