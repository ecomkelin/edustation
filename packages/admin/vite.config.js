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
    server: {
      port: 8000,
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
