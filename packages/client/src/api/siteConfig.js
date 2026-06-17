import http from '@/utils/request'

/**
 * 站点配置 API (client / uni-app 端)
 * GET 公开,无需 token; 家长端"我的"页底部 footer 展示备案号 + 版权用
 */
export const siteConfigApi = {
  get: () => http.get('/site-config')
}
