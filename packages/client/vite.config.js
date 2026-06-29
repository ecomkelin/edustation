import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // 允许通过环境变量覆盖代理目标,避免与隔壁项目端口冲突
  // 推荐用法:在 packages/client/.env.development 里设 VITE_PROXY_TARGET=http://localhost:3000
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [uni()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          // 注入主题变量 + mixin 到每个组件 (reset 不注入, 它含 page {} 全局选择器, 由 App.vue 单独 @use)
          // 注: 用 @use ... as * 替代 @import (Dart Sass 3.0 将移除 @import);
          //     as * 把所有成员暴露到全局命名空间, 组件内 $primary/@include flex-between 写法不变
          additionalData: `@use "@/styles/variables.scss" as *; @use "@/styles/mixins.scss" as *;`
        }
      }
    },
    server: {
      host: '0.0.0.0', // 局域网可访问 (默认只绑 localhost)
      port: 9000,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  }
})