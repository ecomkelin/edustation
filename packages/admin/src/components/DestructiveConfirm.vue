<template>
  <span class="destructive-confirm">
    <!-- 触发按钮:slot 由调用方提供(通常是 el-button) -->
    <span @click="onClick">
      <slot />
    </span>
  </span>
</template>

<script setup>
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { showBlockedAlert } from '@/utils/removable'

/**
 * 「破坏性操作」二次确认组件。
 *
 * 设计目标:全站物理删除(误操删除)统一交互节奏。
 *
 * 流程:
 *   1) 用户点触发按钮(slot)
 *   2) **可选 precheck**: 若传 :precheck,先异步调一次,失败则弹挡板并终止
 *   3) ElMessageBox.confirm 显示"高风险"提示 + 阻断说明
 *   4) 用户点继续 → ElMessageBox.prompt 输入自己的登录密码
 *   5) 密码长度合法 → emit('confirm', { password })
 *
 * 适用范围:
 *   - 所有走 requirePlatformPassword(后端) 的接口
 *   - 业务页面不需要自己写 ElMessageBox,只要在 slot 放按钮 + 监听 confirm 即可
 *
 * Props:
 *   - target:   string   被删除对象的可读名称(如"课程产品 少儿钢琴 48 节");空时会用 generic
 *   - warning:  string   高风险/中风险/低风险 描述
 *   - reason:   string   阻断原因说明(默认:"该操作不可恢复,且仅限「误操」场景")
 *   - confirm:  string   第一次确认弹窗的按钮文案
 *   - precheckNotes: string[]   无关联数据才能执行的细则(显示在第二次弹窗中)
 *   - precheck:    () => Promise<{canRemove:boolean, blockers?:Array}>  异步预检;
 *                 返回 canRemove=false 时弹挡板说明并不继续;不传则跳过预检
 *   - disabled: boolean  业务上不可执行时(如服务端校验失败预判),禁止点击
 */
const props = defineProps({
  target: { type: String, default: '' },
  warning: { type: String, default: '高风险' },
  reason: { type: String, default: '此操作不可恢复。已结业/已启用的记录请优先走「停用」或「退班/退课」操作。' },
  confirm: { type: String, default: '继续' },
  precheckNotes: { type: Array, default: () => [] },
  precheck: { type: Function, default: null },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel', 'blocked'])

const auth = useAuthStore()
const currentUserRealName = (auth.user && (auth.user.realName || auth.user.mobile)) || '当前账号'

async function onClick() {
  if (props.disabled) {
    ElMessage.warning('当前对象不可执行该操作')
    return
  }
  // 0) 预检(若传了 precheck)
  if (typeof props.precheck === 'function') {
    let result
    try {
      result = await props.precheck()
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || e?.message || '预检失败')
      return
    }
    if (!result || result.canRemove !== true) {
      const blockers = (result && result.blockers) || []
      emit('blocked', blockers)
      await showBlockedAlert(blockers, `无法删除 · ${props.warning}`)
      return
    }
  }
  // 1) 第一次确认:风险说明
  try {
    await ElMessageBox.confirm(
      buildFirstMessage(),
      `误操删除 · ${props.warning}`,
      {
        type: 'error',
        confirmButtonText: props.confirm,
        cancelButtonText: '取消',
        dangerouslyUseHTMLString: false
      }
    )
  } catch (_e) {
    emit('cancel')
    return
  }
  // 2) 第二次确认:输密码
  try {
    const { value: pwd } = await ElMessageBox.prompt(
      `请输入「${currentUserRealName}」的登录密码以确认:`,
      '操作密码',
      {
        type: 'warning',
        inputType: 'password',
        inputPlaceholder: '登录密码(6-64位)',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        inputValidator: (v) => (v && v.length >= 6 && v.length <= 64) || '请输入 6-64 位密码',
        inputErrorMessage: '请输入 6-64 位密码'
      }
    )
    if (!pwd) return
    emit('confirm', { password: pwd })
  } catch (_e) {
    // 取消不报错
  }
}

function buildFirstMessage() {
  const target = props.target ? `「${props.target}」` : '该对象'
  const lines = [
    `即将物理删除${target}。`,
    '',
    props.reason,
    '',
    '点击「继续」后,需输入您的登录密码完成二次确认。'
  ]
  if (props.precheckNotes && props.precheckNotes.length > 0) {
    lines.push('', '执行前置条件:')
    for (const n of props.precheckNotes) lines.push(`  · ${n}`)
  }
  return lines.join('\n')
}
</script>

<style scoped>
.destructive-confirm {
  display: inline-block;
}
</style>
