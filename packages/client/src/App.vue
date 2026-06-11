<script>
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'

export default {
  onLaunch() {
    // 启动时尝试恢复登录态
    const auth = useAuthStore()
    auth.restore().then((user) => {
      if (user) {
        const student = useStudentStore()
        return student.fetchMyStudents().catch(() => null)
      }
      return null
    })
  },
  onShow() {
    // 每次进入前台时如有缓存 token 静默拉取一次 /me
    const auth = useAuthStore()
    if (auth.accessToken) {
      auth.fetchMe().catch(() => null)
    }
  }
}
</script>

<style lang="scss">
/* 全局样式 - 注意 uni-app 不支持顶层 :root，需要写到 page */
page {
  background-color: #f7f8fa;
  color: #1f2937;
  font-size: 28rpx;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
}

.flex-row { display: flex; flex-direction: row; align-items: center; }
.flex-col { display: flex; flex-direction: column; }
.flex-1 { flex: 1; }
.gap-8 { gap: 8rpx; }
.gap-16 { gap: 16rpx; }
.gap-24 { gap: 24rpx; }
.text-12 { font-size: 24rpx; }
.text-14 { font-size: 28rpx; }
.text-16 { font-size: 32rpx; }
.text-18 { font-size: 36rpx; }
.text-20 { font-size: 40rpx; }
.text-muted { color: #9ca3af; }
.text-strong { font-weight: 600; }
.card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}
.btn-primary {
  background: #5B8FF9;
  color: #ffffff;
  border-radius: 12rpx;
  padding: 20rpx 32rpx;
  text-align: center;
}
.btn-secondary {
  background: #ffffff;
  color: #5B8FF9;
  border: 2rpx solid #5B8FF9;
  border-radius: 12rpx;
  padding: 18rpx 30rpx;
  text-align: center;
}
.tag {
  display: inline-block;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  background: #eef2ff;
  color: #5B8FF9;
}
.tag-warn {
  background: #fff1f0;
  color: #f5222d;
}
.tag-success {
  background: #f6ffed;
  color: #52c41a;
}
.empty-state {
  text-align: center;
  padding: 80rpx 32rpx;
  color: #9ca3af;
}
.divider {
  height: 1rpx;
  background: #e5e7eb;
  margin: 16rpx 0;
}
</style>
