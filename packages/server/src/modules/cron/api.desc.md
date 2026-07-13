# Cron ops (2026-07-13 立项, MM=41)

URL 前缀: `/admin/cron` (与 `/admin/pet` `/admin/points` 等管理端点保持一致)

> 该模块无业务逻辑, 只暴露 `setInterval` 定时任务的运行时状态。  
> 用途: 排查 cron 是否在跑 / 是否报错 / 多副本场景识别哪台没启动 cron。

## 接口

| 编号 | Method | Path | 鉴权 | 备注 |
|---|---|---|---|---|
| R-4101 | GET | `/admin/cron/status` | 平台超管 | 所有 cron 实时状态 + 全局视图 (replicas + cronLocks) |
| R-4102 | POST | `/admin/cron/:name/tick` | 平台超管 | 手动 trigger 单个 cron (绕过 leader 锁, 用于调试) |

### R-4101 GET /admin/cron/status

**响应**:
```json
{
  "success": true,
  "data": {
    "pid": 12345,
    "bootTime": "2026-07-13T08:00:00.000Z",
    "uptimeSec": 3602,
    "nodeEnv": "development",
    "cronCount": 6,
    "crons": [
      {
        "name": "taskCron",
        "intervalMs": 60000,
        "intervalHuman": "1min",
        "lastRunAt": "2026-07-13T08:59:50.123Z",
        "lastDurationMs": 47,
        "lastError": null,
        "totalTicks": 3597,
        "totalSkipped": 0,
        "totalErrors": 0,
        "totalManualTicks": 2,
        "leaderElect": true,
        "hasManualTickFn": true,
        "registeredAt": "2026-07-13T08:00:00.000Z",
        "secondsSinceLastRun": 12
      }
    ],
    "replicas": [
      {
        "pid": 12345,
        "hostname": "node-1",
        "nodeEnv": "development",
        "startedAt": "2026-07-13T08:00:00.000Z",
        "lastHeartbeatAt": "2026-07-13T08:59:50.123Z",
        "secondsSinceHeartbeat": 12,
        "isSelf": true
      }
    ],
    "cronLocks": [
      {
        "name": "taskCron",
        "owner": 12345,
        "acquiredAt": "2026-07-13T08:59:50.000Z",
        "expiresAt": "2026-07-13T08:59:55.000Z",
        "isSelf": true,
        "expiresInSec": 25
      }
    ]
  }
}
```

**字段说明**:
- `pid` / `bootTime` / `uptimeSec` — 当前请求命中的副本
- `crons[].intervalHuman` — 人类可读周期 (60s / 5min / 12h)
- `crons[].secondsSinceLastRun` — 距上次 tick 多少秒, **超 interval*3 视为 cron 停了**
- `crons[].totalSkipped` — leader 锁被其他副本抢走次数
- `crons[].totalManualTicks` — R-4102 手动触发次数
- `crons[].leaderElect` — 是否启用分布式锁 (多副本场景)
- `replicas[]` — 所有活着的副本 (mongo TTL 2min 自动过滤僵尸)
  - `secondsSinceHeartbeat < 30` 算健康
  - `isSelf=true` 标记当前副本
- `cronLocks[]` — 当前持有 leader 锁的副本
  - `expiresInSec < 0` 表示锁已过期 (其他副本下次 tick 会抢走)
  - `isSelf=true` 标记本副本持有

### R-4102 POST /admin/cron/:name/tick

**路径参数**:
- `name` — cron 名, 必须是已 register 的: `taskCron` / `archiveCron` / `notificationCron` / `petCron` / `loginRateLimitSweep` / `captchaSweep`

**行为**:
- 手动跑一次该 cron 的 tickAll (绕过 leader 锁, **总能跑**)
- 多副本场景: 只在当前请求命中的副本上跑
- **进程内互斥** (2026-07-13): 同一进程内同时只允许 1 个手动 tick 跑该 cron, 并发请求返 409
- 不写 audit (ops 动作, 不是业务操作)
- 计数加在 `totalManualTicks`, 耗时记在 `lastDurationMs`

**响应 (成功)**:
```json
{
  "success": true,
  "data": {
    "name": "taskCron",
    "durationMs": 142,
    "result": { "expired": 0, "generated": 0, "notified": 3, "errors": 0 },
    "triggeredBy": "platformAdmin:6a2fb342aa8152333e4de513"
  }
}
```

**响应 (409 — 进程内有其他手动 tick 在跑)**:
```json
{
  "success": false,
  "code": 409,
  "message": "cron \"taskCron\" is already running (started 3s ago by platformAdmin:6a2fb342...)",
  "data": {
    "conflict": { "startedAt": "...", "by": "platformAdmin:...", "secondsAgo": 3 }
  }
}
```

**响应 (404 — cron 不存在或没注册 tickFn)**:
```json
{
  "success": false,
  "code": 404,
  "message": "cron \"xxx\" not found",
  "data": { "durationMs": 0 }
}
```

**典型用法**:
```bash
TOKEN=$(curl -s -X POST .../auth/login ... | jq -r .data.accessToken)
curl -X POST .../admin/cron/taskCron/tick \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-org-id: $ORG_ID"
```

## 日志格式 (配套)

```
pid=12345 uptime=+3602s [archiveCron] tick: task=5 attendance=1
pid=12345 uptime=+3602s [taskCron] fail where=expireOverdue: ENOENT: ...
```

格式: `pid=<pid> uptime=+<sec>s [<name>] <action> <key>=<val> ...`

## 设计取舍

- **replica_status 用 mongo TTL** (不用 redis): 单依赖, 启动即可
- **心跳 30s 一次**: 比 cron tick 频率高, 排查僵尸用; 2min TTL 容错 4 次失败
- **leader lock TTL 30s**: tick 几秒内完成; 超 30s 自动让出, 不会卡死
- **手动 tick 绕过 leader 锁**: admin 显式触发必须能跑 (否则 leader 卡住时没法救)
- **不写 audit**: 查 ops 状态 / 手动 trigger 都不算业务操作, 污染 audit log
- **未来 K8s 化**: replicas[] + cronLocks[] 就是天然的多副本视图, 不用另起服务