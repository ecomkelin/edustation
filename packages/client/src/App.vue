<!--
  App.vue - 启动恢复 + 全局样式 + 路由守卫
-->
<script>
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import { useSiteConfigStore } from '@/stores/siteConfig'

export default {
  onLaunch() {
    // 1) 站点配置 (备案号/版权) - 公开, 不依赖登录
    const site = useSiteConfigStore()
    site.load().catch(() => null)

    // 2) 登录态恢复
    const auth = useAuthStore()
    auth.restore().then((user) => {
      if (user) {
        const stu = useStudentStore()
        return stu.fetchMyStudents().catch(() => null)
      }
      return null
    })
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