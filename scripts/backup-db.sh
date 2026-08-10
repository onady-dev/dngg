#!/usr/bin/env bash
# 운영 DB를 pg_dump로 받아 gzip 후 S3에 올린다. cron에서 매일 1회 실행.
set -euo pipefail

PROJECT_DIR="${DNGG_PROJECT_DIR:-/usr/local/project/dngg}"
BUCKET="${DNGG_BACKUP_BUCKET:-dngg-backup-691967102238}"
REGION="${AWS_REGION:-ap-northeast-2}"

# DB_USERNAME/DB_PASSWORD/DB_DATABASE를 서버 .env에서 읽는다.
set -a
# shellcheck disable=SC1091
. "${PROJECT_DIR}/.env"
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DUMP="${TMP}/dngg-${STAMP}.sql.gz"

docker exec -e PGPASSWORD="${DB_PASSWORD}" postgres \
  pg_dump -U "${DB_USERNAME}" -d "${DB_DATABASE}" \
    --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "${DUMP}"

# pg_dump가 실패해도 파이프라인 뒤쪽 gzip은 성공하므로, 빈 덤프가 조용히
# 올라가는 것을 크기로 한 번 더 막는다.
SIZE="$(stat -c%s "${DUMP}")"
if [ "${SIZE}" -lt 1024 ]; then
  echo "덤프가 비정상적으로 작다 (${SIZE} bytes) — 업로드를 중단한다" >&2
  exit 1
fi

aws s3 cp "${DUMP}" "s3://${BUCKET}/db/dngg-${STAMP}.sql.gz" --region "${REGION}"
echo "백업 완료: s3://${BUCKET}/db/dngg-${STAMP}.sql.gz (${SIZE} bytes)"
