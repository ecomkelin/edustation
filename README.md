# EduStation 校外培训机构管理系统

> 多租户 SaaS 系统，涵盖学生管理、课包购买、排课消课、考勤作品、积分宠物。
> 项目总规范见 [CLAUDE.md](./CLAUDE.md)。

## 仓库结构

```
edustation/
├── packages/
│   ├── server/    # Node.js + Express + Mongoose 后端
│   ├── admin/     # Vue3 + Vite + Element Plus 管理后台
│   └── client/    # uni-app 客户端 (阶段 2)
├── shared/        # 前后端共享 (权限码、枚举)
├── pnpm-workspace.yaml
└── package.json
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js (>=18) + Express 4 + Mongoose 8 |
| 数据库 | MongoDB 6+ |
| 管理后台 | Vue 3 + Vite 5 + Element Plus 2 + Pinia 2 + Vue Router 4 |
| 包管理 | pnpm 9 (monorepo workspace) |
| 规范 | ESLint Standard + Prettier |

## 快速开始

### 0. 前置条件

- Node.js >= 18
- pnpm >= 9 (`npm i -g pnpm`)
- 本地 MongoDB 6+ 已启动

### 1. 安装依赖

```bash
cd edustation
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example packages/server/.env
# 编辑 packages/server/.env 至少确认 MONGODB_URI
```

### 3. 初始化种子数据

```bash
pnpm db:seeds
```

将创建 1 个示范机构、9 个用户（含 1 个平台超管）、5 个职位、6 个学生、20 个排课、5 个订单等（详见 [docs/claude/](docs/claude/) 数据模型索引）。

### 4. 启动开发服务

```bash
pnpm dev:server      # 后端 http://localhost:8000
pnpm dev:admin       # 管理后台 http://localhost:5173
```

### 5. 登录

打开 http://localhost:5173，使用以下任一账号登录（密码统一 `Admin@123`）：

| 角色 | 手机号 |
| --- | --- |
| 平台超管 | 13800000000 |
| 机构管理员 | 13800000001 |
| 教务 | 13800000002 |
| 老师 | 13800000003~05 |
| 家长 | 13900000001~04 |

## 主要脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev:server` | 启动后端 (nodemon 热更) |
| `pnpm dev:admin` | 启动管理后台 (vite dev) |
| `pnpm build:admin` | 构建管理后台生产包 |
| `pnpm db:seeds` | 跑种子脚本（清空后重建） |
| `pnpm lint` | ESLint 检查 |
| `pnpm lint:fix` | ESLint 自动修复 |
| `pnpm format` | Prettier 格式化 |
| `pnpm start:server` | 启动后端生产模式 |

## 目录约定

### 后端 (`packages/server/src/`)

```
main.js          # 入口
app.js           # Express 工厂
config/          # env、db、cors、permissions
middlewares/     # authenticate / requireOrg / requirePermission / activeStudent / errorHandler ...
models/          # Mongoose schemas (单数 PascalCase + .model.js)
modules/         # 业务模块 (每个含 controller/service/validator/routes)
routers/         # 显式挂载所有模块到 /api/v1
utils/           # ApiResponse / ApiError / JwtUtil / password / ...
```

### 管理后台 (`packages/admin/src/`)

```
main.js          # 入口
api/             # axios 封装 + 业务 API
stores/          # Pinia
router/          # Vue Router
layouts/         # DefaultLayout
components/      # 公共组件
views/           # 页面
```

## API 规范

- 基础路径：`/api/v1`
- 鉴权：`Authorization: Bearer <accessToken>`
- 多租户：`x-org-id: <orgId>` (平台超管可省略)
- 家长-学生：`x-active-student-id: <studentId>`
- 响应：`{ success, data, message, code }`
- 错误：`{ success: false, code, message }`

完整接口清单见各模块的 `api.desc.md`。

## 部署

阶段 3 才补 Dockerfile / PM2 ecosystem。当前用：

```bash
pnpm install --prod
NODE_ENV=production node packages/server/src/main.js
```

## 许可

私有项目，未开源。
