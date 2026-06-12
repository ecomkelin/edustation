# EduStation 客户端 (uni-app)

> 阶段 2 实现的家长端。支持 **微信小程序 / H5 / iOS App / Android App**。
> 一套 Vue 3 业务代码，4 端运行。

## 技术栈

| 层       | 技术                                  |
| -------- | ------------------------------------- |
| 框架     | uni-app (Vue 3) + Vite                |
| 状态     | Pinia                                 |
| 推送     | UniPush (DCloud) — App 端原生推送     |
| 样式     | SCSS                                  |
| HTTP     | uni.request + 自研 refresh-token 封装 |
| 后端     | `@edustation/server` (Express)        |

## 目录结构

```
packages/client/
├── package.json
├── vite.config.js
├── index.html                  # H5 入口
└── src/
    ├── manifest.json           # 应用清单（推送、App 权限、微信 appid…）
    ├── pages.json              # 路由与 tabBar
    ├── main.js
    ├── App.vue
    ├── api/                    # 业务接口封装
    │   ├── auth.js
    │   ├── student.js
    │   ├── lessonSchedule.js
    │   ├── studentWork.js
    │   ├── order.js
    │   ├── studentProduct.js
    │   ├── courseProduct.js
    │   ├── courseInstance.js
    │   ├── courseEnrollment.js
    │   ├── pet.js
    │   └── points.js
    ├── stores/                 # Pinia 状态
    │   ├── auth.js
    │   ├── student.js
    │   ├── points.js
    │   └── pet.js
    ├── utils/
    │   ├── request.js          # 请求封装（含 401 自动 refresh）
    │   ├── push.js             # UniPush 初始化
    │   ├── share.js            # 分享工具
    │   ├── storage.js          # 跨端 storage
    │   ├── constants.js        # 共享枚举
    │   └── format.js           # 时间/金额格式化
    ├── components/
    │   └── active-student-header.vue
    ├── static/tabbar/          # tabBar 图标（务必先放图片）
    └── pages/
        ├── tabbar/             # 4 个 tab 页
        │   ├── home.vue        # 课表
        │   ├── pet.vue         # 宠物乐园
        │   ├── share.vue       # 分享得积分
        │   └── me.vue          # 我的
        ├── auth/login.vue
        ├── student/switch.vue
        ├── lessonSchedule/detail.vue
        ├── studentWork/{list,detail}.vue
        ├── order/{list,detail}.vue
        ├── studentProduct/list.vue
        ├── courseProduct/{list,detail}.vue
        ├── courseInstance/detail.vue
        ├── courseEnrollment/list.vue
        └── points/{transaction,exchange}.vue
```

## 关键设计

### 1. 鉴权与多端 Refresh

- 登录成功后从 `/api/v1/auth/login` 拿到 **accessToken**（短期），refreshToken 通过 **httpOnly Cookie** 下发。
- 客户端 `request.js` 在每次请求自动注入 `Authorization: Bearer <access>` 与 `x-org-id`、`x-active-student-id`。
- 收到 401 时：
  1. 用 `withCredentials: true` 让 cookie 透传，发 `POST /auth/refresh`；
  2. 成功：用新 access token 重放原请求；
  3. 失败：清空本地登录态，跳登录页。

### 2. 多孩子切换

- 顶部"当前孩子：xx"在所有 4 个 tab 页都通过 `<active-student-header>` 渲染。
- 单/多孩子时都**保留切换入口**（CLAUDE.md §6）：单孩子时进入选择页会显示"请选择"，多孩子时点击切换。
- 切换会写入 `storage` 并在所有请求中通过 `x-active-student-id` 通知后端。

### 3. UniPush 推送（必须）

⚠️ **审核要求**：`manifest.json -> app-plus.modules.Push.provider` 必须设为 `"unipush"`，否则 iOS/Android 上架可能被拒。

