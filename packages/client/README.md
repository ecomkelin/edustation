# EduStation C 端 (家长/学生) 客户端

> 校外培训机构家长端 - 让孩子爱上学习
> 设计风格:暖橙教育 (亲子感、温暖、情感化)
> 技术栈:uni-app 3.x + Vue 3 + Vite 5 + Pinia

---

## ✨ 设计亮点

### 主题:暖橙教育
- **主色**:蜜桃橙 `#FF8A65`(活力、温暖、亲子)
- **辅色**:暖橙浅、薄荷绿、奶白、深咖
- **圆角**:24-48rpx 大圆角,药丸按钮
- **阴影**:暖橙色调阴影,不用纯灰
- **字号**:基础 30rpx,标题 36-48rpx,价格/数字 40rpx+ 加粗

### 微动效
- 按下回弹 (scale 0.96)
- 骨架屏脉冲
- 数字滚动动画 (积分变化)
- 破壳动画、宠物浮动
- 页面切换左进右出

### 情感化插画
- 空状态不是"暂无数据",而是"快去报名吧 🐾"
- 网络断 = "信号好像去捉迷藏了"
- 错误 = 萌宠 + 重试按钮

---

## 🚀 开发

### 安装依赖
```bash
pnpm install
```

### 启动 H5 dev (推荐)
```bash
pnpm dev:h5
# 浏览器打开 http://localhost:9000 (或自动切到 9001)
```

### 启动微信小程序
```bash
pnpm dev:mp-weixin
# 用微信开发者工具打开 dist/dev/mp-weixin/
```

### 启动 App
```bash
pnpm dev:app
# 用 HBuilderX 打开此目录,真机调试
```

### 打包
```bash
pnpm build:h5
pnpm build:mp-weixin
pnpm build:app
```

---

## 📁 目录结构

```
src/
├── api/                # 18 个 REST 封装 (含 401 自动 refresh)
│   ├── request.js      # 核心:401 自动 refresh + 并发合并 + 错误拦截
│   ├── auth.js / student.js / lessonSchedule.js ...
│
├── stores/             # Pinia 状态管理
│   ├── auth.js         # accessToken + user + orgs + pendingConsents
│   ├── student.js      # 当前孩子 + 列表 (CLAUDE.md §6)
│   └── siteConfig.js   # 平台公开配置 (备案号等)
│
├── components/         # 组件库 (按角色分组)
│   ├── common/         # 通用:EmptyState/Skeleton/Error/Toast/Button/Card/Tag
│   ├── layout/         # ActiveStudentHeader (顶部孩子切换)
│   ├── auth/           # SliderCaptcha/AgreementModal/PendingConsents
│   ├── pet/            # PetPortrait/HungerBar/ExpBar/EquipSlot ...
│   ├── schedule/       # WeekCalendar/MonthCalendar/LessonCard ...
│   └── ...
│
├── pages/              # 45+ 页面
│   ├── tabbar/         # 4 Tab (home/discover/pet/me)
│   ├── auth/           # 登录/改密
│   ├── student/        # 切换孩子/学习画像
│   ├── schedule/       # 课程详情/日历
│   ├── attendance/     # 考勤 (Phase 2)
│   ├── work/           # 作品 (Phase 2)
│   ├── order/          # 订单 (Phase 2)
│   ├── studentProduct/ # 课包 (Phase 2)
│   ├── course/         # 课程产品/报名 (Phase 3)
│   ├── points/         # 积分 (Phase 4)
│   ├── pet/            # 领养/破壳/喂食/换装/商城 (Phase 4)
│   ├── access/         # 接送授权/人脸 (Phase 5)
│   ├── agent/          # AI 助手 (Phase 6)
│   ├── legal/          # 协议条款
│   ├── org/            # 机构主页
│   ├── share/          # 分享得积分 (Phase 6 stub)
│   └── help/           # FAQ/联系/反馈
│
├── utils/              # 工具
│   ├── storage.js      # uni.storage 包装
│   ├── date.js         # dayjs 包装 (中文)
│   ├── format.js       # 金额/手机号/身份证格式化
│   ├── constants.js    # 业务枚举 (PetTier/OrderStatus/...)
│   ├── haptic.js       # 触感反馈 (H5 navigator.vibrate)
│   └── share.js        # 分享/海报/debounce/animateNumber
│
└── styles/             # 全局样式
    ├── variables.scss  # 主题变量 (scss)
    ├── mixins.scss     # shadow/ellipsis/center mixin
    ├── animations.scss # 关键帧 (fadeIn/bounce/pulse/spin/glow/float)
    └── reset.scss      # 全局重置 (page/container/section/tag/card/...)
```

---

## 🎨 设计 token 速查

