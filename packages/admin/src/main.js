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

// 2026-07-08: 过滤 Vue 3 dev mode 已知误报 — "Property X was accessed during render but is
//   not defined on instance"。Vue 3.4 + <script setup> + Element Plus 2.7 组合下, EP 的
//   useFormItem / ElTabs 内部 watch 触发 instance.proxy[key], key 可能是 'reload' 等
//   内部组件方法, dev warn 误报成模板未定义。功能不受影响, 仅 dev mode console 噪音。
//   仅当不是真正的 props/emit 警告时才沉默; 真错误仍走 console.error。
// 2026-07-12: 补一类 — ElMenuCollapseTransition 在 ElSubMenu 折叠动画时, EP 内部在 transition
//   钩子里调 slot(), Vue 3.4 dev mode 报警 "Slot 'default' invoked outside of the render function"。
//   栈 <ElIcon> <ElSubMenu> <BaseTransition> <Transition> <ElMenuCollapseTransition> <ElMenu> ...
//   不影响功能, 仅 dev mode console 噪音; 默认折叠或菜单 hover 时反复触发。
const KNOWN_FALSE_POSITIVE_RENDER_PATTERNS = [
  /Property ["']?[a-zA-Z]+["']? was accessed during render but is not defined on instance/,
  // Vue 3.4 还在 ElFormItem 的 addInputId/removeInputId 触发另一种 warn
  /Set operation on key ["']?\w+["']? failed: target is readonly/,
  // EP 2.7 ElMenuCollapseTransition: slot 'default' invoked outside of the render function
  /Slot ["']default["'] invoked outside of the render function/
]

const app = createApp(App)

// 必须在 createApp 之后挂 (TDZ: app 是 const, 创建前访问会抛 ReferenceError)
app.config.warnHandler = (msg, instance, trace) => {
  if (typeof msg === 'string' && KNOWN_FALSE_POSITIVE_RENDER_PATTERNS.some((re) => re.test(msg))) {
    return  // 已知误报, 静默
  }
  // 其余 warn / trace 走原生通道
  console.warn(`[Vue warn]: ${msg}${trace ? `\n${trace}` : ''}`)
}

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
