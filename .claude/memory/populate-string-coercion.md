---
name: populate-string-coercion
description: After Mongoose .populate(), the field becomes { _id, ... }; String(obj) === '[object Object]', never matches actor.userId — use refId(obj) helper
metadata:
  type: feedback
---

After `Task.findOne().populate('creator', 'realName avatar').lean()`, `task.creator` becomes `{ _id: ObjectId, realName, avatar }`, NOT an ObjectId/string. `String(task.creator) === String(actor.userId)` will compare `'[object Object]'` to `'6a51...fae'` — always false → 403 forbidden in `canViewTask`-style checks.

**Why:** Hit on 2026-07-11 with task module — 梓潼校长创建任务后跳转详情, `canViewTask` 用 `String(task.creator)` 比 creator, populate 后永远不等, 即便他是 creator 也被 403 "无权查看该任务".

**How to apply:**
- Service 里做 `task.creator === actor.userId` / `task.assignees[].user === actor.userId` 这类身份比对, **必须先判断是否 populate 过的对象**, 用 helper 兼容两种形态:
  ```js
  function refId(v) {
    if (v == null) return ''
    if (typeof v === 'object') return String(v._id || v.id || '')
    return String(v)
  }
  ```
- `canViewTask` / `canEditTask` 等可见性函数统一用 `refId(...)`, 不要再用 `String(...)` 直转对象
- review/update/cancel/toggleItem 等用 `Task.findOne()` **未 populate** 的, `String(...)` 是安全的; 但若以后加了 populate, 也会触发同样 bug, 建议全部用 `refId` 统一
- 同类 bug 在任何「populate 后做身份比对」的 service 都会触发, 排查时优先看这条