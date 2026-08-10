#!/usr/bin/env bash
# S3의 덤프를 지정한 Postgres로 복원한다. 복구 리허설과 실제 복구에 함께 쓴다.
# 사용법: restore-db.sh <s3-키> <대상 컨테이너> <DB 사용자> <DB 이름> <비밀번호>
set -euo pipefail

KEY="${1:?복원할 S3 키를 지정하라 (예: db/dngg-20260810-040000.sql.gz)}"
CONTAINER="${2:?대상 컨테이너명}"
DB_USER="${3:?DB 사용자}"
DB_NAME="${4:?DB 이름}"
DB_PASS="${5:?DB 비밀번호}"
BUCKET="${DNGG_BACKUP_BUCKET:-dngg-backup-691967102238}"
REGION="${AWS_REGION:-ap-northeast-2}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

aws s3 cp "s3://${BUCKET}/${KEY}" "${TMP}/dump.sql.gz" --region "${REGION}"
gunzip -c "${TMP}/dump.sql.gz" \
  | docker exec -i -e PGPASSWORD="${DB_PASS}" "${CONTAINER}" \
      psql -U "${DB_USER}" -d "${DB_NAME}"

echo "복원 완료: ${KEY} → ${CONTAINER}/${DB_NAME}"
