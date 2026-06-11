/* eslint-env node */
module.exports = {
  root: false,
  env: { node: true, es2022: true },
  extends: ['../../.eslintrc.cjs'],
  parserOptions: { sourceType: 'script', ecmaVersion: 2022 }
}
