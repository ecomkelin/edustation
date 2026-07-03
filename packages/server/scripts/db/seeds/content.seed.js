'use strict'

/**
 * 平台科普文章 + 小游戏 + 科普视频 种子 (2026-07-03 立项 + 2026-07-03 扩视频)
 *
 * 内容 (org=null) 平台级, 跨机构对所有 C 端家长可见.
 * 幂等: Article 按 title upsert; Game 按 name upsert; Video 按 title upsert.
 * 单跑也可, 不依赖 initial.seed 的 dropDatabase 流程.
 *
 * 数据:
 *   - 文章: 8 篇 (编程 / 艺术 / 安全 + 数学之美 5 篇: e/π/0/i/φ)
 *   - 游戏: 3 款 (颜色 / 数字 / 看图成语)
 *   - 视频: 6 段 (黑洞/海洋/恐龙/火山/微观/星空) — 2026-07-03 同日加, 跟 Article/Game 一致评级
 *
 * 注意事项:
 *   - Game.launchUrl / Video.videoUrl 真实环境应是平台自有 H5 / mp4;
 *     这里先放示例 URL (Google 公开演示视频), 替换为生产 URL 时改 rawUrl 字段即可
 */

const Article = require('@models/Article.model')
const Game = require('@models/Game.model')
const Video = require('@models/Video.model')
const { compileMarkdownSafe } = require('@utils/markdown')

