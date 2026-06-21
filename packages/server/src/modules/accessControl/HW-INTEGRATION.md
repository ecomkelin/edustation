# 硬件联调步骤 (HW-INTEGRATION.md)

> PoC 阶段目标：1 校区 1-2 台门禁一体机，跑通"学员到校识别 + 家长接送核验"两条主线。
> 设备选型：**熵基 F7S**（7 寸双镜头，~700-900 元）或 **汉王 HW-D8**（同档位）。两者协议接近，hanwang driver 可覆盖。

---

## 1. 采购清单

| 物料 | 数量 | 单价 | 备注 |
|------|------|------|------|
| 熵基 F7S 7 寸人脸识别一体机 | 1 | ~800 元 | 淘宝/1688 |
| 12V 2A 电源适配器 | 1 | ~30 元 | 通常随机附 |
| 4G SIM 卡或有线网 | 1 | - | PoC 用有线；上线接校园网 |
| 门磁信号线 | 1 | ~20 元 | 接电磁门锁（PoC 可不接） |
| 电磁门锁 + 支架 | 1 | ~150 元 | 选配；PoC 用人工观察确认 |
| 802.3af PoE 注入器 | 1 | ~50 元 | 选配；如走 PoE 供电 |

**预算总计：~1,000-1,100 元**（含门锁）。

> **不**采购 4G 版（贵 200 元），PoC 阶段连 WiFi 即可。

---

## 2. 物理安装

### 2.1 安装位置

- **前门内侧**（学员主入口）：离地 1.4-1.6m，摄像头对人脸正前方 0.5-1.5m
- **不**装外侧（雨淋 + 强光影响识别）
- 留 ≥ 30cm 空间给散热
- 摄像头可见，张贴 **"本区域进行人脸识别采集，已签同意书方可使用"** 提示

### 2.2 电源 + 网络

- **电源**：12V 2A 适配器就近取电
- **网络**：校园网有线接入（PoC）；或 WiFi（信号弱时换有线）
- **门锁**（PoC 阶段可不接）：一体机的 NO/NC/COM 端子接电磁门锁

### 2.3 上电测试

1. 接电源，屏幕亮起 → 显示"请刷脸"
2. 系统设置 → 网络配置 → 配 WiFi/有线 → ping `8.8.8.8` 成功
3. 系统设置 → 设备信息 → 记录 **deviceSn**（后续 Admin 注册要用）

---

## 3. Admin 端注册设备

### 3.1 登录 Admin

```bash
# 浏览器访问 http://localhost:5173 (开发)
# 管理员账号登录（如未创建，先在 seed 里加）
```

### 3.2 进入"门禁设备"页

左侧菜单 → 智能硬件 → 门禁设备 → "注册设备"

### 3.3 填表

| 字段 | 值（PoC 示例） |
|------|---------------|
| 名称 | "前门人脸机" |
| 厂商 | "hanwang" |
| 型号 | "F7S" |
| 设备 SN | 一体机显示的 SN（例 `ZKF7S-2024-001`） |
| webhookSigningKey | **手填**一个 16+ 字符随机串（`openssl rand -hex 16`） |
| 位置 | "前门内侧" |
| IP 地址 | 一体机实际 IP（**软防御用，可空**） |

提交后：
- 系统返回完整 device 文档（**含 webhookSigningKey 原文**，**仅此一次**）
- 立即复制保存到密码管理器

### 3.4 复制 webhook URL

在设备详情页找到 webhook URL，格式：
```
https://<your-server>/api/v1/access-control/webhook/<deviceSn>
```

> 本地开发用 ngrok：`ngrok http 3000` → 把 ngrok URL 给一体机配。

---

## 4. 一体机配置

### 4.1 熵基 F7S / 汉王 HW-D8 配置步骤（通用协议）

> 不同固件版本菜单不同，下面是大致流程；以设备实际菜单为准。

1. **系统设置 → 网络**：配 WiFi/有线 → 测 ping 服务器
2. **系统设置 → 通信协议**：
   - 协议类型：**HTTP/HTTPS 推送**（不是 MQTT，不是 TCP）
   - 推送 URL：粘上面的 webhook URL
   - 鉴权方式：**自定义 Header**（HMAC）
   - Header 模板：
     ```
     X-Signature: <动态计算>
     X-Timestamp: <动态填入>
     X-Nonce: <recordId>
     ```
   - **重要**：部分设备用 `Authorization: Bearer <key>` 而不是 HMAC；如本设备不支持动态 Header，**降级方案**见 §4.2
3. **识别设置**：
   - 阈值：相似度 ≥ 0.75（误识/拒识平衡点）
   - 活体检测：**开启**（防打印照片攻击）
   - 识别后动作：**仅推送**（不联动门锁；门锁由设备本地策略控制）
4. **设备时间**：校准到 NTP 服务器（`ntp.aliyun.com`），避免 clockSkewMs 过大
5. **保存重启**

### 4.2 降级方案：设备不支持 HMAC Header

部分廉价设备只支持 `Authorization: Bearer <token>` 静态鉴权。**不建议用**（无重放保护），但 PoC 阶段可作为兜底：

1. webhookSigningKey 字段填一个固定 token
2. 设备 Authorization 头固定填 `Bearer <token>`
3. webhookAuth 中间件**做最小验证**：
   - 校验 `Authorization` 头存在
   - 校验 `X-Timestamp` 在 5 分钟内
   - **不**做 HMAC（牺牲防重放，依赖 deviceEventId 唯一索引兜底）

> 此降级方案**应记录在 CLAUDE.md §17.4 风险章节**，v2 改回标准 HMAC。

