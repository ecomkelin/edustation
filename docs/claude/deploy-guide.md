# 部署指南 — EduStation

> **何时读这个文件**：准备上云、初始化新服务器、做生产环境部署、扩容、迁移时读。
> **一行摘要**：从单机起步到分布式扩容的完整路径 + 三家云厂选型 + 配套脚本（PM2 / 备份 / CI/CD）。

---

## 0. 三家云厂选型

| 维度 | 阿里云 | 腾讯云 | 华为云 |
|---|---|---|---|
| 入门难度 | ⭐⭐⭐ | ⭐⭐（对新手最友好） | ⭐⭐⭐ |
| 学生/新人优惠 | 高校计划 9.9/月 | 校园云 10/月 | 一般 |
| 生态完整性 | ⭐⭐⭐⭐⭐（OSS/RDS/SLB 全套） | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 备案体验 | 流程顺 | 流程顺 | 稍慢 |
| 海外节点 | 香港/新加坡免备案 | 香港便宜 | 亚太 |

**EduStation 推荐**：

| 场景 | 首选 |
|---|---|
| 第一次部署 / 学生价 / 个人开发者 | **腾讯云**（轻量应用服务器上手最快） |
| 正式商用 / 多机构 SaaS / 后续对接 OSS 短信 | **阿里云**（生态最全） |
| 隐私/合规要求高 / 教育机构政府背景 | **华为云** |
| 海外家长 / 不备案 | **阿里云香港 / 腾讯云香港** |

---

## 1. 整体架构演进

### 阶段一：单机版（≤ 500 用户，0–6 个月）

**所有东西跑在 1 台 ECS 上**，前期最省。

```
┌────────────────────────────────────────┐
│   ECS 2核4G 40G SSD 5M带宽  ¥100/月     │
│                                        │
│   Nginx (443)                           │
│     ├─ api.yourdomain.com → Node.js:3000 │
│     ├─ admin.yourdomain.com → dist/    │
│     └─ h5.yourdomain.com → dist/build/h5│
│                                        │
│   MongoDB :27017 (127.0.0.1 only)      │
│   uploads/  本地盘                      │
└────────────────────────────────────────┘
```

### 阶段二：拆分（500–5000 用户，6–18 个月）

```
SLB → 2-4 台 API 节点
     → 阿里云 MongoDB 副本集（或自建主从）
     → Redis（会话/限流）
     → OSS + CDN（文件分发）
```

### 阶段三：K8s 集群（5000+ 用户，18 个月+）

```
CDN/WAF → SLB → K8s ACK (3+ 节点)
                   → MongoDB 副本集
                   → Redis 集群
                   → OSS + CDN
                   → SLS 日志 + ARMS 监控
```

**本指南覆盖阶段一**，阶段二/三 见 §10。

---

## 2. 服务器初始化（一次性）

### 2.1 购买清单（最小起步）

| 资源 | 推荐规格 | 阿里云选这个 | 月成本 |
|---|---|---|---|
| ECS | 2 核 4G / 40G SSD / 5M 带宽 / Ubuntu 22.04 | 突发性能 t6 | ¥100（学生 9.9） |
| 域名 | .com 或 .cn | — | ¥25-80/年 |
| SSL 证书 | Let's Encrypt（免费） | — | ¥0 |
| 备案服务号 | ECS 自带 | — | ¥0 |

### 2.2 系统初始化

```bash
# 1. SSH 登录（root）
ssh root@<your-server-ip>

# 2. 创建普通用户（不要长期用 root）
adduser deploy
usermod -aG sudo deploy

# 3. 配置 SSH 密钥登录（推荐）
# 本地执行：ssh-copy-id -i ~/.ssh/id_edustation.pub deploy@<ip>
# 服务器执行：
sudo nano /etc/ssh/sshd_config
#   PasswordAuthentication no
#   PermitRootLogin no
sudo systemctl restart sshd

# 4. 防火墙
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 5. 系统更新
sudo apt update && sudo apt upgrade -y

# 6. 基础工具
sudo apt install -y git curl wget vim htop unzip
```

### 2.3 安装运行时

