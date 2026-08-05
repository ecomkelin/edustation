'use strict'

/**
 * Mock marked 避免 jest transform ESM 问题.
 * 我们的测试不真渲染 markdown, 只关心协议元数据 (version/title).
 */

// 被 require('marked') 替代的轻量 stub
const html = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

module.exports = {
  marked: Object.assign(
    function marked(input, opts) { return html(input) },
    {
      parse: (s) => html(s),
      setOptions: () => {},
      getDefaults: () => ({}),
      use: () => {},
      walkTokens: () => {},
      parseInline: (s) => html(s),
      Parser: class {},
      Lexer: class {},
      Renderer: class {},
      TextRenderer: class {},
      Tokenizer: class {},
      Hooks: class {},
      options: {},
      defaults: {}
    }
  )
}