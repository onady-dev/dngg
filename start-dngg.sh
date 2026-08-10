#!/bin/bash
# dngg 운영 인스턴스를 시작한다.
#
# 트래픽 경로: dngg.one → EIP 3.34.242.163 → EC2 → 호스트 nginx → 컨테이너
# 로드밸런서는 없다. EIP가 붙어 있어 정지/시작해도 IP는 바뀌지 않는다.
set -euo pipefail

INSTANCE_ID=i-0bb00c849769dcb7e
REGION=ap-northeast-2

echo "🚀 dngg 서비스 시작 중..."

aws ec2 start-instances --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --query 'StartingInstances[].CurrentState.Name' --output text

echo "인스턴스 시작 대기 중..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

# docker·nginx는 부팅 시 자동 시작되도록 등록되어 있다(2026-08-10 리허설에서 누락 발견
# 후 조치). 컨테이너는 restart:always로 따라 올라온다. 다만 직전에
# `docker compose stop`으로 명시적으로 내렸다면 자동 복구되지 않으므로 직접 올려야 한다.
echo "서비스 응답 대기 중..."
for i in $(seq 1 30); do
  if curl -sf -m 5 https://dngg.one/api/health/ready >/dev/null 2>&1; then
    echo "✅ dngg 서비스가 시작되었습니다!"
    echo "🌐 https://dngg.one"
    exit 0
  fi
  sleep 10
done

echo "⚠️ 5분 안에 헬스체크가 통과하지 않았습니다. 확인해 보세요:"
echo "   ssh dngg 'systemctl is-active docker nginx; docker ps'"
echo "   ssh dngg 'cd /usr/local/project/dngg && sudo docker compose up -d'"
exit 1
