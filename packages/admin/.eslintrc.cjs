/* eslint-env node */
module.exports = {
  root: false,
  env: { browser: true, es2022: true, node: true },
  extends: ['../../.eslintrc.cjs', 'plugin:vue/vue3-recommended'],
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/comment-directive': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/singleline-html-element-content-newline': 'off',
    'vue/html-self-closing': 'off',
    'vue/attributes-order': 'off',
    'vue/html-indent': 'off',
    'vue/attribute-hyphenation': 'off',
    'vue/v-on-event-hyphenation': 'off',
    'vue/first-attribute-linebreak': 'off',
    'vue/html-closing-bracket-newline': 'off',
    'vue/html-closing-bracket-spacing': 'off',
    'vue/mustache-interpolation-spacing': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
  }
}
