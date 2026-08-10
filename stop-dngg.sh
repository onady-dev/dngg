#!/bin/bash
# dngg 운영 인스턴스를 정지한다 (비용 절약용).
#
# EIP는 인스턴스에 계속 할당되어 있으므로 다시 시작해도 IP는 그대로다.
# 데이터는 EBS 볼륨에 남는다.
set -euo pipefail

INSTANCE_ID=i-0bb00c849769dcb7e
REGION=ap-northeast-2

echo "⏹️ dngg 서비스 중지 중..."

# 정지 전 백업을 한 번 떠 둔다. 인스턴스가 꺼져 있으면 예약 백업도 돌지 않는다.
if ssh -o ConnectTimeout=10 -o BatchMode=yes dngg 'sudo systemctl start dngg-backup-db.service' 2>/dev/null; then
  echo "  백업 완료"
else
  echo "  ⚠️ 백업을 뜨지 못했습니다 (SSH 실패). 그대로 진행합니다."
fi

aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --query 'StoppingInstances[].CurrentState.Name' --output text

echo "인스턴스 중지 대기 중..."
aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID" --region "$REGION"

echo "✅ dngg 서비스가 중지되었습니다!"
echo "💰 비용 절약 모드 활성화 (EBS·EIP 요금은 계속 발생)"
