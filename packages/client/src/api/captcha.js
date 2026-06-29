/**
 * Captcha API - 滑块验证 (R-0110/R-0111)
 */
import { http } from './request'

export const captchaApi = {
  challenge() {
    return http.get('/captcha/challenge', { skipRefresh: true })
  },

  verify({ token, x, track }) {
    return http.post('/captcha/verify', { token, x, track }, { skipRefresh: true })
  }
}