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

# NEXT_PUBLIC_* 값은 빌드 시점에 번들에 박히므로 build-arg로 주입받는다.
# (CI에는 .env.production이 없으므로 이 값이 유일한 소스다)
ARG NEXT_PUBLIC_API_URL=https://dngg.one/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# 토스 클라이언트 키도 빌드 시점에 번들에 박힌다 — 값 변경 시 프론트 이미지 재빌드 필요.
ARG NEXT_PUBLIC_TOSS_CLIENT_KEY
ENV NEXT_PUBLIC_TOSS_CLIENT_KEY=$NEXT_PUBLIC_TOSS_CLIENT_KEY
# GA4 측정 ID도 빌드 시점에 박힌다. 값이 비면 계측 스크립트가 아예 주입되지 않으므로
# 운영 계측이 조용히 꺼진다 — repo variable 등록을 먼저 하고 프론트를 재빌드할 것.
ARG NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID

# 빌드
RUN pnpm run build

# 프로덕션 서버 실행
CMD ["pnpm", "run", "start"]

# 포트 노출
EXPOSE 3000 