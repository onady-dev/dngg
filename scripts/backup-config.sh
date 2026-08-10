#!/usr/bin/env bash
# nginx 설정·환경변수·compose를 묶어 S3에 올린다. 주 1회 실행.
# .env에는 시크릿이 들어 있으므로 저장소가 아니라 암호화된 S3에만 둔다.
set -euo pipefail

PROJECT_DIR="${DNGG_PROJECT_DIR:-/usr/local/project/dngg}"
BUCKET="${DNGG_BACKUP_BUCKET:-dngg-backup-691967102238}"
REGION="${AWS_REGION:-ap-northeast-2}"

STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGE="${TMP}/config"
mkdir -p "${STAGE}"

sudo cat /etc/nginx/nginx.conf > "${STAGE}/nginx.conf"
cp "${PROJECT_DIR}/.env" "${STAGE}/env"
cp "${PROJECT_DIR}/docker-compose.yaml" "${STAGE}/docker-compose.yaml"
# 설치된 systemd 유닛도 함께 담는다 — 저장소의 infra/systemd/와 실제 설치본이
# 어긋났을 때 무엇이 돌고 있었는지가 복구의 단서가 된다.
sudo cp /etc/systemd/system/dngg-*.service /etc/systemd/system/dngg-*.timer "${STAGE}/" 2>/dev/null || true
sudo cp -r /etc/letsencrypt/renewal "${STAGE}/letsencrypt-renewal" 2>/dev/null || true

tar -czf "${TMP}/dngg-config-${STAMP}.tar.gz" -C "${TMP}" config

SIZE="$(stat -c%s "${TMP}/dngg-config-${STAMP}.tar.gz")"
if [ "${SIZE}" -lt 256 ]; then
  echo "설정 묶음이 비정상적으로 작다 (${SIZE} bytes) — 업로드를 중단한다" >&2
  exit 1
fi

aws s3 cp "${TMP}/dngg-config-${STAMP}.tar.gz" \
  "s3://${BUCKET}/config/dngg-config-${STAMP}.tar.gz" --region "${REGION}"
echo "설정 백업 완료: s3://${BUCKET}/config/dngg-config-${STAMP}.tar.gz (${SIZE} bytes)"
