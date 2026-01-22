#!/bin/bash

echo "🚀 dngg 서비스 시작 중..."

# EC2 인스턴스 시작
echo "EC2 인스턴스 시작..."
aws ec2 start-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2

# 인스턴스가 실행될 때까지 대기
echo "인스턴스 시작 대기 중..."
aws ec2 wait instance-running --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2

echo "✅ dngg 서비스가 시작되었습니다!"
echo "🌐 접속 URL: http://dngg-1671377533.ap-northeast-2.elb.amazonaws.com"