const ARTICLES = [
  {
    key: 'science-kids-programming-myths',
    title: '孩子学编程的 3 个常见误区, 家长别再交智商税',
    summary: '不是越早越好, 不是越贵越好, 不是会写代码就好。本文给家长讲清楚编程启蒙的核心是什么。',
    category: 'science',
    coverEmoji: '💻',
    markdown: `# 孩子学编程的 3 个常见误区

很多家长觉得 "学编程 = 未来高薪", 但忽视了编程教育的核心其实是**思维训练**, 不是码农培训。

## 误区一: 越早越好

3 岁学 Python 是噱头, 5 岁学 Scratch 才是黄金起点。这个阶段孩子**符号化抽象思维**刚开始发展,
搭积木式拖拽能让他们享受"输入→输出"的因果反馈, 培养"我能指挥机器"的自信。

## 误区二: 越贵越好

3 万一年的编程课家长买心安, 但效果往往不如一个**老师带 8 个孩子玩 1 小时 Arduino**。

## 误区三: 能写代码就够

少儿编程教育的目的是培养**计算思维**: 拆解 / 模式识别 / 抽象 / 算法。
能写 50 行代码的孩子, 不一定比会拆解"电梯运行"的 6 岁孩子更优秀。

## 怎么判断一家编程机构好不好?

- **课堂提问比代码量更重要**: 老师有没有问"为什么这样设计"
- **项目驱动 vs 题目驱动**: 是做完一个小游戏还是刷完 100 道题
- **作品能讲出故事**: 孩子能不能 3 分钟讲清自己做的项目
`
  },
  {
    key: 'parenting-why-art-class',
    title: '为什么一定要让孩子学艺术? 这不是兴趣班那么简单',
    summary: '艺术教育不是 "学画画", 是建立孩子感知美、表达自我的底层能力, 影响一生的审美与情绪调节。',
    category: 'parenting',
    coverEmoji: '🎨',
    markdown: `# 艺术课 ≠ 学画画

很多家长以为艺术课就是 "学画苹果", 但**真正的艺术教育** 是:

## 1. 看见别人看不见的美

美术馆训练不是背流派史, 是让孩子在 30 幅画里挑出"为什么这幅让我停下".
这种**主动选择能力** 未来决定他能否在海量信息里找到自己的路。

## 2. 表达别人说不出的话

小孩摔疼了说不出"委屈", 但能画出**黑色三角形压着红色圆**。
艺术是孩子的"第二语言", 是情绪健康的**安全阀**。

## 3. 接受"不完美"的自己

画画没有标准答案, 写代码错了会报错, 画画错了也能成为"风格"。
艺术教育让孩子学会**和不确定性共处**, 这是 AI 时代最稀缺的素养。

## 家长怎么支持?

- ❌ 不要画完画就拍照发朋友圈求点赞 (在孩子眼里作品被"评判"很挫败)
- ✅ 把孩子的画存起来, 5 年后翻给他看 (他会被自己的成长感动)
- ✅ 带孩子逛美术馆/看纪录片 (输入 > 技法)
`
  },
  {
    key: 'safety-summer-class-tips',
    title: '暑期班接送 + 课间安全, 家长请收好这 8 条',
    summary: '暑期人多是常态, 接送错峰/课间看护/出门装备, 一文说全家长最关心的 8 个细节。',
    category: 'safety',
    coverEmoji: '🛡️',
    markdown: `# 暑期班安全 8 条实用清单

## 接送环节

1. **接送人必须报备**: 临时换人接孩子, 提前在班级群里@老师, 老师也会**当面向孩子确认**
2. **不要发视频定位**: 接孩子时群里**不发**实时位置, 防止陌生人盯梢
3. **到机构门口先签到**: 大部分机构有电子签到, 别心疼 30 秒嫌麻烦

## 课间看护

4. **认准带证老师**: 佩戴工牌的才是正式老师, 没有工牌的"助教"主动询问
5. **孩子说"不舒服"立即接走**: 不要让小朋友"忍一忍", 暑期中暑高发
6. **禁忌物品清单**: 小颗粒玩具/气球/电池, 3 岁以下小朋友应避免带进教室

## 出门装备

7. **水杯放教室门口**: 避免课中频繁进出门, 也减少走廊踩踏
8. **薄外套 + 帽子**: 教室空调 + 户外 30 度, 温差大容易感冒

> 真正的安全不是"不出事", 而是**每个环节有人接、有人管、有人记录**。
`
  },

  // ─── 2026-07-03 二次扩: 数学之美系列 (用户原话 "e 有什么作用 怎么来的 有多神奇 等等这样的科学类的文章") ───
  {
    key: 'science-number-e-magic',
    title: '2.71828 这个神奇数字, 让存钱、买奶茶、聊微信都离不开它',
    summary: 'e 是数学里最不像数字的数字, 它不是人造的, 而是被发现的——银行利息、奶茶冷热、你的手机信号, 全都偷偷在用它。',
    category: 'science',
    coverEmoji: '🌀',
    markdown: `# e = 2.71828..., 数学界最浪漫的常数

π 大家都熟, 但数学家投票 "最美公式", 击败 π 的不是别的——是 **e**。

## 它怎么来的? 一笔"复利"的账

把 1 块钱存银行, 年利率 100%:
- 1 年结算 1 次, 你拿到 **2 元** (本金 × 2)
- 半年结算 1 次: 1 × 1.5 × 1.5 = **2.25 元**
- 1 月结算 1 次: 约 **2.61 元**
- 1 天结算 1 次: 约 **2.71 元**
- 1 秒结算 N 次, 一直细分下去——

极限就是 **e = 2.718281828459045...**, 无理数, 没完没了。

> 一个"复利"问题, 自然引出了一个普世常数——这不是约定, 是世界本来就这样。

## 它有什么用? (你今天就用了 3 次)

- **买奶茶冷热**: 奶茶温度从 95°C 降到室温的速度, 是**指数衰减**, 背后就是 e
- **聊微信发消息**: 信号强度随距离衰减, 同样是 e^x
- **存钱**: 复利公式 A = P × e^(rt)
- **统计学的"钟形曲线"**: 正态分布的归一化常数还是 e
- **微积分的导数**: d(eˣ)/dx = eˣ——**唯一一个求导不变自己的函数**
- **欧拉恒等式**: e^(iπ) + 1 = 0, 把 5 个最重要的数学常数用 1 个等式串起来, 被誉为"数学圣经"

## 为什么学校不教?

小学不教 e 是因为 e 是**指数**家孩子, 9 岁前没抽象指数概念很难懂。
但**直觉是孩子能懂的**: "利滚利越滚越大、距离越远信号越弱、温度都是先快后慢地变"——这些都是 e 在后台。

> 跟孩子吃饭时, 把"为什么第一口烫、后面几口就刚好" 换成"e 是让东西变慢但不停止的魔法师"——他会懂得比我当年早。

---

**给孩子的彩蛋**: 用计算器按 \`(1 + 1/n)^n\`, n 取 10, 100, 1000, 10000 —— 会发现答案越来越接近 **2.71828**。
这就是 17 世纪雅各布·伯努利发现 e 时用的公式。
`
  },

  {
    key: 'science-number-pi-story',
    title: 'π 不只是 3.14 那么简单, 4000 年来人类为它跑了一场接力',
    summary: '从巴比伦人到祖冲之到超级计算机, 圆周率的故事是数学家较劲 + 人类计算极限的全部历史。',
    category: 'science',
    coverEmoji: '🥧',
    markdown: `# π: 一场跑了 4000 年的接力赛

π 是圆的"周长 ÷ 直径", 一个看似简单的问题, 却烧死了多少数学家的头发。

## 4 个精彩的里程碑

### 1. 巴比伦人 (公元前 1900 年)
用 **3.125** 当 π, 砌金字塔够用了, 误差约 0.6%。

### 2. 阿基米德 (公元前 250 年)
天才的想法: **圆的周长夹在两个多边形之间**
- 内切 96 边形: π < 3.1429
- 外切 96 边形: π > 3.1408
- 算出 π ≈ **3.14159**, 误差仅 0.0002!

### 3. 祖冲之 (公元 480 年)
领先西方 1000 年, 给出 **3.1415926 ~ 3.1415927**, 还算出密率 355/113,
误差 0.0000003, 800 年后欧洲才追上。

### 4. 沙川公式迭代 (1949 - 2022)
超级计算机算到 **100 万亿位**——但这些位有什么意义?

## 那么, π 是不是"无限不循环"?

数学上**未证明** (这是个悬案), 我们目前知道:
- 它**不是**两个整数的比 (无理数)
- 它**不是**任何代数方程的根 (超越数)

至今没人能证明 π **永远** 不循环。

## 我家孩子学这个干嘛?

哈佛数学教授 Steven Strogatz 说:
> "孩子不需要记住 π 的 100 位, 但要理解**人类为逼近真理接力了 4000 年**这件事本身。"

学 π 不是背数字, 是学一种**对完美的执念**, 学一种**永远接受'还没完'**的心态。

---

**动手彩蛋**: 拿一根绳子围成一个圈, 量一下"周长 ÷ 直径"——拿牙签、铅笔、橡皮都行, 不管什么圆,
答案都是 3.14 附近。2000 年前的阿基米德也是这么开始的。
`
  },

  {
    key: 'science-zero-invention',
    title: '"0" 不是没, 是被人类追了 1500 年的伟大发明',
    summary: '没有 0 这个符号, 计算机、二进制、整个数学文明都不存在。一件看似理所当然的东西, 藏着人类最艰难的智识冒险。',
    category: 'science',
    coverEmoji: '🕳️',
    markdown: `# 0 的故事: "没有" 是最难想清楚的事

我们觉得 0 天经地义, 但人类为发明它**争吵了 1500 年**。

## 为什么 0 这么难?

因为"什么都没有"是个**反直觉** 的概念。3 可以对应 3 头羊, 但 0 对应什么?
古希腊哲学家说"0 不存在", 罗马数字没有 0——结果西方数学**落后东方 1000 年**。

## 印度人发明, 阿拉伯人传播

**公元 458 年** (我国南北朝), 印度数学家**阿耶波多** 写下 0 的运算法则:
> "加 0 不变、减 0 不变、乘 0 得 0。"

这是人类史上**第一次正式承认 "0 是一个数"**。

后来阿拉伯商人把这套数字带到了欧洲, **"阿拉伯数字"** 之名由此而来。
(讽刺: 阿拉伯人不发明, 是传播者; 真正发明是印度人。)

## 0 改变世界的 3 个瞬间

### 1. 没有 0, 就没有 "100" 写法
没有位置记数法, 古罗马数字 "MMM" 写 3000 还需要更多 M——你看, 罗马数字写大数能把人累死。

### 2. 没有 0, 没有坐标
笛卡尔 17 世纪发明直角坐标系, 中心点 (0, 0)。没有 0, **整个解析几何** 都建不起来。

### 3. 没有 0, 没有计算机
二进制只有 0 和 1。你手机里**所有照片音乐视频**, 拆到底都是 "无数个 0 和 1"。

## 给孩子的反向启发

- **"什么都没有"也是答案**: 孩子答 0 不是错, "今天作业 0 项" 也是信息
- **约定俗成有时比真理更慢**: 0 这么自然的东西, 人类花了 15 个世纪才接受
- **不要笑看似"显而易见"的发明**: 历史上最深奥的突破, 往往"事后看"都平凡得像 0

---

**彩蛋**: 带孩子读《0 的故事》绘本, 看从印度到阿拉伯到欧洲的"旅行地图",
让他知道一个数字概念花了 1500 年走了 8000 公里。
`
  },

  {
    key: 'science-imaginary-number-i',
    title: '复数里的 i 真是 "想象出来" 的, 却让手机和电脑离不开它',
    summary: 'i = √-1 是个"不存在"的数, 但工程师用它造芯片、做信号、做 MP3 压缩。本文讲 i 怎么从笑话变成支柱。',
    category: 'science',
    coverEmoji: '🌀',
    markdown: `# i: 数学家以为开玩笑, 工程师用来救世界

## 故事开头: x² + 1 = 0 无解

方程 "x² = -1" 在实数世界里**不可能成立**, 因为正数 × 正数永远是正数。
文艺复兴时的数学家 Cardano 第一次写了 √-1 这种东西, 然后说:
> "这玩意儿在精神上折磨人, 但实际有用。"

他给它起了个名字 **i** (拉丁文 **imaginarius** = 想象的)。

## 但 i 真的有用吗?

**有, 而且是支柱性有用**。

把"实数 + i"加在一起, 就构成**复数** (complex number)。
这有个惊人的性质: i² = -1, 让数学家第一次能"画"出 2 维空间——

> **复数 = "2 维平面上" 的数**, 而 i 就是"第二根坐标轴"。

## 我家娃能用上吗?

每一个你**看过的视频** 都跟 i 有关, 因为:
- **音频 / 视频压缩** (MP3, AAC, JPEG) 用了一种叫 **傅里叶变换** 的算法
- 傅里叶变换的核心**全部在复数空间** 做
- 没有 i, **没有 Spotify, 没有抖音, 没有手机拍照**

i 让数学**从平面变成立体**, 让工程师**能用旋转代替微积分**——一切都从那个"不可能的数"开始。

## i 教会孩子的事

- **看似荒谬的假设, 可能藏着未来的标准答案**
- **"不存在的数" 真的有大用**——这是最大的反直觉教育
- **接受矛盾的存在**: √-1 不存在, 但 √-1 × √-1 = -1 真实存在; 数学允许我们这么用

---

**彩蛋**: 带孩子画一张"复平面"——横轴是实数 (1, 2, 3...), 纵轴是虚数 (i, 2i, 3i...),
让他在 (3, 4i) 这种点上找规律——这才是**真正的 2 维数学**。
`
  },

  {
    key: 'science-golden-ratio',
    title: '1.618 这个数字, 为什么画家觉得好看? 鲨鱼身上都有它',
    summary: '黄金分割 φ 是大自然的隐藏设计; 但 "为什么好看" 比 "在哪里" 更值得讲给孩子。',
    category: 'science',
    coverEmoji: '🌻',
    markdown: `# φ = 1.618: 黄金分割到底"黄金"在哪?

## 它是什么?

把一条线段切两段, **长的 ÷ 短的 = 总 ÷ 长**, 这两个比都等于同一个数 ——
这个数就是 **φ (phi) = 1.6180339887...**。

它是自然界**最常出现的无理数**, 出现在:
- 鹦鹉螺壳的内部分形
- 向日葵花盘的螺旋数
- 鲨鱼牙齿的比例
- 你手指节之间的比例
- 经典油画 (蒙娜丽莎, 维纳斯) 中构图的比例
- 苹果 iPhone 早期机型的高宽比 (故意为之)

## 为什么"好看"?

这是争议最多的部分——严肃说:
- **人的眼睛偏好"省脑子的模式"**, 1.618 是"既不偏向正方形又不偏向拉长"的折中
- **视觉神经对比例接近 1.6:1 的形状扫描最少** —— 美感 = 节能
- **黄金矩形**不管怎么切, 子矩形**仍是**黄金矩形, 让人感觉"无穷里有秩序"

## 但心理学会泼冷水

很多"黄金分割在艺术品里"的说法是**事后编的**——文艺复兴画家未必真在用 1.618, 而是 19 世纪浪漫主义文人附会的故事。

现代心理实验证明:
- **人们对 1.5 ~ 1.8 范围内的比例普遍觉得"美"**, 不只是 1.618
- **文化差异比数学差异影响更大**——某些非西方艺术传统里"美"用别的比

## 给孩子讲, 怎么讲?

我推荐把这个故事**拆成两层**讲:

### 第一层: 给好奇心
> "鹦鹉螺壳长大后, 总是把旧的房间按 1.618 倍数扩大, 这样它永远不搬家, 但每一圈都比上一圈舒服 1.618 倍。"

### 第二层: 给怀疑精神
> "我们也看到 1.618, 但有一群人偏说 1.5 更美——所以 '美' 是一种**约定**, 不是绝对真理。"

这恰好是数学和审美**共同的真相**: 偏好是可被验证的, 但**不是唯一的**。

---

**彩蛋**: 拿一张 A4 纸 (210×297), 算一下 297 ÷ 210——你会得到 √2 ≈ 1.414,
不是 1.618。这告诉我们**"设计"不必用黄金分割**, 但**处处都有数学**。
`
  }
]

