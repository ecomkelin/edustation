<!--
  App.vue - 启动恢复 + 全局样式 + 路由守卫
-->
<script>
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import { useSiteConfigStore } from '@/stores/siteConfig'
import { storage, StorageKeys } from '@/utils/storage'

export default {
  onLaunch(options) {
    // #ifdef MP-WEIXIN
    // 带参小程序码的 scene (机构 orgId / 邀请码), 存起来供 wxBind 用
    if (options && options.query && options.query.scene) {
      try {
        const scene = decodeURIComponent(options.query.scene)
        if (scene) storage.set(StorageKeys.WX_SCENE, scene)
      } catch (_) {}
    }
    // #endif

    // 1) 站点配置 (备案号/版权) - 公开, 不依赖登录
    const site = useSiteConfigStore()
    site.load().catch(() => null)

    // 2) 登录态恢复
    // 2026-08-04: 增加「失败兜底跳登录」逻辑
    //   - 有 token → /me 成功 → 透明 (老用户)
    //   - 无 token → wxRefresh 成功 → 透明 (cookie / storage 模式下)
    //   - 全部失败 → 静默试一次微信静默登录 (wxLogin), 已绑定直接进首页, 未绑定跳登录
    // 原则: 已绑定用户**完全不需要手动登录页**; 只有从没绑定过的用户才看到登录页
    const auth = useAuthStore()
    auth.restore().then((user) => {
      if (user) {
        const stu = useStudentStore()
        return stu.fetchMyStudents().catch(() => null)
      }
      // restore 失败: 试微信静默登录
      return this._silentWxLogin()
    })
  },

  methods: {
    /**
     * 微信静默登录 (兜底, 2026-08-04)
     * 已是小程序用户 → 直接进首页 (对客户透明)
     * 未绑定 → 跳登录页
     */
    _silentWxLogin() {
      // #ifdef MP-WEIXIN
      return new Promise((resolve) => {
        uni.login({
          provider: 'weixin',
          success: (loginRes) => {
            if (!loginRes || !loginRes.code) {
              this._goLogin()
              return resolve()
            }
            const auth = useAuthStore()
            auth.wxLogin({ code: loginRes.code }).then((res) => {
              if (res && res.status === 'bound') {
                // 已绑定, 透明进入首页
                const stu = useStudentStore()
                stu.fetchMyStudents().catch(() => null)
              } else {
                // 未绑定, 跳登录
                this._goLogin()
              }
              resolve()
            }).catch(() => {
              this._goLogin()
              resolve()
            })
          },
          fail: () => {
            this._goLogin()
            resolve()
          }
        })
      })
      // #endif
      // #ifndef MP-WEIXIN
      this._goLogin()
      return Promise.resolve()
      // #endif
    },

    _goLogin() {
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      const curRoute = cur ? `/${cur.route}` : ''
      if (!curRoute.startsWith('/pages/auth/')) {
        uni.reLaunch({ url: '/pages/auth/login' })
      }
    }
  },
  onShow() {
    // 每次进前台静默拉 /me
    const auth = useAuthStore()
    if (auth.accessToken) {
      auth.fetchMe().catch(() => null)
    }
  },
  onError(err) {
    // uni-app x 3.0 H5 已知良性误报 (2026-07-04 用户反馈):
    //   "TypeError: Cannot set properties of null (setting 'scrollTop')"
    //   触发场景: 从详情页 uni.navigateBack() 返回上一页(本页),
    //   框架翻页过渡时会尝试恢复 scroll-view 滚动位置,但 DOM 节点短暂 null
    //   不影响功能,只是 DevTools 噪音。详见 routes-server.md 关联 memory。
    const msg = String((err && (err.message || err)) || '')
    if (/setting\s+['"]?scrollTop['"]?/i.test(msg) || /Cannot set propert(y|ies) of null/i.test(msg)) {
      return
    }
    console.error('[App onError]', err)
  }
}
</script>

<style lang="scss">
@use './styles/reset.scss' as *;

page {
  background: $bg-page;
  color: $text-primary;
}
</style>