/**
 * 前端"删除互锁"工具。
 *
 * 与后端 packages/server/src/utils/removable.js 对仗：
 *  - 后端做"实际查询 + 抛错/返回结果"；
 *  - 前端做"展示 blockers 给用户" + "批量预检路由"封装。
 *
 * 用法：
 *   import { showBlockedAlert, removableCheckThen, handleRemoveError } from '@/utils/removable'
 *
 *   // 1) 弹挡板说明（结构化弹窗：对象 + 关联数据列表 + 建议操作）
 *   await showBlockedAlert(blockers, '无法删除 · 高风险', '课程产品 少儿钢琴')
 *
 *   // 2) 渲染成 markdown 多行文本（兜底 / 日志）
 *   const md = formatBlockers(blockers, '教室 101')
 *
 * 弹窗本身由 <RemovableBlockedDialog> 单例组件渲染（挂在 App.vue），
 * 这里只是修改共享 ref，触发它显示。详见 @/composables/useBlockedDialog。
 */

import { showBlockedAlert as _showBlockedAlert } from '@/composables/useBlockedDialog'

/**
 * 把后端返回的 blockers 数组渲染成多行 markdown 文本。
 * 保留这个纯文本版本，用于：
 *   - 日志/调试
 *   - 不便挂载 Vue 组件的场景（如 SSR、单测）
 * 实际弹窗请直接用 showBlockedAlert。
 *
 * 每行："<label>：<count> 条（<hint>）"
 *
 * @param {Array<{label:string,count:number,hint:string}>} blockers
 * @param {string} [target]  被删除对象名（会作为首行标题）
 * @returns {string}
 */
export function formatBlockers(blockers, target = '') {
  if (!Array.isArray(blockers) || blockers.length === 0) return ''
  const head = target ? `对象：${target}\n` : ''
  const body = blockers
    .map((b) => `• ${b.label || '关联数据'}：${b.count || 0} 条（${b.hint || '请先处理相关数据'}）`)
    .join('\n')
  return head + body
}

/**
 * 弹一个挡板说明弹窗，列出 blockers。
 *
 * 实现：直接修改 <RemovableBlockedDialog> 单例的 ref，组件会显示。
 * 替代 ElMessageBox.alert + dangerouslyUseHTMLString: true 方案（不稳）。
 *
 * @param {Array} blockers
 * @param {string} [title='无法删除']   弹窗标题
 * @param {string} [target='']         被删除对象名（点明是哪一条）
 */
export async function showBlockedAlert(blockers, title = '无法删除', target = '') {
  _showBlockedAlert(blockers, title, target)
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
 * @param {string} [target]  可选：被删除对象名，用于挡板弹窗中点明
 */
export async function removableCheckThen(checkResult, onPass, target = '') {
  if (!checkResult || checkResult.canRemove) {
    return onPass(checkResult)
  }
  return showBlockedAlert(checkResult.blockers || [], '无法删除', target)
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
 *       await handleRemoveError(e, '无法删除 · 高风险', `课程产品 ${row.name}`)
 *     }
 *   }
 *
 * @param {any} err axios 错误对象
 * @param {string} [fallbackTitle='无法删除'] 弹挡板时的标题
 * @param {string} [target='']                被删除对象名（点明是哪一条）
 */
export async function handleRemoveError(err, fallbackTitle = '无法删除', target = '') {
  const { ElMessage } = await import('element-plus')
  const resp = err && err.response
  const data = resp && resp.data
  // ApiError.unprocessable 形态：{ success:false, message, data:{ blockers: [...] } }
  const blockers = data && data.data && Array.isArray(data.data.blockers) ? data.data.blockers : null
  if (blockers && blockers.length) {
    await showBlockedAlert(blockers, fallbackTitle, target)
    return
  }
  // 2026-06-18: 401 兜底 — 后端 requirePlatformPassword 各种 401 (token/密码错) 都明确告诉用户
  //   用户报告 "我超管删除 没效果" 实际可能就是这个分支: 后端返回 401, axios 拦截器弹 "Request failed"
  //   (用户没意识到是密码错), 现在加明确提示
  if (resp && resp.status === 401) {
    const backendMsg = data && data.message
    let hint = backendMsg || '登录状态失效或操作密码错误'
    if (backendMsg && /密码/.test(backendMsg)) {
      hint = `${backendMsg}。请重新输入您登录时的密码`
    } else if (backendMsg && /令牌|失效|过期/.test(backendMsg)) {
      hint = '登录状态已过期, 请刷新页面重新登录后再试'
    }
    ElMessage({
      type: 'error',
      message: `${target ? `「${target}」` : '操作'}失败: ${hint}`,
      duration: 4000,
      showClose: true
    })
    return
  }
  // 2026-06-18: 403 — 通常是"非超管"或"权限失效"
  if (resp && resp.status === 403) {
    const backendMsg = data && data.message
    ElMessage({
      type: 'error',
      message: `${target ? `「${target}」` : '操作'}失败: ${backendMsg || '权限不足, 仅平台超管可执行该操作'}`,
      duration: 4000,
      showClose: true
    })
    return
  }
  // 其他 (500/网络异常等)：原样抛出让 axios 拦截器 ElMessage
  throw err
}
