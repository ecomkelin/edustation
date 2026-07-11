#!/usr/bin/env bash
# EduStation 备份脚本 — MongoDB + uploads
#
# 用法：./backup.sh [keep_days=7]
# 加入 crontab: 0 3 * * * /home/deploy/scripts/backup.sh 14 >> /home/deploy/logs/backup.log 2>&1
#
# 输出：
#   /backup/mongo/YYYY-MM-DD_HHMM/      ← mongodump 原始数据
#   /backup/uploads/YYYY-MM-DD_HHMM/    ← uploads 目录镜像
#   /backup/edustation_YYYY-MM-DD_HHMM.tar.gz   ← 打包归档（便于迁移/上传OSS）
#
# 注意：
#   1. MONGODB_URI 必须有管理员权限（authSource=admin）
#   2. 跑这个脚本的用户必须有 mongodb / uploads /backup 的读写权限
#   3. 大于 keep_days 的备份会被自动清理
#   4. OSS 同步（可选）需要预装 ossutil 并配置 ossutil config

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

log() { echo "[$(date +%T)] $*"; }

log "backup start → ${DATE}"

# 1. MongoDB 全量 dump（gzip 压缩，每 collection 一文件）
mongodump --uri="${MONGODB_URI}" --out="${MONGO_DIR}" --gzip
log "mongo dump done: $(du -sh "${MONGO_DIR}" | awk '{print $1}')"

# 2. uploads 镜像（先 dry-run 不靠谱, 直接 rsync; --delete 保证清理被删的文件)
rsync -a --delete "${UPLOAD_SRC}/" "${UPLOAD_BACKUP_DIR}/"
log "uploads synced: $(du -sh "${UPLOAD_BACKUP_DIR}" | awk '{print $1}')"

# 3. 打包当日（便于下载 / 上传 OSS）
TARBALL="${BACKUP_ROOT}/edustation_${DATE}.tar.gz"
tar -czf "${TARBALL}" -C "${BACKUP_ROOT}" "mongo/${DATE}" "uploads/${DATE}"
log "tarball: ${TARBALL} ($(du -sh "${TARBALL}" | awk '{print $1}'))"

# 4. 清理过期
find "${BACKUP_ROOT}/mongo" -maxdepth 1 -type d -mtime +${KEEP_DAYS} -exec rm -rf {} \;
find "${BACKUP_ROOT}/uploads" -maxdepth 1 -type d -mtime +${KEEP_DAYS} -exec rm -rf {} \;
find "${BACKUP_ROOT}" -maxdepth 1 -name "edustation_*.tar.gz" -mtime +${KEEP_DAYS} -delete

log "cleanup done (keep ${KEEP_DAYS}d). backup finished."

# ---------- 可选：上传到 OSS ----------
# 解开下面注释（需先装 ossutil 并 ossutil config 配置 AccessKey）：
# if command -v ossutil &> /dev/null; then
#   ossutil cp "${TARBALL}" "oss://your-backup-bucket/edustation/${DATE}.tar.gz" --force
#   log "oss upload done"
# else
#   log "ossutil not installed, skip OSS upload"
# fi