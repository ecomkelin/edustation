import http from './http'

/**
 * 站点配置 API (备案号 / 运营主体 / 客服电话 / 平台 logo)
 *
 * 后端路由 /api/v1/site-config 见 packages/server/src/modules/siteConfig/siteConfig.routes.js
 * GET 公开, PUT 仅平台超管 (requirePlatformAdmin)
 */
export const siteConfigApi = {
  get: () => http.get('/site-config'),
  update: (data) => http.put('/site-config', data)
}