```bash
# Node.js 20 LTS（项目 package.json 要求 >=18，20 更稳）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
sudo npm install -g pnpm

# MongoDB 7.0
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

# Nginx
sudo apt install -y nginx

# PM2（Node 进程守护）
sudo npm install -g pm2

# Certbot（SSL 免费证书）
sudo apt install -y certbot python3-certbot-nginx
```

---

## 3. MongoDB 配置

### 3.1 配置文件

```bash
sudo nano /etc/mongod.conf
```

```yaml
# 仅本地访问，不开放公网 27017
net:
  port: 27017
  bindIp: 127.0.0.1

# 开启认证
security:
  authorization: enabled

# 日志与数据目录（默认即可）
storage:
  dbPath: /var/lib/mongodb
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
```

### 3.2 启动 + 创建管理员

```bash
sudo systemctl enable mongod
sudo systemctl start mongod

# 临时关闭认证初始化管理员
sudo systemctl stop mongod
sudo nano /etc/mongod.conf  # 注释掉 security.authorization
sudo systemctl start mongod

mongosh
> use admin
> db.createUser({user: "admin", pwd: "<STRONG_PASSWORD>", roles: ["root"]})
> exit

# 恢复认证
sudo systemctl stop mongod
sudo nano /etc/mongod.conf  # 取消注释
sudo systemctl start mongod

# 测试登录
mongosh "mongodb://admin:<STRONG_PASSWORD>@127.0.0.1:27017/edustation?authSource=admin"
```

### 3.3 生产环境额外加固

```bash
# 1. 限制连接数（防内存爆掉）
# 在 /etc/mongod.conf 加：
#   setParameter:
#     maxIncomingConnections: 1000

# 2. 启用慢查询日志（排查性能）
#   operationProfiling:
#     mode: slowOp
#     slowOpThresholdMs: 100

# 3. 备份目录
sudo mkdir -p /backup/mongo
sudo chown -R mongodb:mongodb /backup/mongo
```

---

## 4. 代码部署

### 4.1 创建部署目录

```bash
sudo mkdir -p /home/deploy/edustation
sudo chown -R deploy:deploy /home/deploy
sudo -u deploy -H bash -lc 'cd ~ && git clone https://github.com/<your-org>/edustation.git'
```

### 4.2 写 server .env

```bash
sudo -u deploy -H bash -lc 'cp /home/deploy/edustation/packages/server/.env.example /home/deploy/edustation/packages/server/.env'
sudo -u deploy nano /home/deploy/edustation/packages/server/.env
```

**关键变量（生产必改）**：

```bash
NODE_ENV=production
PORT=3000

# MongoDB（用刚才创建的管理员账号）
MONGODB_URI=mongodb://admin:<STRONG_PASSWORD>@127.0.0.1:27017/edustation?authSource=admin

# JWT secret（生成：openssl rand -hex 32）
JWT_ACCESS_SECRET=<32+ 字符随机串>
JWT_REFRESH_SECRET=<另一个 32+ 字符随机串>
JWT_ACCESS_EXPIRES_IN=1200m
JWT_REFRESH_EXPIRES_IN=7d

# Refresh Cookie（同域反代可降到 lax；跨域必须 none + secure=true）
REFRESH_COOKIE_NAME=edustation_refresh_token
REFRESH_COOKIE_SAMESITE=lax  # 同域反代
# REFRESH_COOKIE_SAMESITE=none  # 前后端不同子域名
REFRESH_COOKIE_SECURE=true

# CORS 白名单（多个 origin 用逗号分隔）
CORS_ORIGINS=https://admin.yourdomain.com,https://h5.yourdomain.com

# 文件上传
UPLOAD_DIR=/home/deploy/edustation/uploads
UPLOAD_BASE_URL=/uploads

# AI（生产可关掉）
AI_ENABLED=false

# Seed（仅首次灌库时用，跑完 seeds 改回强密码或删除这行）
SEED_DEFAULT_PASSWORD=<STRONG_DEFAULT_PASSWORD>
```

> **生产同域反代**：admin 和 api 在同一台 ECS 上 + Nginx 反代 + 同一 .yourdomain.com 域 → `REFRESH_COOKIE_SAMESITE=lax`，刷新 cookie 不再依赖跨域 none。

### 4.3 写 admin .env.local

