import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElIcons from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useSiteConfigStore } from './stores/siteConfig'
import './styles/index.scss'

const app = createApp(App)

// 全局注册 ElementPlus 图标
for (const [key, comp] of Object.entries(ElIcons)) {
  app.component(key, comp)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 启动时:并行恢复登录态 + 加载站点配置 (Footer 备案号/版权等)
// 任一失败都不阻塞 mount, store 内部已 catch
const auth = useAuthStore()
const siteConfig = useSiteConfigStore()
Promise.allSettled([auth.restore(), siteConfig.load()]).finally(() => {
  app.mount('#app')
})
