import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // 允许通过环境变量覆盖代理目标（默认指向后端默认端口 3000）。
  // 旁路跑后端时：在 packages/admin/.env.development 里覆盖
  //   VITE_PROXY_TARGET=http://localhost:其它端口
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, '../../shared')
      }
    },
    // 2026-06: shared/*.js 是 CommonJS, Vite dev 默认按 ESM 解析, 会报
    // `exports is not defined`. optimizeDeps.include 强制 esbuild 预构建走 CJS interop,
    // 把 `exports.X = X` 和 `module.exports = ...` 都转成 ESM named exports.
    // 后端 server 端用 require('@shared/enums') 不受影响 (走 module-alias, 不是 Vite).
    optimizeDeps: {
      // 用 alias 名 (@shared) 让 Vite 走 resolve.alias 找到路径
      // 2026-07-05: 加 @shared/avatars (用户/学生 10 个预制 SVG, 前端通过 .mjs 镜像)
      //   与 shared/enums.js 同理: esbuild 把 CJS 包成 `__commonJS` + `export default require_xxx()`,
      //   `.mjs` 里 namespace import 拿到的 `{ default: ... }`.
      // 2026-07-16: petConfig 走 .mjs 桥接；.mjs 内部仍要 import .js, 所以 .js 必须留在
      //   include 里 (否则浏览器直接拿到原始 CJS, 抛 `exports is not defined`)
      include: ['@shared/enums.js', '@shared/permissions.js', '@shared/avatars', '@shared/petConfig.js']
    },
    server: {
      port: 8000,
      // 局域网访问必须监听所有接口；不写的话 Vite 默认只绑 localhost,
      // 导致 127.0.0.1 和 LAN IP (192.168.1.x) 都连不上,
      // 但本机浏览器用 localhost 又是 OK 的, 看起来很玄学.
      host: true,
      proxy: {
        // 业务 API
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        },
        // 上传文件（后端 express.static 暴露的 /uploads）
        // 否则 Vite 的 SPA fallback 会把 /uploads/xxx.png 当成前端路由，
        // 返回 index.html，导致管理后台的图片预览、头像、作品缩略图全部 200 + text/html。
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    }
  }
})