- **HBuilderX 打开本项目** → `manifest.json` → "App 推送" 勾选 UniPush 即可同步模块。
- 在 [DCloud 开发者中心](https://dev.dcloud.net.cn) 开通 UniPush 后把 `appid / appkey / appsecret` 填到 `manifest.json -> app-plus.distribute.sdkConfigs.push.unipush.*`。
- 客户端 `utils/push.js` 在 `App.vue#onLaunch` 登录成功后自动调用 `initPush()`，把 clientId 存到本地；后端在登录接口的扩展字段接收并按家长推送。
- 小程序端没有 UniPush，**改用微信订阅消息**：`me.vue` 里的"推送通知"开关会调用 `requestSubscribe(tmplIds)` 申请一次性订阅。

## 开发与调试

### 前置条件

- Node.js >= 18
- pnpm
- HBuilderX（开发 App 必须，便于真机/模拟器调试；纯 H5 / 微信小程序可只用 CLI）
- 微信开发者工具（小程序）
- Android Studio / Xcode（App 调试）

### 启动

```bash
# 在仓库根目录
pnpm install

# 进入本包
cd packages/client
pnpm install

# 启动 H5
pnpm dev:h5
# 启动 微信小程序
pnpm dev:mp-weixin
# 启动 App（需要 HBuilderX 打开本目录，再点"运行"）
pnpm dev:app
```

> H5 默认 `http://localhost:5174`，后端默认 `http://localhost:3000`，跨域需后端 `cors` 允许。
> 小程序需要在小程序开发者工具的"详情-本地设置"勾选"不校验合法域名"以访问本地后端。

### 后端联调地址

`src/utils/request.js` 顶部 `BASE_URL` 控制：

```js
// H5
const BASE_URL = '/api/v1'   // 通过 vite proxy 转发
// 小程序 / App
const BASE_URL = 'http://localhost:3000/api/v1'
```

线上：

```js
const BASE_URL = 'https://api.your-domain.com/api/v1'
```

## 打包发布

### 1. 微信小程序

1. `manifest.json -> mp-weixin.appid` 填入真实 AppID（测试号也行）。
2. 运行 `pnpm build:mp-weixin`，产物在 `dist/build/mp-weixin/`。
3. 用**微信开发者工具**打开该目录。
4. 上传 → 填写版本号与备注 → 提交审核。
5. 隐私协议：`manifest.json` 已开启 `__usePrivacyCheck__`，在 mp 后台填写《用户隐私保护指引》。

> ⚠️ 小程序登录态与本仓库**不一致**——uni-app 编译到小程序时，refresh token 走 `withCredentials` 仍依赖后端允许跨域（小程序没有真 cookie 域，统一由后端 Set-Cookie 后，本地存储一个未签名 cookie 副本，再在下次请求带上）。本仓库的 server 已配 `SameSite=None; Secure` 允许跨域。

### 2. iOS App

1. 用 HBuilderX 打开 `packages/client` 目录。
2. 菜单 **发行 → 原生 App-云打包**。
3. 选 iOS，配置：
   - Bundle ID（AppID）
   - 证书（p12 文件 + 描述文件 .mobileprovision）
   - 推送：勾选 **UniPush**（自动从 manifest 读取）
4. 点"打包" → 等待云端完成 → 下载 `ipa`。
5. 用 **Transporter** 上传至 App Store Connect，提交审核。

> ⚠️ iOS 推送需要：
> - 苹果开发者账号已开通 **APNs**；
> - 在 DCloud 后台 → UniPush → iOS 推送证书 上传 APNs 证书（p12）；
> - `manifest.json` 已写入 `NSCameraUsageDescription / NSPhotoLibraryUsageDescription` 等隐私文案。

### 3. Android App

#### 方式 A：HBuilderX 云打包（推荐，省本地环境）

1. HBuilderX 打开本目录。
2. **发行 → 原生 App-云打包**。
3. 选 Android，配置：
   - 包名
   - 证书（Android 签名）：可一键生成
   - 推送：勾选 **UniPush**（自动从 manifest 读取）
4. 点"打包" → 下载 `apk` 或 `aab`。
5. `aab` 上传 **Google Play**；`apk` 可分发给国内安卓市场或自建分发。

#### 方式 B：离线打包

1. 准备 Android Studio 工程（[uni-app 离线打包工程](https://nativesupport.dcloud.net.cn/AppDocs/README)）。
2. 把 `packages/client` 编译后的 `dist/build/app-plus` 资源拷入。
3. 在原生工程 `AndroidManifest.xml` 中检查：
   - `INTERNET` 权限
   - `VIBRATE` / `WAKE_LOCK`（UniPush 推送接收需要）
   - `com.google.android.c2dm.permission.RECEIVE`（FCM）
4. 配置包名、应用签名后，build APK / AAB。

> ⚠️ 国内安卓厂商（华为/小米/OPPO/vivo）需要单独在 UniPush 后台配置各厂商通道，否则在杀进程后收不到推送。

### 4. H5 站点

```bash
pnpm build:h5
# 产物在 dist/build/h5/，可部署到任意静态站点
```

- 部署到 `https://h5.your-domain.com/`
- 在 `manifest.json -> h5.router.base` 设置站点根（默认 `/`）
- nginx 需配置 `try_files $uri $uri/ /index.html;` 处理 history/路由

## 自检 Checklist（上线前）

- [ ] `manifest.json` 的 `Push` 模块已开启，appid/key 已填
- [ ] 4 端图标（tabbar）已就位
- [ ] 后端 CORS 允许小程序 / H5 域名
- [ ] 启动隐私协议在小程序后台 / App Store 后台填写
- [ ] 真机测试登录 → 课表加载 → 报名 → 购课 → 退课 → 推送全链路
- [ ] `x-active-student-id` 在切换后立即生效（首页数据已刷新）
- [ ] 401 自动 refresh 在 4 端都验证过

## 已知 TODO（阶段 3+）

- 海报生成（canvas 绘图）
- 推送消息点击跳详情（依赖后端 push payload 协议）
- 实名认证 / 微信支付 / 银联支付集成
- 国际化（vue-i18n）
- 性能监控（uni.stat / Sentry）
