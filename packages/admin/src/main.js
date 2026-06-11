import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElIcons from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import './styles/index.scss'

const app = createApp(App)

// 全局注册 ElementPlus 图标
for (const [key, comp] of Object.entries(ElIcons)) {
  app.component(key, comp)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 启动时尝试恢复登录态
const auth = useAuthStore()
auth.restore().finally(() => {
  app.mount('#app')
})
