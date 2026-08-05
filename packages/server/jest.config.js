'use strict'

// Jest 配置
// - setupFiles: 在 require 业务代码之前注入环境变量 (envValidator 强校验)
// - beforeAll/afterAll (在 tests/setup.js): 启停 mongodb-memory-server
// - afterEach (在 tests/setup.js): 清空所有 collection
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/tests/**/*.test.js'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/src/app.js',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@middlewares$': '<rootDir>/src/middlewares/index.js',
    '^@middlewares/(.*)$': '<rootDir>/src/middlewares/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@shared/(.*)$': '<rootDir>/../../shared/$1',
    // marked 是 ESM, jest 默认不 transform node_modules — 用轻量 stub 替代
    '^marked$': '<rootDir>/tests/helpers/esm-mock.js'
  }
}