```bash
sudo -u deploy tee /home/deploy/edustation/packages/admin/.env.local > /dev/null <<'EOF'
VITE_API_BASE_URL=/api/v1
EOF
```

> Admin 用 Nginx 反代后 `/api/v1` 直接走同源，无需绝对路径。

### 4.4 写 client H5 配置

`packages/client/src/manifest.json` 的 `h5` 节点（如有需要）配置后端地址；默认相对路径即可，H5 通过 `h5.yourdomain.com/api/v1/...` 走 Nginx 反代。

### 4.5 安装依赖 + 构建

```bash
sudo -u deploy -H bash -lc '
cd /home/deploy/edustation
pnpm install --frozen-lockfile

# 构建后端（产出 packages/server/dist 实际上无构建，main.js 直接跑）
# Node.js 直接跑 src/main.js，不需要 tsc 构建步骤

# 构建 admin
pnpm --filter @edustation/admin build

# 构建 client H5（产出 packages/client/dist/build/h5）
pnpm --filter @edustation/client build:h5
'
```

### 4.6 创建上传目录

```bash
sudo -u deploy mkdir -p /home/deploy/edustation/uploads
sudo -u deploy mkdir -p /home/deploy/edustation/logs
```

---

## 5. PM2 进程守护

### 5.1 ecosystem.config.js

创建 `/home/deploy/edustation/ecosystem.config.js`：

```js
/**
 * PM2 进程配置 — 部署到服务器后用 pm2 start ecosystem.config.js 启动
 *
 * 文件名 / 路径说明：
 *   - 放在仓库根目录, 便于 `pm2 start / restart` 时直接定位
 *   - cwd 指 packages/server (因为我们用 node 直接跑 src/main.js)
 *   - script 用 node CLI 完整命令, 避免 pm2 试图 require .ts/.mjs 时报错
 */
module.exports = {
  apps: [
    {
      name: 'edustation-api',
      cwd: './packages/server',
      script: 'src/main.js',
      // node CLI 形式：pm2 直接 spawn 一个 node 子进程, 免去 require 解析
      // 这样 module-alias/register 在 main.js 顶部也能正常注册
      interpreter: 'node',
      interpreter_args: '--enable-source-maps',
      instances: 1, // 阶段一单机，1 实例；阶段二按 CPU 核数
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
      // 自动重启
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      // 优雅退出
      kill_timeout: 8000,
      listen_timeout: 10000
    }
  ]
}
```

### 5.2 启动

```bash
sudo -u deploy -H bash -lc '
cd /home/deploy/edustation
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd | tail -1 | sudo bash  # 生成开机自启
'

# 验证
pm2 status
pm2 logs edustation-api --lines 50
curl http://127.0.0.1:3000/api/v1/health  # 你项目里的健康检查端点
```

### 5.3 常用命令

```bash
pm2 status                 # 进程列表
pm2 logs edustation-api    # 实时日志
pm2 restart edustation-api # 重启
pm2 reload edustation-api  # 0 停机重载（仅 cluster 模式生效）
pm2 stop edustation-api    # 停止
pm2 delete edustation-api  # 删除
pm2 monit                  # 监控面板
```

---

## 6. Nginx 反向代理 + HTTPS

### 6.1 申请 SSL 证书

```bash
# 先把域名解析到 ECS 公网 IP（DNS A 记录），等 5 分钟
sudo certbot --nginx -d api.yourdomain.com -d admin.yourdomain.com -d h5.yourdomain.com --email you@example.com --agree-tos --no-eff-email
```

### 6.2 写 Nginx 配置

创建 `/etc/nginx/sites-available/edustation`：

```nginx
# ---------- API 后端 ----------
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # 上传文件大小（学生作品/图片可能较大）
    client_max_body_size 50M;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        # SSE/流式响应（AI 助手）需要关闭缓冲
        proxy_buffering off;
        proxy_cache off;
    }
}

# ---------- Admin 后台 ----------
server {
    listen 443 ssl http2;
    server_name admin.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/admin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.yourdomain.com/privkey.pem;

    root /home/deploy/edustation/packages/admin/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|webp|svg|woff2|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 反代后端 API（同源走 /api，前端 VITE_API_BASE_URL=/api/v1）
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }

    # 反代上传文件
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}

# ---------- Client H5（家长手机浏览器） ----------
server {
    listen 443 ssl http2;
    server_name h5.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/h5.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/h5.yourdomain.com/privkey.pem;

    root /home/deploy/edustation/packages/client/dist/build/h5;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|webp|svg|woff2|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}

# ---------- HTTP → HTTPS ----------
server {
    listen 80;
    server_name api.yourdomain.com admin.yourdomain.com h5.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/edustation /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # 删默认站点
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. 首次灌库

```bash
sudo -u deploy -H bash -lc '
cd /home/deploy/edustation/packages/server
pnpm db:seeds
'

