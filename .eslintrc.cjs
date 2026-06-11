/* eslint-env node */
module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2022: true
  },
  extends: ['standard', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'off'
  },
  overrides: [
    {
      files: ['**/*.vue'],
      extends: ['plugin:vue/vue3-recommended'],
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
        'vue/html-closing-bracket-newline': 'off'
      }
    },
    {
      files: ['**/scripts/**/*.js', '**/seeds/**/*.js'],
      env: { node: true },
      rules: {
        'no-console': 'off'
      }
    },
    {
      files: ['packages/admin/**/*.{js,vue}'],
      env: { browser: true, es2022: true, node: true }
    },
    {
      files: ['packages/server/**/*.js', 'shared/**/*.js'],
      env: { node: true, es2022: true }
    }
  ],
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.pnpm-store',
    'packages/server/uploads',
    'packages/admin/dist'
  ]
}
