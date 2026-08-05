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
        '@': path.resolve(__dirname, './src'),
        // 2026-07-05: 跨端共用 SVG 头像枚举 (CJS, 走 module.exports)
        '@shared': path.resolve(__dirname, '../../shared')
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
        },
        // 2026-07-14: 补 /uploads 代理 — video / image / file 资源相对路径直接访问会落到 SPA index.html,
        //   触发 <video> @error SRC_NOT_SUPPORTED (uni-app H5 video 组件硬编码 detail={}, 排查难度高)
        //   proxy 到 server (3000) 即可在 dev 端正常加载 file.url="/uploads/..."
        //   生产部署走 nginx 等同 location /uploads proxy_pass http://server:3000;
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    },
    // 2026-07-05: shared/*.js 是 CJS, uni-app 多端编译对 CJS exports 兼容性差
    //   加入 optimizeDeps 让 esbuild 预构建走 ESM-CJS interop, 同 admin 配置
    // 2026-07-05: shared/*.js 是 CJS, uni-app 多端编译对 CJS exports 兼容性差
    //   加入 optimizeDeps 让 esbuild 预构建走 ESM-CJS interop, 同 admin 配置
    //   .mjs 通过 namespace import { default } 拿 CJS 命名空间
    // 2026-08-05: pinia uni-app 3.0 alpha 已经标记为 external, 必须 exclude 不要让 vite 介入
    //   include 会触发 "entry point pinia cannot be marked as external"
    //   让 uni-app 自家 vite-plugin 处理 pinia 注入 common_vendor 即可
    optimizeDeps: {
      include: ['@shared/avatars'],
      exclude: ['pinia']
    }
  }
})