# 完成后立刻改 SEED_DEFAULT_PASSWORD 并清掉所有默认账号 / 改密码
```

> **⚠️ 开发期（CLAUDE.md §0）**：可以直接 `db.collection.drop()` 重灌，不需要迁移脚本。

---

## 8. 备份策略

### 8.1 backup.sh

创建 `/home/deploy/scripts/backup.sh`：

```bash
#!/usr/bin/env bash
# EduStation 备份脚本 — MongoDB + uploads
# 用法：./backup.sh [keep_days=7]
# 加入 crontab: 0 3 * * * /home/deploy/scripts/backup.sh

set -euo pipefail

KEEP_DAYS="${1:-7}"
DATE="$(date +%F_%H%M)"
BACKUP_ROOT="/backup"
MONGO_DIR="${BACKUP_ROOT}/mongo/${DATE}"
UPLOAD_BACKUP_DIR="${BACKUP_ROOT}/uploads/${DATE}"

# ---------- 配置 ----------
MONGODB_URI="${MONGODB_URI:-mongodb://admin:CHANGE_ME@127.0.0.1:27017/edustation?authSource=admin}"
UPLOAD_SRC="/home/deploy/edustation/uploads"

mkdir -p "${MONGO_DIR}" "${UPLOAD_BACKUP_DIR}"

echo "[$(date +%T)] backup start → ${DATE}"

# 1. MongoDB 全量 dump
mongodump --uri="${MONGODB_URI}" --out="${MONGO_DIR}" --gzip
echo "[$(date +%T)] mongo dump done: $(du -sh ${MONGO_DIR} | awk '{print $1}')"

# 2. uploads 增量 rsync
rsync -a --delete "${UPLOAD_SRC}/" "${UPLOAD_BACKUP_DIR}/"
echo "[$(date +%T)] uploads synced: $(du -sh ${UPLOAD_BACKUP_DIR} | awk '{print $1}')"

# 3. 打包当日
TARBALL="${BACKUP_ROOT}/edustation_${DATE}.tar.gz"
tar -czf "${TARBALL}" -C "${BACKUP_ROOT}" "mongo/${DATE}" "uploads/${DATE}"
echo "[$(date +%T)] tarball: ${TARBALL} ($(du -sh ${TARBALL} | awk '{print $1}'))"

# 4. 清理过期
find "${BACKUP_ROOT}/mongo" -maxdepth 1 -type d -mtime +${KEEP_DAYS} -exec rm -rf {} \;
find "${BACKUP_ROOT}/uploads" -maxdepth 1 -type d -mtime +${KEEP_DAYS} -exec rm -rf {} \;
find "${BACKUP_ROOT}" -maxdepth 1 -name "edustation_*.tar.gz" -mtime +${KEEP_DAYS} -delete

echo "[$(date +%T)] cleanup done (keep ${KEEP_DAYS}d). backup finished."

# ---------- 可选：上传到 OSS ----------
# 把 tarball 同步到阿里云 OSS（需要先装 ossutil 并配置）
# ossutil cp "${TARBALL}" oss://your-backup-bucket/edustation/${DATE}.tar.gz
```

```bash
chmod +x /home/deploy/scripts/backup.sh
sudo -u deploy crontab -e
# 加一行：
# 0 3 * * * /home/deploy/scripts/backup.sh 14 >> /home/deploy/logs/backup.log 2>&1
```

### 8.2 恢复演练（每月一次）

```bash
# 1. 拉一份新 ECS（不要在生产上操作）
# 2. 把 tarball 拉到新机
scp /backup/edustation_2026-07-11_0300.tar.gz deploy@<new-server>:/tmp/

