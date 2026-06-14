import { ref } from 'vue'
import { reportApi } from '@/api/report'

/**
 * 看板通用 load 封装。
 *  - 把 loading / generatedAt / data 集中管理
 *  - 让 5 个 page 只需要写 echarts 渲染与表格
 *  - http 响应拦截器已把 body 解包出来，res 是 {success,code,message,data:{...}}
 *
 * @param {string} apiName  reportApi 里的方法名
 *                        'overview' | 'lessonConsumption' | 'roomUtilization'
 *                        | 'teacherProductivity' | 'pointsActivity'
 * @returns {{
 *   data: import('vue').Ref<object>,
 *   loading: import('vue').Ref<boolean>,
 *   generatedAt: import('vue').Ref<string>,
 *   load: (params?: {range?:string, from?:string, to?:string}) => Promise<void>
 * }}
 *
 * @example
 *   const { data, loading, generatedAt, load } = useReportApi('overview')
 *   const currentRange = ref({ range: 'month' })
 *   async function reloadByRange(next) {
 *     currentRange.value = next
 *     await load(next)
 *   }
 *   onMounted(() => reloadByRange(currentRange.value))
 */
export function useReportApi(apiName) {
  const data = ref({})
  const loading = ref(false)
  const generatedAt = ref('')

  async function load(params = {}) {
    loading.value = true
    try {
      const body = await reportApi[apiName](params)
      data.value = body?.data || {}
      generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    } catch (_) {
      // http 拦截器已 ElMessage；data 保留旧值，template 兜底显示 '—'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, generatedAt, load }
}
