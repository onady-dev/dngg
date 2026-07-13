# Node.js 기반 이미지 사용
FROM node:20

# pnpm 설치
RUN npm install -g pnpm

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 pnpm-lock.yaml 복사
COPY package.json pnpm-lock.yaml ./

# 의존성 설치
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY . .

# 빌드
RUN pnpm run build

# 프로덕션 서버 실행
CMD ["pnpm", "run", "start"]

# 포트 노출
EXPOSE 3000 