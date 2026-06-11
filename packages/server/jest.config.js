'use strict'

// 阶段 2 启用，MVP 阶段先 --passWithNoTests
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/tests/**/*.test.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@middlewares/(.*)$': '<rootDir>/src/middlewares/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@shared/(.*)$': '<rootDir>/../../shared/$1'
  }
}
