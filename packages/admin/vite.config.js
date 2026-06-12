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
        '/api': {
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