const GAMES = [
  {
    key: 'game-color-match',
    name: '颜色大作战',
    intro: '30 秒内找出颜色相同的卡片, 训练孩子视觉分辨 + 反应速度',
    tags: ['认知', '反应', '适合 4-7 岁'],
    difficulty: 'easy',
    launchUrl: 'https://example.com/games/color-match/index.html',
    coverEmoji: '🎨'
  },
  {
    key: 'game-number-chain',
    name: '数字接龙',
    intro: '把 1-15 按顺序点击, 经典数字排列训练, 适合幼小衔接',
    tags: ['数学', '逻辑', '适合 5-8 岁'],
    difficulty: 'medium',
    launchUrl: 'https://example.com/games/number-chain/index.html',
    coverEmoji: '🔢'
  },
  {
    key: 'game-pic-riddle',
    name: '看图猜成语',
    intro: '看图联想成语, 锻炼图像思维 + 中文词汇量',
    tags: ['语文', '成语', '适合 7-12 岁'],
    difficulty: 'medium',
    launchUrl: 'https://example.com/games/pic-riddle/index.html',
    coverEmoji: '🈚'
  }
]

// ─── 2026-07-03 同日加: 科普视频 (跟 Article/Game 一致评级, 平台级 org=null) ───
// 视频示例 URL 来自 Google 公开演示视频 (gtv-videos-bucket), C 端 web-view 可直开
// 生产环境请上传自有 H5 / mp4 替换 rawUrl 字段
const VIDEOS = [
  {
    key: 'video-blackhole',
    title: '黑洞到底是什么? 一段动画看懂宇宙最深处的怪物',
    intro: '光是宇宙里跑最快的, 但黑洞让光也跑不掉。10 分钟动画带你走过爱因斯坦到 NASA 黑洞照片的全部里程碑。',
    category: 'space',
    tags: ['黑洞', '宇宙', '天文'],
    durationSeconds: 596,
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    coverEmoji: '🪐'
  },
  {
    key: 'video-deep-ocean',
    title: '海底 10000 米下有什么? 这是人类都到不了的地方',
    intro: '马里亚纳海沟 11000 米深处, 阳光到不了, 水压能把坦克压扁, 但这里仍有活着的生命。',
    category: 'nature',
    tags: ['海洋', '深海', '地球'],
    durationSeconds: 653,
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    coverEmoji: '🌊'
  },
  {
    key: 'video-dinosaur-era',
    title: '恐龙是怎么灭绝的? 一颗小行星如何改写 1.6 亿年的地球霸主',
    intro: '统治地球 1.6 亿年的恐龙, 在一颗 10 公里的小行星撞击后, 6600 万年前彻底消失。本文给孩子讲清楚那个 "最后一天"。',
    category: 'history',
    tags: ['恐龙', '小行星', '古生物'],
    durationSeconds: 645,
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    coverEmoji: '🦕'
  },
  {
    key: 'video-volcano-inside',
    title: '火山里面到底长什么样? 跟着镜头走进 1100 度的炼狱',
    intro: '不是所有岩浆都是红的, 不是所有火山都喷发, 火山其实有好几种脾气。本文带孩子认识 3 种典型火山。',
    category: 'nature',
    tags: ['火山', '地球', '地质'],
    durationSeconds: 15,
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    coverEmoji: '🌋'
  },
  {
    key: 'video-microscopic-cell',
    title: '显微镜下看细胞分裂, 你的身体每天都在上演 "魔法"',
    intro: '人体每秒钟有 380 万个细胞死亡, 同时也有 380 万个新生细胞开始工作。一段延时摄影带你看清这个过程。',
    category: 'science',
    tags: ['细胞', '生物学', '显微镜'],
    durationSeconds: 60,
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    coverEmoji: '🔬'
  },
  {
    key: 'video-starry-universe',
    title: '你看到的每一颗星, 都来自几万年前 — 宇宙的过去正在照在你脸上',
    intro: '北极星的光走了 433 年才到地球。有些恒星的寿命比太阳长几百倍, 有些星系正在以光速远离我们。',
    category: 'space',
    tags: ['星空', '宇宙', '天文'],
    durationSeconds: 15,
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    coverEmoji: '🌌'
  }
]

