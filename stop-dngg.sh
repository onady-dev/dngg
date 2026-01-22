#!/bin/bash

echo "⏹️ dngg 서비스 중지 중..."

# EC2 인스턴스 중지
echo "EC2 인스턴스 중지..."
aws ec2 stop-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2

# 인스턴스가 중지될 때까지 대기
echo "인스턴스 중지 대기 중..."
aws ec2 wait instance-stopped --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2

echo "✅ dngg 서비스가 중지되었습니다!"
echo "💰 비용 절약 모드 활성화"
