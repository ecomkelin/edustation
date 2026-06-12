/**
 * 前端"删除互锁"工具。
 *
 * 与后端 packages/server/src/utils/removable.js 对仗：
 *  - 后端做"实际查询 + 抛错/返回结果"；
 *  - 前端做"展示 blockers 给用户" + "批量预检路由"封装。
 *
 * 用法：
 *   import { formatBlockers, showBlockedAlert, removableCheckThen } from '@/utils/removable'
 *
 *   // 1) 直接用 ElMessageBox.alert 弹挡板说明
 *   showBlockedAlert(blockers)
 *
 *   // 2) 渲染成 markdown 多行文本（塞 alert 的 message 或自定义弹窗）
 *   const md = formatBlockers(blockers)
 */

/**
 * 把后端返回的 blockers 数组渲染成多行中文文本。
 * 每行："<label>：<count> 条（<hint>）"
 *
 * @param {Array<{label:string,count:number,hint:string}>} blockers
 * @returns {string}
 */
export function formatBlockers(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return ''
  return blockers
    .map((b) => `• ${b.label || '关联数据'}：${b.count} 条（${b.hint || '请先处理相关数据'}）`)
    .join('\n')
}

/**
 * 弹一个 ElMessageBox.alert，把 blockers 列出来。
 * 失败/异常时 fallback 到 ElMessage.error。
 *
 * @param {Array} blockers
 * @param {string} [title='无法删除']
 */
export async function showBlockedAlert(blockers, title = '无法删除') {
  // 动态 import 避免循环依赖(http.js 也会引 utils,这里又引 elmessage)
  const [{ default: ElMessageBox }, { ElMessage }] = await Promise.all([
    import('element-plus'),
    import('element-plus')
  ])
  const body = formatBlockers(blockers) || '存在未知关联数据，请联系管理员'
  try {
    await ElMessageBox.alert(body, title, {
      type: 'warning',
      dangerouslyUseHTMLString: false,
      confirmButtonText: '我知道了'
    })
  } catch (_) {
    // 用户关了弹窗，不做任何事
  }
}

/**
 * 包装"先 removable-check 再决定走哪条路径"的高阶函数：
 *  - canRemove=true → 调 onPass(removableCheckResponse)
 *  - canRemove=false → 弹挡板说明
 *
 * 设计意图：每个列表页只需要写一次这个 if/else。
 *
 * @param {{canRemove:boolean,blockers:Array}} checkResult 后端 GET /:id/removable-check 的 data
 * @param {() => any} onPass 可以删除时调（弹 DestructiveConfirm 等）
 */
export async function removableCheckThen(checkResult, onPass) {
  if (!checkResult || checkResult.canRemove) {
    return onPass(checkResult)
  }
  return showBlockedAlert(checkResult.blockers || [])
}

/**
 * 删除动作的「兜底」错误处理：用于 `onRemoveConfirm` 的 catch 分支。
 *
 * 即使前端预检通过，调用 `api.remove` 时仍可能因为：
 *   - 竞态（用户在弹密码窗的 30s 内，又有人报名了）
 *   - 前端未调用预检（业务上也允许不接 precheck 直接调 remove）
 *   - 后端 422 错误里带 data.blockers
 * 而失败。此时 axios 拦截器只会 ElMessage 一行字，blockers 没展示。
 *
 * 本函数做三件事：
 *   1) 解析 err.response.data.data.blockers（后端 ApiError.unprocessable 形态）
 *   2) 有 blockers → 调 showBlockedAlert 列出来（与预检失败 UX 一致）
 *   3) 无 blockers（如密码错/403/网络异常）→ 抛出原 err，让 axios 拦截器 ElMessage 处理
 *
 * 用法（在 DestructiveConfirm 的 @confirm 回调里）：
 *   async function onRemoveConfirm(row, { password }) {
 *     try {
 *       await api.remove(row._id, { password })
 *       ElMessage.success('已删除')
 *       load()
 *     } catch (e) {
 *       await handleRemoveError(e, '无法删除 · 高风险')
 *     }
 *   }
 *
 * @param {any} err axios 错误对象
 * @param {string} [fallbackTitle='无法删除'] 弹挡板时的标题
 */
export async function handleRemoveError(err, fallbackTitle = '无法删除') {
  const resp = err && err.response
  const data = resp && resp.data
  // ApiError.unprocessable 形态：{ success:false, message, data:{ blockers: [...] } }
  const blockers = data && data.data && Array.isArray(data.data.blockers) ? data.data.blockers : null
  if (blockers && blockers.length) {
    await showBlockedAlert(blockers, fallbackTitle)
    return
  }
  // 没有结构化 blockers：原样抛出让 axios 拦截器 ElMessage
  throw err
}