---

## 5. 录入测试人脸

### 5.1 录入到一体机本地

1. 一体机 → 人员管理 → 添加人员
2. 填：姓名（如"测试学员A"）、类型（**自定义**为 `student` / `parent` / `pickup`）、权限（**白名单**）
3. 摄像头采集 3 张清晰正脸照
4. 录入后一体机会分配一个内部 ID（**记录这个 ID**——后续要走我们后端的对齐）

### 5.2 录入到我们后端（家长端小程序）

> 这是真正的合规流程；一体机本地录入只是 PoC 临时方案。

1. 家长登录小程序
2. 我的 → 人脸档案 → 添加 → 弹"电子同意书" → 阅读 → 同意
3. 拍照上传（uni.chooseMedia）→ 后端落 `UserConsent` + `FaceProfile.enrollmentPhoto`
4. 列表里显示"已录入"

### 5.3 PoC 简化：两端 ID 对齐

> 一体机的本地 ID 跟我们后端的 `FaceProfile._id` **不一致**。hanwang driver 现在按 `userId` 字段透传设备返回的 ID（String）。PoC 阶段**接受**两端 ID 独立、流水里的 `subject` 是设备 ID 字符串，需要**事后做 ID 对齐**（Day 13-14 任务）。

---

## 6. 端到端测试

### 6.1 学员到校识别

1. **前置**：学员 A 已在小程序录入人脸 + 一体机本地录入人脸
2. **测试**：学员 A 站在一体机前
3. **期望**：
   - 一体机屏幕显示 "识别成功 + 学员 A"
   - 一体机 POST webhook 到我们后端
   - server 落 1 条 `AccessEvent`：eventType='recognized', result='allowed'
   - Admin → 进出流水 页面 1 秒内看到这条记录
   - 家长 A 收到 unipush 推送（**v2**）

### 6.2 家长接送核验

1. **前置**：家长 B 已签同意书 + 录入人脸 + AuthorizedPickup 创建好
2. **测试**：家长 B 站在一体机前（去接孩子）
3. **期望**：
   - 一体机 POST webhook → subjectType='parent' → 后端查 `AuthorizedPickup.find({pickupUser, student, valid, notRevoked})` 命中 → result='allowed'
   - 教务手机收到 unipush 推送"家长 B 正在接学员 A"（**v2**）

### 6.3 陌生人识别

1. **测试**：未录入的陌生人站在一体机前
2. **期望**：
   - 一体机 POST webhook → subjectType=null → eventType='stranger' → result='denied'
   - Admin 进出流水 标红 + 抓拍图
   - **不**开门

### 6.4 照片攻击

1. **测试**：用 A 的打印照片对着摄像头
2. **期望**：
   - 一体机活体检测失败 → webhook livenessResult='failed' → 后端 result='denied'（强制）
   - **不**开门

---

## 7. 现场部署 checklist

部署到真实校区时按此 checklist 走：

- [ ] 设备 SN 已记录
- [ ] 设备 IP 已记录
- [ ] Admin 端"门禁设备"页能看到设备
- [ ] webhook URL 已配置
- [ ] webhookSigningKey 已保存到密码管理器
- [ ] 设备 NTP 已校准（clockSkewMs < 5s）
- [ ] 设备已录入至少 3 张测试人脸
- [ ] 现场跑通 6.1 / 6.2 / 6.3 / 6.4
- [ ] 摄像头处张贴"人脸识别采集"提示
- [ ] 弱电箱附近留电源和网络接入点
- [ ] 教务已培训设备使用（清缓存、重启、看日志）

---

## 8. 常见问题

| 现象 | 原因 | 修复 |
|------|------|------|
| 一体机屏幕亮但 POST 不出 | 网络不通 | 测 ping 服务器；查一体机日志 |
| webhook 返回 401 HMAC 不匹配 | signing key 配错 | Admin 端"重置 secret" → 重新配置一体机 |
| webhook 返回 401 时间窗越界 | 设备时钟漂移 | 配 NTP；或放宽 webhookAuth 5min→10min |
| 一体机显示"识别成功"但 server 没记录 | webhook 没发出去 | 看一体机日志；或抓包 |
| 抓拍图全黑 | 摄像头遮挡 | 擦镜头；调 IR 灯亮度 |
| 活体检测率太低 | 光线/角度差 | 调阈值；加辅助光 |
| 接送时 result='denied' | AuthorizedPickup 已过期或撤销 | 客户端查接送授权状态 |

---

## 9. 设备厂商沟通清单

购买前 / 收到货时需要确认：

- [ ] 通信协议文档（是否 HTTP POST + 自定义 Header）
- [ ] 是否支持 HMAC 签名（不支持则走 §4.2 降级）
- [ ] 是否支持"未识别时也推送"（陌生人场景）
- [ ] 是否支持"识别后仅推流、不联动门锁"
- [ ] 抓拍图字段名（`snapshot` / `image` / `pic`）
- [ ] 活体检测是否可关闭（PoC 关掉便于调试）
- [ ] NTP 是否支持自定义服务器
- [ ] 二次开发 SDK 是否提供（v2 接 syncFaceProfile 必备）

---

## 10. 上线后的运维

- **每天**：Admin 端看"心跳超时设备"（`lastHeartbeatAt > 5min ago` 标红）
- **每周**：看 `AccessEvent` 看板，陌生人占比 > 5% 检查原因
- **每月**：跑清理 30 天前 snapshot 的 SQL（v2 改 cron）
- **每季度**：校准设备时钟；更新固件
- **每年**：盘点设备，淘汰老旧
