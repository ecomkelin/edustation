# Client 调试指南 — HBuilderX / 微信小程序 / 真机 App

> **何时读这个文件**：第一次跑通 client 项目、用 HBuilderX 开发、用微信开发者工具看效果、申请小程序 AppID、真机调试时读。
> **一行摘要**：uni-app 项目在 H5 / 微信小程序 / iOS / 安卓 四端的本地调试全流程。

---

## 0. 三种开发模式对比

| 模式 | 工具 | 速度 | 适合 |
|---|---|---|---|
| **CLI 模式（pnpm）** | 终端 + Vite | ⭐⭐⭐⭐⭐ 最快 | 改完代码浏览器秒刷 |
| **HBuilderX 模式** | DCloud 官方 IDE | ⭐⭐⭐ | 跑小程序/App、看 manifest 提示 |
| **混合模式** | 终端跑 + HBuilderX 看 | ⭐⭐⭐⭐⭐ | 推荐：CLI 改代码、HBuilderX 预览小程序 |

**强烈推荐混合模式**：日常开发用 `pnpm dev:h5`（最快），要看小程序效果再用 HBuilderX 打开同一个目录。

---

## 1. 项目前置准备

### 1.1 确认后端在跑

client 调试**强依赖后端 server + MongoDB**。先确保：

```bash
# 终端 1：启 server（cd 到 server 目录）
cd packages/server
pnpm dev    # 默认监听 3000 + localhost mongodb

# 验证
curl http://localhost:3000/api/v1/health    # 看你项目里有没有这端点
# 或任意 API 看 200/401 都算 server 在跑
```

### 1.2 client 的 dev proxy 配置

