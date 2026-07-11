#!/usr/bin/env bash
# EduStation 恢复脚本 — 从 backup.sh 产生的 tarball 还原
#
# 用法：./restore.sh /path/to/edustation_2026-07-11_0300.tar.gz
#
# ⚠️ 这个脚本是破坏性的：--drop 会先删除 collection 再 restore
# 建议在另一台服务器 / 另一个 MongoDB 上验证后再回切

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "用法: $0 <tarball-path>"
  echo "示例: $0 /backup/edustation_2026-07-11_0300.tar.gz"
  exit 1
fi

TARBALL="$1"
MONGODB_URI="${MONGODB_URI:-mongodb://admin:CHANGE_ME@127.0.0.1:27017/edustation?authSource=admin}"
UPLOAD_DST="/home/deploy/edustation/uploads"
RESTORE_DIR="/tmp/edustation-restore-$$"

log() { echo "[$(date +%T)] $*"; }

if [ ! -f "${TARBALL}" ]; then
  echo "tarball not found: ${TARBALL}"
  exit 1
fi

log "restore from ${TARBALL}"

# 1. 解压到临时目录
mkdir -p "${RESTORE_DIR}"
tar -xzf "${TARBALL}" -C "${RESTORE_DIR}"
log "extracted to ${RESTORE_DIR}"

# 2. 还原 MongoDB
MONGO_SRC=$(find "${RESTORE_DIR}" -maxdepth 2 -type d -name "mongo" | head -1)
if [ -z "${MONGO_SRC}" ]; then
  echo "no mongo dir in tarball"
  exit 1
fi
# 取 mongo 下的第一个子目录（dump 后的 db 名）
DB_DIR=$(find "${MONGO_SRC}" -maxdepth 1 -mindepth 1 -type d | head -1)
if [ -z "${DB_DIR}" ]; then
  echo "no db dir in ${MONGO_SRC}"
  exit 1
fi

log "mongorestore: ${DB_DIR} → ${MONGODB_URI}"
mongorestore --uri="${MONGODB_URI}" --gzip --drop "${DB_DIR}"
log "mongo restore done"

# 3. 还原 uploads
UPLOAD_SRC=$(find "${RESTORE_DIR}" -maxdepth 2 -type d -name "uploads" | head -1)
if [ -n "${UPLOAD_SRC}" ] && [ -d "${UPLOAD_SRC}" ]; then
  mkdir -p "${UPLOAD_DST}"
  rsync -a --delete "${UPLOAD_SRC}/" "${UPLOAD_DST}/"
  log "uploads restored: $(du -sh ${UPLOAD_DST} | awk '{print $1}')"
else
  log "no uploads dir, skip"
fi

# 4. 重启 API
pm2 restart edustation-api
log "API restarted"

# 5. 清理临时目录
rm -rf "${RESTORE_DIR}"
log "restore done. 建议立刻访问 https://admin.yourdomain.com 验证。"