/**
 * sync-manifest.js — 从 .env 读 WX_MINI_APPID 注入 src/manifest.json 的 mp-weixin.appid
 *
 * 为什么需要它:
 *   manifest.json 是 uni-app 编译时直接读取的配置, 本身不支持环境变量。
 *   所以把 appid 配在 .env (集中、好改、可按环境区分), 由本脚本在 dev/build 前同步进 manifest。
 *
 * 实现方式: 正则定位 mp-weixin 段的 appid 并替换。
 *   - 不用 JSON.parse (manifest 可能是 jsonc 带注释, 或暂时不完整)
 *   - manifest 里有两处 appid: 顶层 "__UNI__xxx" (uni-app app) 和 mp-weixin 段的微信 appid; 只改后者
 *   - 只动 appid 那一行, 不改其他内容/格式/注释
 *
 * 触发: package.json 的 dev:mp-weixin / build:mp-weixin 命令开头 (&& 串联)。
 * 改 appid 只需改 .env 的 WX_MINI_APPID, 下次 dev/build 自动生效, 无需手编 manifest.json。
 *
 * .env 加载顺序 (与 vite 一致, 后者覆盖前者):
 *   .env → .env.{NODE_ENV} → .env.local → .env.{NODE_ENV}.local
 */
'use strict'

const fs = require('fs')
const path = require('path')

const clientRoot = path.resolve(__dirname, '..')

function loadEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const files = ['.env', `.env.${nodeEnv}`, '.env.local', `.env.${nodeEnv}.local`]
  const env = {}
  for (const f of files) {
    const p = path.join(clientRoot, f)
    if (!fs.existsSync(p)) continue
    const txt = fs.readFileSync(p, 'utf8')
    for (const line of txt.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      env[key] = val
    }
  }
  return env
}

const env = loadEnv()
// process.env 优先 (CI/命令行覆盖), .env 兜底
const appid = process.env.WX_MINI_APPID || env.WX_MINI_APPID

if (!appid) {
  // eslint-disable-next-line no-console
  console.log('[sync-manifest] .env 未设置 WX_MINI_APPID, 跳过 (保留现有 appid)')
  process.exit(0)
}

const manifestPath = path.join(clientRoot, 'src/manifest.json')
const txt = fs.readFileSync(manifestPath, 'utf8')

// 只匹配 mp-weixin 段内的 appid (段内到第一个 } 为止; 不碰顶层 __UNI__ appid)
const re = /("mp-weixin"\s*:\s*\{[^}]*?"appid"\s*:\s*")([^"]*)(")/
const m = txt.match(re)
if (!m) {
  // eslint-disable-next-line no-console
  console.warn('[sync-manifest] 未在 mp-weixin 段找到 appid, 跳过')
  process.exit(0)
}

const cur = m[2]
if (cur === appid) {
  // eslint-disable-next-line no-console
  console.log(`[sync-manifest] appid 已是 ${appid}, 无需更新`)
  process.exit(0)
}

fs.writeFileSync(manifestPath, txt.replace(re, `$1${appid}$3`), 'utf8')
// eslint-disable-next-line no-console
console.log(`[sync-manifest] mp-weixin.appid: ${cur || '(空)'} → ${appid}`)