async function upsertArticles() {
  const ops = ARTICLES.map((a) => ({
    updateOne: {
      // 用 org+title 做唯一键 (org=null 平台级, title 视为 dup 判重)
      filter: { org: null, title: a.title },
      update: {
        $set: {
          org: null,
          title: a.title,
          summary: a.summary,
          contentMarkdown: a.markdown,
          contentHtml: compileMarkdownSafe(a.markdown),
          // 没装 File 模型, 暂时用 emoji 塞 cover 字段 (service 端 coverFile 优先, 缺则取 meta.coverEmoji)
          coverFile: null,
          category: a.category,
          isPublished: true,
          publishedAt: new Date(),
          'meta.coverEmoji': a.coverEmoji
        }
      },
      upsert: true
    }
  }))
  const r = await Article.bulkWrite(ops)
  return { upserted: r.upsertedCount, modified: r.modifiedCount, matched: r.matchedCount }
}

async function upsertGames() {
  const ops = GAMES.map((g) => ({
    updateOne: {
      filter: { org: null, name: g.name },
      update: {
        $set: {
          org: null,
          name: g.name,
          intro: g.intro,
          launchUrl: g.launchUrl,
          coverFile: null,
          coverUrl: '',
          tags: g.tags,
          difficulty: g.difficulty,
          isPublished: true,
          publishedAt: new Date(),
          'meta.coverEmoji': g.coverEmoji
        }
      },
      upsert: true
    }
  }))
  const r = await Game.bulkWrite(ops)
  return { upserted: r.upsertedCount, modified: r.modifiedCount, matched: r.matchedCount }
}

async function upsertVideos() {
  const ops = VIDEOS.map((v) => ({
    updateOne: {
      filter: { org: null, title: v.title },
      update: {
        $set: {
          org: null,
          title: v.title,
          intro: v.intro,
          videoUrl: v.videoUrl,
          coverFile: null,
          coverUrl: '',
          category: v.category,
          tags: v.tags,
          durationSeconds: v.durationSeconds,
          isPublished: true,
          publishedAt: new Date(),
          'meta.coverEmoji': v.coverEmoji
        }
      },
      upsert: true
    }
  }))
  const r = await Video.bulkWrite(ops)
  return { upserted: r.upsertedCount, modified: r.modifiedCount, matched: r.matchedCount }
}

async function run() {
  const aR = await upsertArticles()
  // eslint-disable-next-line no-console
  console.log('[seed][content] articles:', aR)
  const gR = await upsertGames()
  // eslint-disable-next-line no-console
  console.log('[seed][content] games:', gR)
  const vR = await upsertVideos()
  // eslint-disable-next-line no-console
  console.log('[seed][content] videos:', vR)
  return { articles: aR, games: gR, videos: vR }
}

module.exports = { run, ARTICLES, GAMES, VIDEOS }
