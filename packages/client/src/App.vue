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