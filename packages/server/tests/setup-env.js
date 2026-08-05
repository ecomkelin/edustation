'use strict'

/**
 * Jest setupFiles: 在 require 业务代码之前注入环境变量.
 * 不连 MongoDB (留给各 test 文件的 beforeAll 启 mongodb-memory-server).
 *
 * 注意: setup-env 在 jest setupFiles 阶段最早跑, 此时还没启动 mongodb-memory-server.
 *   但 helpers/auth.js → JwtUtil → config/index → envValidator 同步 require 时已校验 MONGODB_URI.
 *   所以这里设一个 placeholder URI 让 envValidator 校验通过, 真正的 URI 在
 *   tests/setup.js beforeAll 里覆盖. config/db.js 在 require 时不会真连库
 *   (它只是 export module.exports), 只有 connect() 才连.
 */

process.env.NODE_ENV = 'test'
process.env.JWT_ACCESS_SECRET = 'a'.repeat(48)
process.env.JWT_REFRESH_SECRET = 'b'.repeat(48)
process.env.REFRESH_COOKIE_SAMESITE = 'lax'
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://placeholder:27017/test'