[packages/client/.env.development](packages/client/.env.development) 已经在 [vite.config.js:9](packages/client/vite.config.js#L9) 默认指向 `http://localhost:3000`：

```bash
# packages/client/.env.development
VITE_PROXY_TARGET=http://localhost:3000
```

**改值的情况**：
- 后端跑在别的端口 → `VITE_PROXY_TARGET=http://localhost:4000`
- 后端跑在局域网另一台机器（手机访问 client H5 时） → `VITE_PROXY_TARGET=http://192.168.1.100:3000`

---

## 2. 模式 A：CLI 跑 H5（最快上手）

### 2.1 启 dev server

```bash
cd packages/client
pnpm dev:h5
```

输出类似：

```
  VITE v5.x.x  ready in 1xxx ms

  ➜  Local:   http://localhost:9000/
  ➜  Network: http://192.168.x.x:9000/    ← 关键，手机可访问
```

> [vite.config.js:31](packages/client/vite.config.js#L31) 已配 `host: '0.0.0.0'`，手机扫码就能访问，**不会出现"局域网访问不到"的玄学问题**。

### 2.2 真机扫码看效果

1. 电脑和手机连**同一个 Wi-Fi**
2. 手机扫码 → 在浏览器打开 `http://192.168.x.x:9000/`
3. ⚠️ **别用微信扫**（微信会拦截外部 IP），用手机自带浏览器或 Safari
4. 改代码 → 浏览器自动 hot reload（手机要手动下拉刷新）

### 2.3 测试登录跑通

1. 浏览器开 `http://localhost:9000/`
2. 应该是登录页（`pages/auth/login`）
3. 用后端 seed 的家长账号登录（看你 [packages/server/scripts/db](packages/server/scripts/db) 里 seed 出来的手机号）
4. 登录后跳首页 → 走通就 OK

---

## 3. 模式 B：HBuilderX 调试（看 manifest 提示 + App 端）

### 3.1 安装 HBuilderX

1. 下载 [HBuilderX](https://www.dcloud.io/hbuilderx.html)（选 **App 开发版**，不是标准版）
2. 安装 → 打开 → 第一次会让你登录（**注册个 DCloud 账号**，免费的）
3. 工作区 → 打开目录 → 选 `packages/client` 整个目录

### 3.2 信任项目（重要）

HBuilderX 第一次打开会弹：

```
该项目不是用 HBuilderX 创建的，是否信任？
```

→ 点 **信任**（不信任会让它胡乱"修复"你的代码）。

### 3.3 跑 H5 / 小程序 / App

顶栏菜单：

| 目标 | 操作 |
|---|---|
| **H5** | 运行 → 运行到浏览器 → Chrome |
| **微信小程序** | 运行 → 运行到小程序模拟器 → 微信开发者工具（首次会让你配小程序工具路径） |
| **App 真机** | 运行 → 运行到手机或模拟器 → 标准基座 / 自定义基座 |
| **iOS 模拟器**（仅 Mac） | 运行 → 运行到模拟器 |

### 3.4 配置 manifest.json（关键）

[packages/client/src/manifest.json](packages/client/src/manifest.json) 现在 `mp-weixin.appid` 是空，跑前必须改：

```json
{
  "mp-weixin": {
    "appid": "wx1234567890abcdef",   // ← 填你自己的 AppID
    "setting": {
      "urlCheck": false,             // dev 阶段关闭域名校验
      "es6": true,
      "minified": true
    },
    "usingComponents": true,
    "permission": {
      "scope.userLocation": { "desc": "用于显示附近的课程" }
    },
    "requiredPrivateInfos": ["getLocation"]  // 如有定位需求
  },
  "app-plus": {
    "usingComponents": true,
    "distribute": {
      "android": {
        "permissions": [
          "<uses-permission android:name=\"android.permission.INTERNET\"/>",
          "<uses-permission android:name=\"android.permission.CAMERA\"/>",
          "<uses-permission android:name=\"android.permission.READ_EXTERNAL_STORAGE\"/>",
          "<uses-permission android:name=\"android.permission.WRITE_EXTERNAL_STORAGE\"/>",
          "<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\"/>",
          "<uses-permission android:name=\"android.permission.ACCESS_NETWORK_STATE\"/>"
        ]
      },
      "ios": {},
      "sdkConfigs": {
        "push": { "uniPush": { "iOS": { "systemToken": false } } }
      }
    }
  }
}
```

> **permission 加什么看你业务**：学生头像（不需要）、家长拍照作业（需要 CAMERA）、GPS 找教室（LOCATION）、地图选点等。

---

## 4. 微信小程序调试（重点）

### 4.1 注册小程序 AppID

1. 打开 https://mp.weixin.qq.com → 点"立即注册"
2. 选 **小程序** 账号类型
3. 填邮箱、密码、邮箱激活
4. 主体信息：
   - **个人主体**：身份证 + 微信扫码，**功能受限**（不能用支付/部分类目）
   - **企业主体**：营业执照 + 对公账户验证（个人 ¥30 / 企业 ¥300 认证费）
5. 拿到 AppID → 填到 `manifest.json` 的 `mp-weixin.appid`

**没有 AppID 也能跑**（选"测试号"），但部分功能受限，够本地调试。

### 4.2 安装微信开发者工具

下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)：

- 稳定版 Stable Build（推荐）
- 安装 → 扫码登录（用你注册小程序的那个微信）

### 4.3 HBuilderX 跑小程序

1. HBuilderX → 运行 → 运行到小程序模拟器 → 微信开发者工具
2. **第一次会让你配工具路径**（macOS: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`，Windows: `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`）
3. HBuilderX 自动调用微信工具打开 `unpackage/dist/dev/mp-weixin/`
4. 微信工具里扫码 → 出现小程序预览

**或者手动流程**：

```bash
# 1. CLI 构建出小程序产物
cd packages/client
pnpm dev:mp-weixin

# 2. 产物在 dist/dev/mp-weixin/，用微信开发者工具手动导入
```

### 4.4 微信开发者工具配置

首次打开 → 项目设置：

| 设置 | 值 | 说明 |
|---|---|---|
| AppID | 填你的 | 必须和 manifest 一致 |
| 项目名称 | EduStation | 随便 |
| 开发目录 | `dist/dev/mp-weixin` 或 HBuilderX 自动开的目录 | |
| 后端服务 | 不勾 | 我们用代理 |

**关键开关**（调试时必开）：

- 详情 → 本地设置 → ☑️ **不校验合法域名**（dev 必开，否则本地 IP 访问被拦）
- 详情 → 本地设置 → ☑️ **不校验 TLS 版本**
- 详情 → 本地设置 → ☑️ **启用多核心编译**

### 4.5 真机预览 / 体验版

微信开发者工具：

| 按钮 | 用途 |
|---|---|
| **预览** | 30 分钟有效，扫码在手机上临时体验 |
| **真机调试** | 出 vConsole，可在手机上看到 console.log |
| **上传** | 上传为体验版，需要在小程序后台 → 成员管理 → 加体验者 |
| **提交审核** | 上传后 → 选为审核版 → 提交 |

### 4.6 常见问题（小程序特有）

#### 4.6.1 `url not in domain list`

**症状**：真机预览所有 API 请求失败，提示"不在以下 request 合法域名列表中"。
**解决**：
- dev 阶段：微信开发者工具勾"不校验合法域名"（仅本地生效）
- 生产阶段：到 mp.weixin.qq.com 后台 → 开发管理 → 服务器域名 → 加 `https://api.yourdomain.com`

#### 4.6.2 后端 cookie 跨域丢失

参考 [deploy-guide.md §12.3](deploy-guide.md)：同域反代 `sameSite=lax`，跨子域 `sameSite=none + secure=true`。

#### 4.6.3 预览二维码 30 分钟过期

体验版机制：上传代码 → 在小程序后台设置体验者 → 用体验者微信扫码永久有效。

#### 4.6.4 `appid` 不匹配

报错 `appid wxcxxxxxxxxxxxxx 不匹配` → 检查微信开发者工具里填的 AppID 是否 = manifest.json 里填的。

---

## 5. App 真机调试（iOS / Android）

### 5.1 安装"标准基座"

uni-app 的 App 端运行需要"基座"（带 uni-app runtime 的壳子）：

1. HBuilderX → 菜单 → 帮助 → 下载 uni-app 调试基座 → 标准基座
2. 或直接：**运行 → 运行到手机或模拟器 → 标准基座**

### 5.2 Android 真机

**前置**：
1. 手机开 **USB 调试**（设置 → 开发者选项 → USB 调试；找不到开发者选项就"关于手机"连点 7 次版本号）
2. 数据线连电脑
3. 电脑装手机厂商的 USB 驱动（小米/华为/OPPO 各家官网有）

**步骤**：
1. HBuilderX → 运行 → 运行到手机或模拟器 → 运行到 Android App 基座
2. 第一次会让你装 "HBuilder 真机运行" App 到手机（手机扫码装）
3. 装完 → 选你的设备 → HBuilderX 把你的代码推到手机运行
4. 手机上能改 `console.log` / `vConsole` 看到

### 5.3 iOS 真机（仅 Mac + Apple 开发者账号）

**前置**（强烈建议新手跳过 iOS 真机，先跑 Android 或 H5）：

1. Apple 开发者账号（$99/年）
2. 苹果签名证书 + Provisioning Profile（Xcode → Preferences → Accounts → 加 Apple ID 自动生成）
3. iTunes 装好
4. iPhone 连数据线 → 信任此电脑

**步骤**：
1. HBuilderX → 菜单 → 工具 → 插件安装 → 安装"iOS 真机运行插件"
2. 运行 → 运行到手机或模拟器 → 运行到 iOS App 基座
3. 第一次要选证书 + Bundle ID
4. 等 Xcode 编译 → 自动装到 iPhone

### 5.4 vConsole（手机上调试）

```js
// App.vue 里加（仅 dev）
import VConsole from 'vconsole'
if (process.env.NODE_ENV === 'development') {
  new VConsole()
}
```

或 HBuilderX 直接编译带 vConsole 的版本（运行设置里勾）。

### 5.5 局域网 IP 配置

手机调试时 client 调后端的地址：

- **H5 在浏览器跑**：扫码访问 `http://192.168.x.x:9000` → vite proxy 转发 `/api` 到 `VITE_PROXY_TARGET`
- **小程序 / App**：需要在 manifest 里配请求域名，或直接用相对路径走 proxy
- **最简单**：手机和电脑同 Wi-Fi + 电脑防火墙关掉 + 后端监听 `0.0.0.0:3000`

```bash
# server 端确认监听全部网卡（你看 main.js:61 已写 0.0.0.0，OK）
# 但要先关掉本机防火墙对 3000 端口的限制
sudo ufw allow from 192.168.0.0/16 to any port 3000
```

---

## 6. 调试技巧汇总

### 6.1 抓包工具

| 工具 | 平台 | 用途 |
|---|---|---|
| Chrome DevTools | H5 | Network / Console / Sources |
| 微信开发者工具 Network 面板 | 小程序 | 看请求/响应 |
| Charles / Fiddler | 全平台 | 抓 HTTPS / 改请求 / 模拟弱网 |
| vConsole | App / H5 | 移动端 console.log |
| WeChat Devtools 真机调试 | 小程序 | 手机扫码 → 电脑抓包 |

### 6.2 移动端常见坑

| 问题 | 原因 | 解决 |
|---|---|---|
| 手机访问空白 | 防火墙拦了端口 | `sudo ufw allow 3000/tcp` |
| CSS 像素不对 | `transformPx` 默认关，但设计稿是 750rpx | manifest 配 `transformPx: true` 或代码改用 rpx |
| iOS 上传图片失败 | iOS 13+ 限制图片选择 API | 用 `uni.chooseImage` 而非 `<input type=file>` |
| App 启动白屏 | splash 配错 | manifest `app-plus.splashscreen.autoclose: true` |
| 真机调试看不到 console | 没装 vConsole | 加 vConsole 或用 HBuilderX 真机运行模式 |

### 6.3 加速开发循环

| 想要 | 做法 |
|---|---|
| H5 改一行代码秒刷 | `pnpm dev:h5`（Vite HMR） |
| 小程序改一行代码秒刷 | HBuilderX 运行到微信开发者工具（自动监听） |
| App 改一行代码秒刷 | 仅 HBuilderX 模式支持；CLI 模式要重新出包 |
| 看 API 请求细节 | Chrome DevTools / Charles / 后端 morgan 日志 |

---

## 7. 推荐工作流（团队）

### 日常开发

```bash
# 终端 1：后端
cd packages/server
pnpm dev    # http://localhost:3000

# 终端 2：client H5
cd packages/client
pnpm dev:h5 # http://localhost:9000

# 浏览器开发 → http://localhost:9000
# 手机看效果 → 扫 http://192.168.x.x:9000
```

### 需要看小程序效果时

```
HBuilderX 打开 packages/client/
→ 运行 → 运行到小程序模拟器 → 微信开发者工具
→ 改代码 → HBuilderX 自动热重载到微信工具
```

### 需要真机调试时

```
HBuilderX → 运行 → 运行到手机或模拟器 → Android/iOS App 基座
```

### 上线前

```
pnpm build:mp-weixin    # 出 dist/build/mp-weixin/
→ 微信开发者工具上传
→ 小程序后台提交审核
```

---

## 8. 调试 Checklist

- [ ] 后端 `pnpm dev` 在跑（端口 3000）
- [ ] `packages/client/.env.development` 配了正确的 `VITE_PROXY_TARGET`
- [ ] `pnpm dev:h5` 起来 → 浏览器能开 → 登录走通
- [ ] manifest.json `mp-weixin.appid` 填了（用真 AppID 或测试号）
- [ ] 微信开发者工具安装 + 登录 + AppID 一致
- [ ] 微信开发者工具勾"不校验合法域名"
- [ ] Android 手机 USB 调试 + HBuilder 真机运行 App
- [ ] iOS 真机调试（可选，仅 Mac + Apple 账号）
- [ ] vConsole 在 dev 环境可用
- [ ] 防火墙放行 3000/9000 端口

---

## 9. 常见报错速查

| 报错 | 原因 | 解决 |
|---|---|---|
| `Cannot find module '@shared/...'` | vite.config 没配 alias | 检查 [vite.config.js:17-18](packages/client/vite.config.js#L17-L18) |
| `module-alias` 找不到 | server 启动方式错 | 必须 `node src/main.js`，不能跑 dist（除非编译过） |
| `uni.XXX is not a function` | 用了非 uni-app API | 改用 `uni.*` 替代 `wx.*` / `my.*` |
| H5 跨域 404 | 没走 vite proxy | 检查 [vite.config.js:33](packages/client/vite.config.js#L33) proxy |
| 小程序提示 VM 内存爆 | 代码里有死循环 | 微信开发者工具 → 调试器看堆栈 |
| `mini-css-extract-plugin` 报错 | pnpm lockfile 过期 | `pnpm install --frozen-lockfile` 重装 |
| 白屏无报错 | manifest.json JSON 语法错 | `cat manifest.json | jq .` 验证语法 |

---

## 相关文档

- [deploy-guide.md](deploy-guide.md) — 上云部署（Nginx + HTTPS + 反代 + cookie 策略）
- [data-models-storage.md](data-models-storage.md) — 文件存储 driver 切换
- [routes-server.md](routes-server.md) — 后端 API 路由
- [packages/client/src/manifest.json](packages/client/src/manifest.json) — 当前 manifest 配置
- [packages/client/src/pages.json](packages/client/src/pages.json) — 当前页面注册表
- [packages/client/vite.config.js](packages/client/vite.config.js) — vite dev 配置