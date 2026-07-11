/**
 * PM2 进程配置 — 生产环境部署
 *
 * 用法（在仓库根目录执行）：
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup systemd   # 开机自启（输出的 sudo 命令手动执行一次）
 *
 * 设计：
 *   - 单 app（edustation-api）跑后端 Node 进程
 *   - 阶段一单机 → 1 实例；阶段二多机可改为 instances: 'max' + exec_mode: 'cluster'
 *   - cwd 指 packages/server（让 .env / 模块别名都能解析）
 *   - 用 interpreter: 'node' + 直接跑 src/main.js, 避免 pm2 把 main.js 当编译产物处理
 *   - 日志输出到 packages/server/../logs/，轮转由 pm2 自带
 *
 * 注意：
 *   - 不要提交生产密码 / 密钥（机密放 .env 或 Secrets）
 *   - 修改此文件后 pm2 reload edustation-api 即可生效
 */
module.exports = {
  apps: [
    {
      name: 'edustation-api',
      cwd: './packages/server',
      script: 'src/main.js',
      interpreter: 'node',
      interpreter_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production'
      },
      // 日志
      out_file: '../logs/api-out.log',
      error_file: '../logs/api-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // 自动重启策略
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      // 优雅退出（给 SIGTERM 留 8s 处理 in-flight request）
      kill_timeout: 8000,
      listen_timeout: 10000
    }
  ]
}