# 3. 解压 + 还原
ssh deploy@<new-server>
cd /backup
tar -xzf /tmp/edustation_2026-07-11_0300.tar.gz
mongorestore --uri="mongodb://admin:PWD@127.0.0.1:27017" /backup/mongo/2026-07-11_0300/edustation --gzip --drop
rsync -a /backup/uploads/2026-07-11_0300/ /home/deploy/edustation/uploads/

# 4. 启动验证
pm2 restart edustation-api
curl https://api.yourdomain.com/api/v1/health
```

---

## 9. CI/CD（GitHub Actions）

### 9.1 创建 deploy.yml

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:  # 允许手动触发

jobs:
  # ---------- 前端构建（产物作为 artifact，供后续 job 部署） ----------
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Lint (可选)
        run: pnpm -r run lint || true

      - name: Build admin
        run: pnpm --filter @edustation/admin build

      - name: Build client H5
        run: pnpm --filter @edustation/client build:h5

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: |
            packages/admin/dist
            packages/client/dist/build/h5
            packages/server/src
            packages/server/package.json
            ecosystem.config.js

  # ---------- 部署到生产 ----------
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production  # GitHub 会要求手动确认
    steps:
      - uses: actions/checkout@v4

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: dist

      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          command_timeout: 10m
          script: |
            set -e
            cd /home/deploy/edustation

            # 拉最新代码
            git pull origin main

            # 同步上传的构建产物
            rsync -a --delete $HOME/edustation-artifacts/packages/admin/dist/ packages/admin/dist/ || true
            rsync -a --delete $HOME/edustation-artifacts/packages/client/dist/ packages/client/dist/ || true

            # 更新依赖（package.json 有变更时）
            pnpm install --frozen-lockfile

            # 重启后端
            pm2 restart edustation-api
            pm2 save

            # 重载 Nginx（静态资源有变化）
            sudo systemctl reload nginx

            echo "[deploy] done at $(date)"

      - name: Smoke test
        run: |
          sleep 5
          curl -fsS https://api.yourdomain.com/api/v1/health || exit 1
```

### 9.2 GitHub Secrets 配置

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 值 |
|---|---|
| `SERVER_HOST` | ECS 公网 IP（如 `47.96.123.45`） |
| `SERVER_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | `cat ~/.ssh/id_edustation \| base64 -w 0`（部署专用密钥的私钥） |

---

## 10. 扩容路线

### 10.1 触发条件

| 症状 | 阈值 | 动作 |
|---|---|---|
| API 响应慢 | P95 > 1s | 加 API 节点 + SLB |
| MongoDB 慢 | CPU > 70% 持续 | 升级 ECS 或迁云 MongoDB |
| uploads 磁盘满 | > 70% | 迁 OSS + CDN |
| 限流失效（多 API 实例） | 登录防刷/限流异常 | 引入 Redis 共享 session/计数 |
| 文件丢失风险 | 单点本地盘 | 切 S3 / OSS 驱动 |

### 10.2 拆 MongoDB

```bash
# 选项 A：自建主从
# 在另一台 ECS 装 mongod，replication.enable + rs.initiate()

# 选项 B：阿里云 MongoDB（推荐，省运维）
# 控制台 → 云数据库 MongoDB → 副本集 → 选 2 核 4G 起步 → 拿到连接串
# 改 .env 的 MONGODB_URI 为新连接串
# pm2 restart edustation-api
```

### 10.3 切文件存储到 OSS

`STORAGE_DRIVER=s3` + 配 [data-models-storage.md](data-models-storage.md) 里的 S3 配置项 + 阿里云 OSS 的 S3 兼容端点。

### 10.4 多 API 实例

1. 引入 Redis（替换 in-memory 限流 Map）
2. Nginx upstream → 多 ECS / K8s Pod
3. SLB / Nginx sticky session 或 JWT stateless

### 10.5 K8s 迁移

按需启动，建议等到 5K+ 用户、API 实例 ≥ 4 台再考虑。

---

## 11. 监控 & 告警（阶段二再做）

| 工具 | 用途 |
|---|---|
| PM2 Plus | 进程级监控（自带） |
| 阿里云云监控 | ECS / MongoDB / Redis 指标 |
| SLS 日志服务 | 集中日志（替代 tail pm2 logs） |
| ARMS | 应用性能监控（慢请求追踪） |
| UptimeRobot | API 健康检查（免费，5 分钟一次） |

临时方案：

```bash
# 简易健康检查 cron（服务器本地）
*/5 * * * * curl -fsS https://api.yourdomain.com/api/v1/health || (echo "API DOWN" | mail -s "edustation alert" you@example.com)
```

---

## 12. 常见问题

### 12.1 启动报错 `MONGODB_URI is not set`

`.env` 没读到。检查：
- `packages/server/.env` 是否存在
- `pm2 start` 时 cwd 是否是 `packages/server/`
- 直接 `node src/main.js` 验证能起来，再让 pm2 管

### 12.2 小程序提示"不在合法域名列表"

`mp.weixin.qq.com` 后台 → 开发 → 服务器域名 → 加 `https://api.yourdomain.com`、`https://h5.yourdomain.com`。

