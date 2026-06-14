'use strict'

/**
 * 存储驱动抽象
 *
 * 所有 driver 必须实现：
 *   - async putObject({ key, buffer, mime }) -> { key, url, size }
 *   - async removeObject(key)
 *   - getPublicUrl(key) -> string
 *   - name -> 'local' | 's3'
 *
 * 阶段 1：local 驱动（multer diskStorage 落本地磁盘，express.static 暴露）
 * 阶段 2：s3 驱动（MinIO/AWS S3，putObject 用 @aws-sdk/client-s3）
 *
 * 通过 config.storage.driver 选 driver，单例缓存。
 */

const config = require('@config/index')
const LocalDriver = require('./local.driver')

let _instance = null

function getDriver() {
  if (_instance) return _instance
  const name = config.storage.driver
  if (name === 'local') {
    _instance = new LocalDriver(config.storage.local)
    return _instance
  }
  if (name === 's3') {
    // 阶段 2 接入
    throw new Error('S3 驱动尚未实现，请保持 STORAGE_DRIVER=local')
  }
  throw new Error(`未知存储驱动: ${name}`)
}

/**
 * 生成一个 driver 无关的内部 key。
 * 形态：<scope>/<YYYY-MM>/<YYYYMMDD>/<uuid>.<ext>
 *  - local：相对 config.storage.local.dir 的子路径
 *  - s3：bucket 内 key
 *
 * 由 service.upload() 调一次；driver.putObject 内部不再生成 key。
 */
function buildKey({ scope, originalName, ext }) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const { v4: uuidv4 } = require('uuid')
  const safeExt = (ext || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
  return `${scope}/${ym}/${ymd}/${uuidv4()}${safeExt ? '.' + safeExt : ''}`
}

module.exports = { getDriver, buildKey }
