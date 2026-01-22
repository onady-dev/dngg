#!/bin/bash

echo "🔧 로드밸런서 AZ 최적화 중..."

# 현재 4개 AZ → 2개 AZ로 변경하여 Public IP 2개 절약
aws elbv2 set-subnets \
  --load-balancer-arn arn:aws:elasticloadbalancing:ap-northeast-2:691967102238:loadbalancer/app/dngg/97a3e58ccf3722be \
  --subnets subnet-00dcad5f589eab0c8 subnet-056f684ff283e3163 \
  --region ap-northeast-2

echo "✅ 로드밸런서 최적화 완료!"
echo "💰 월 $7.30 절약 예상 (Public IP 2개 제거)"
