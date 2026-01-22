#!/bin/bash

echo "🛑 dngg 서비스 완전 중지 중..."

# 1. EC2 인스턴스 중지
echo "EC2 인스턴스 중지..."
aws ec2 stop-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2

# 2. 로드 밸런서 삭제 (가장 큰 비용 요소)
echo "로드 밸런서 삭제..."
aws elbv2 delete-load-balancer --load-balancer-arn arn:aws:elasticloadbalancing:ap-northeast-2:691967102238:loadbalancer/app/dngg/97a3e58ccf3722be --region ap-northeast-2

echo "⚠️  주의: 로드 밸런서가 삭제되었습니다. 재시작 시 새로운 DNS 주소가 생성됩니다."
echo "✅ 완전 중지 완료 - 최대 비용 절약!"
