/**
 * 全局「无法删除」弹窗的打开函数。
 *
 * 在 App.vue 里挂了一个 <RemovableBlockedDialog> 的单例实例，
 * 这里通过 import 一个共享的 ref 来控制它显隐 / 内容。
 *
 * 替代旧的 ElMessageBox.alert + dangerouslyUseHTMLString: true 方案。
 * 旧方案在 Element Plus 2.7.x 渲染复杂 HTML（特别是 <table> + padding）时
 * 容易被 message-box 默认样式压扁或被 v-html 解析异常。
 */

import { ref } from 'vue'

const visible = ref(false)
const title = ref('无法删除')
const target = ref('')
const blockers = ref([])

/**
 * 打开挡板说明弹窗。
 *
 * @param {Array} blockers_arg  关联数据列表 [{label,count,hint}, ...]
 * @param {string} [titleArg='无法删除']
 * @param {string} [targetArg='']  被删除对象名
 */
export function showBlockedAlert(blockers_arg, titleArg = '无法删除', targetArg = '') {
  blockers.value = Array.isArray(blockers_arg) ? blockers_arg : []
  title.value = titleArg
  target.value = targetArg || ''
  visible.value = true
}

export function useBlockedDialogState() {
  return { visible, title, target, blockers }
}
