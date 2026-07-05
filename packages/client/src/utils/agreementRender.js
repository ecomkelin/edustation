/**
 * agreementRender - 协议 markdown 简易渲染 (2026-07-05)
 *
 * 背景: 跟 AgreementModal (popup 弹窗) 抽出来共用, 让 PendingConsents (inline 展开)
 *       也能直接渲染 markdown, 不要再开 sub-modal.
 *
 * 后端 placeholder HTML 已经接 inline 用, 真 markdown 用本函数简易渲染:
 *   - # / ## 标题
 *   - * / - 列表 (合并 <ul>)
 *   - 行间 **bold** / _italic_
 *   - 空行 <br>
 *
 * 任何 XSS 由 _escape 转义防御 (html 标签或 script 无法注入).
 */
const ESCAPE_MAP = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }

function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ESCAPE_MAP[c])
}

function inlineMd(s) {
  let r = escapeHtml(s)
  r = r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  r = r.replace(/(^| )_(.+?)_( |$)/g, '$1<em>$2</em>$3')
  return r
}

/** Markdown 简易渲染 → HTML 字符串 */
export function renderAgreementMarkdown(text) {
  if (!text) return PLACEHOLDER_HTML
  const lines = String(text).split('\n')
  let html = ''
  let inList = false
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      if (inList) { html += '</ul>'; inList = false }
      html += '<br/>'
      continue
    }
    if (t.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h2>${escapeHtml(t.slice(2))}</h2>`
    } else if (t.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h3>${escapeHtml(t.slice(3))}</h3>`
    } else if (/^[-*]\s+/.test(t)) {
      if (!inList) { html += '<ul>'; inList = true }
      html += `<li>${inlineMd(t.replace(/^[-*]\s+/, ''))}</li>`
    } else {
      if (inList) { html += '</ul>'; inList = false }
      html += `<p>${inlineMd(t)}</p>`
    }
  }
  if (inList) html += '</ul>'
  return html
}

/** 后端没接协议正文 → 占位欢迎页 */
export const PLACEHOLDER_HTML = [
  '<div class="agreement-placeholder">',
  '  <div class="agreement-placeholder__emoji">📄</div>',
  '  <h3>欢迎使用 EduStation</h3>',
  '  <p>请您仔细阅读以下条款, 勾选"我已阅读并同意"后即可继续:</p>',
  '  <ul>',
  '    <li>您承诺所提交的注册信息真实、有效,并妥善保管账户密码</li>',
  '    <li>您同意 EduStation 按照隐私政策收集、使用您的个人信息</li>',
  '    <li>您理解课程报名/退款/课包使用须遵守机构的具体规则</li>',
  '    <li>您同意 EduStation 通过短信/App 推送向您发送课程提醒</li>',
  '    <li>本协议具体条款以平台最终公示版本为准</li>',
  '  </ul>',
  '  <p class="agreement-placeholder__tip">如需查阅完整协议文本, 请联系客服</p>',
  '</div>'
].join('\n')

/** markdown or HTML 字符串 → HTML 字符串 (后端若返已渲染 HTML, 直接用; 否则走 markdown 渲染) */
export function renderAgreement(raw) {
  if (!raw) return PLACEHOLDER_HTML
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    // 看起来已经是 HTML (后端 placeholder / 服务端预渲染)
    return raw
  }
  return renderAgreementMarkdown(raw)
}
