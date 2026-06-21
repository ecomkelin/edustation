# 数据模型 - 人脸识别门禁 / 接送授权

> **何时读这个文件**：改人脸识别、门禁、接送授权（AuthorizedPickup）、AccessDevice / AccessEvent 时读。
> **一行摘要**：2026-06-21 立项的 accessControl 模块 — 4 model（AccessDevice / AccessEvent / AuthorizedPickup / FaceProfile）+ 33 端点 + 9 份文档。

---

## 模块位置

后端模块：`../packages/server/src/modules/access/`（routes / controller / service / validator）

文档组织：模块内 `docs/` 目录 9 份（架构图、接口设计、决策记录等）

详见 [memory: face-access-module-location]

## 核心 model（4 个）

### AccessDevice（门禁设备）

- `org`（Org ref）
- `deviceId`（设备硬件 ID）
- `name`
- `location`
- `type`（设备类型：进 / 出 / 双向）
- `isActive`
- `meta`

### AccessEvent（门禁事件流水）

- `org`
- `device`（AccessDevice ref）
- `faceProfile`（FaceProfile ref）
- `personType`：`student` / `authorizedPickup` / `staff` / `unknown`
- `student`（Student ref — 当 personType='student' 时）
- `authorizedPickup`（AuthorizedPickup ref — 当 personType='authorizedPickup' 时）
- `eventType`：`entry` / `exit` / `denied`
- `capturedAt`
- `snapshotUrl`（抓拍图，File ref）
- `confidence`（Number — 识别置信度）
- `meta`

### AuthorizedPickup（接送授权）

- `org`
- `student`（Student ref）
- `pickupUser`（User ref — 被授权人，可能不是学生家长）
- `relation`（String — 与学生的关系）
- `validFrom` / `validUntil`
- `isActive`
- `meta`

### FaceProfile（人脸特征档案）

- `org`
- `personType`：`student` / `user`
- `student`（Student ref — 当 personType='student' 时）
- `user`（User ref — 当 personType='user' 时）
- `featureVector`（加密的特征向量）
- `enrolledAt`
- `lastUpdatedAt`
- `meta`

## 关键决策（详见模块 docs/）

1. **特征向量加密存储**：不存原图，存加密后的特征向量；权限分层仅平台超管可解密
2. **人脸 1:N 兜底**：同人可登记多张脸（角度不同）；匹配时取最高置信度
3. **离线优先**：设备端本地识别为主，弱网/离线时本地缓存事件，联网后同步

## 进度（截至 2026-06-21）

- 模块骨架已建立
- 4 model schema + 33 端点完成
- 文档 9 份完成
- 待：硬件对接 / E2E 测试 / 灰度上线

---

> 此文件为占位，详细字段、端点、决策记录请直接 Read 模块目录下的 `docs/`。
