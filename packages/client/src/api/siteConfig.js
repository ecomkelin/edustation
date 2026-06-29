/**
 * SiteConfig API - 平台公开配置 (R-3200)
 * 备案号 / 版权 / 运营主体
 */
import { http } from './request'

export const siteConfigApi = {
  get() {
    return http.get('/site-config', { skipRefresh: true })
  }
}