### 12.3 刷新 token 跨域丢失

前后端**同域反代**（admin 走 `admin.yourdomain.com` + Nginx 统一 `/api/`）→ 用 `REFRESH_COOKIE_SAMESITE=lax`。
前后端**不同子域名**（admin.yourdomain.com + api.yourdomain.com）→ 必须 `SAMESITE=none + SECURE=true + HTTPS`。

### 12.4 文件上传 413

Nginx `client_max_body_size` 调大 + 后端 `storage.maxFileSize` 调大（默认 20MB）。

### 12.5 MongoDB 连接被拒

检查 `mongod.conf` 的 `bindIp`（默认 127.0.0.1）+ 认证 + `.env` 的 `MONGODB_URI` 是否带 `authSource=admin`。

### 12.6 PM2 开机不自启

```bash
pm2 unstartup
pm2 startup systemd
pm2 save
# 把 pm2 startup 输出的最后一行（sudo env ...）手动执行一次
```

### 12.7 备案期间怎么开发？

- 备案期间用 **IP + 端口** 直接访问（http://<ip>:3000）
- 用 **frp / tailscale** 做内网穿透
- 微信小程序开发版 + "不校验合法域名" 也能跑（但生产一定要 https）

---

## 13. 上线 Checklist

- [ ] ECS 已装（Ubuntu 22.04 + Node 20 + MongoDB 7 + Nginx + PM2）
- [ ] 域名已买 + 已解析 + 已备案
- [ ] SSL 证书已申请（Let's Encrypt）
- [ ] MongoDB 已创建管理员 + 开启认证
- [ ] `.env` 已配（NODE_ENV=production + 强 secret + CORS 白名单 + HTTPS cookie）
- [ ] 代码已部署 + `pnpm install` + `pnpm build` 全部成功
- [ ] `pnpm db:seeds` 已灌种子数据
- [ ] `pm2 startup` 已配置 + `pm2 save`
- [ ] Nginx 配置已启用 + `nginx -t` 通过
- [ ] `/etc/nginx/sites-enabled/default` 已删
- [ ] ufw 防火墙只开 22/80/443
- [ ] SSH 已禁用密码登录
- [ ] backup.sh 已配置 crontab
- [ ] GitHub Actions secrets 已配 + 部署一次成功
- [ ] 微信小程序后台域名白名单已加
- [ ] curl `https://api.yourdomain.com/api/v1/health` 返回 200
- [ ] 浏览器访问 `https://admin.yourdomain.com` 能进后台
- [ ] （可选）UptimeRobot 监控已配置

---

## 14. 配套脚本一览

| 文件 | 用途 |
|---|---|
| `ecosystem.config.js`（仓库根） | PM2 进程配置 |
| `.github/workflows/deploy.yml` | GitHub Actions 自动部署 |
| `/home/deploy/scripts/backup.sh` | MongoDB + uploads 备份（crontab 调用） |
| `/home/deploy/scripts/restore.sh` | 恢复脚本（可按需从 backup.sh 改） |

---

## 相关文档

- [data-models-storage.md](data-models-storage.md) — 文件存储 driver 切换（local → OSS）
- [routes-server.md](routes-server.md) — 后端 API 路由索引
- [CLAUDE.md §0 开发阶段声明](../CLAUDE.md) — 开发期不需要迁移脚本，`db.collection.drop()` 可重灌