```scss
// 主色
$primary: #FF8A65;
$primary-light: #FFB088;
$accent: #7CD9B7;
$warning: #FF6B6B;
$gold: #F5C148;

// 中性
$text-primary: #2D2D2D;
$bg-page: #FFFAF5;
$divider: #F0EBE6;

// 圆角
$radius-md: 24rpx;
$radius-lg: 32rpx;
$radius-pill: 999rpx;

// 字号
$font-base: 30rpx;
$font-lg: 36rpx;
$font-xl: 40rpx;
$font-2xl: 48rpx;
```

---

## 🧩 通用组件用法

```vue
<!-- 空状态 -->
<EmptyState
  title="今天没有课哦"
  desc="享受轻松的一天"
  emoji="🌈"
/>

<!-- 主按钮 -->
<PrimaryButton text="立即登录" block @click="onLogin" />

<!-- 按下回弹容器 -->
<PressFeedback @click="onTap">...</PressFeedback>

<!-- 卡片 -->
<Card padding="md" hover>
  ...
</Card>

<!-- 标签 -->
<Tag text="新" variant="warn" />
<Tag text="热门" variant="warn" solid />
```

---

## 📡 核心 API 模式

### request.js 自动 refresh
```js
import { http } from '@/api/request'

// 普通调用,401 自动 refresh
const data = await http.get('/students/me')

// 不需要 refresh (登录/refresh 本身)
const res = await http.post('/auth/login', body, { skipRefresh: true })

// 不需要 x-active-student-id (跨孩子的接口)
const all = await http.get('/students', { data: { org } }, { skipActiveStudent: true })
```

### 当前孩子上下文
```js
import { useStudentStore } from '@/stores/student'

const student = useStudentStore()
await student.fetchMyStudents()  // /students/me
student.setActive(id)            // 自动写入 storage + 下次请求带 x-active-student-id
```

---

## 🛣 实施阶段 (6 周)

| Phase | 内容 | 状态 |
|---|---|---|
| 1 | 基础体验 (登录 + 课表 + 我的 + 孩子切换) | ✅ 已完成 |
| 2 | 学习闭环 (考勤 + 作品 + 课包 + 订单) | ⏳ 待实装 |
| 3 | 发现 + 报名 (课程产品 + 机构主页) | ⏳ 待实装 |
| 4 | 激励 (积分 + 宠物 + 商城) | ⏳ 待实装 |
| 5 | 门禁 + 接送授权 + 人脸 | ⏳ 待实装 |
| 6 | AI 助手 + 分享得积分 | ⏳ 待实装 |

---

## 🔌 联调说明

### 后端地址
- 默认通过 vite proxy 代理 `localhost:9000/api` → `localhost:3000`
- 可在 `packages/client/.env.development` 设置 `VITE_PROXY_TARGET` 覆盖

### 登录测试账号
参考 `packages/server/scripts/` 下的 seed 脚本。
- 家长:手机号 139xxx (密码 = 手机号后 6 位)
- `requirePasswordChange=true` 时首次登录强制改密

### Auth 流程
1. `POST /auth/login` → 拿 accessToken (Cookie 携带 refreshToken)
2. 所有后续请求带 `Authorization: Bearer <accessToken>`
3. 401 → 自动 `POST /auth/refresh` (Cookie) → 重试原请求
4. refresh 失败 → 清空 + 跳登录

---

## 📋 端点覆盖

完整列表见 [`/Users/kelin/.claude/plans/shimmering-gathering-charm.md`](/Users/kelin/.claude/plans/shimmering-gathering-charm.md) 与后端 [`docs/claude/routes-server.md`](../server/../../docs/claude/routes-server.md)。

家长端覆盖 **MM=01/04/05-07/14-18/20-22/25-30/31/32** 中的 GUARD/AUTH 类端点。

---

## ❌ 不做 (明确边界)

- 不引入额外 UI 库 (如 uView/Vant) — 手写组件更可控
- 不做国际化 (先中文)
- 不做 PC 端
- 不做夜间模式 (MVP 后再说)
- 不做离线缓存
- 不做 PWA
- 不引入 Lottie 动效 (先用 CSS 关键帧)
- 不做宠物 species/items 动画版 (v1 用 SVG 静态图)

---

## 📦 打包发布

### H5
```bash
pnpm build:h5
# 产物在 dist/build/h5/ — 上传到 CDN
```

### 微信小程序
```bash
pnpm build:mp-weixin
# 用微信开发者工具打开 dist/build/mp-weixin/
# 上传 → 体验版 → 提交审核
```

### App (Android/iOS)
```bash
pnpm build:app
# 用 HBuilderX 打开此目录 → 发行 → 云打包
# 或 Tauri 包装 H5 后桌面化 (备用方案)
```

---

## 📜 相关文档

- [项目 CLAUDE.md](../../CLAUDE.md) — 整体开发指引
- [routes-server.md](../../docs/claude/routes-server.md) — 后端路由索引
- [data-models-*.md](../../docs/claude/) — 业务模型
- 规划文件: `~/.claude/plans/shimmering-gathering-charm.md`