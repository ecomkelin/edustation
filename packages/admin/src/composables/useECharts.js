import { onBeforeUnmount, onMounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'

/**
 * echarts 通用 composable。
 *  - 监听 data 变化，setOption
 *  - 自动 onResize + dispose
 *  - 用 refMap 传 ref 名 → template ref 的映射，optionMap 传 ref 名 → option 构造器
 *
 * @param {() => object} dataGetter  响应式数据 getter（如 () => data.value）
 * @param {Record<string, import('vue').Ref<HTMLElement>>} refMap
 *        refName -> template ref（页面里 <div ref="xxxRef" />）
 * @param {Record<string, () => object>} optionMap
 *        refName -> option 构造器（在 dataGetter 返回值上工作）
 *
 * @example
 *   const peakHourBarRef = ref()
 *   const roomOccBarRef = ref()
 *   useECharts(() => data.value,
 *     { peakHourBarRef, roomOccBarRef },
 *     {
 *       peakHourBarRef: () => ({ tooltip:..., xAxis:..., series:[...] }),
 *       roomOccBarRef:  () => ({...})
 *     }
 *   )
 */
export function useECharts(dataGetter, refMap, optionMap) {
  const charts = []

  function renderAll() {
    nextTick(() => {
      for (const name of Object.keys(optionMap)) {
        const el = refMap[name]?.value
        if (!el) continue
        let c = echarts.getInstanceByDom(el)
        if (!c) {
          c = echarts.init(el)
          charts.push(c)
        }
        c.setOption(optionMap[name](), true)
      }
    })
  }

  watch(dataGetter, renderAll, { deep: true })
  onMounted(renderAll)

  function onResize() {
    for (const c of charts) c.resize()
  }
  window.addEventListener('resize', onResize)

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
    for (const c of charts) c.dispose()
  })
}
