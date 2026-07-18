# CI sha 태그 배포 전환 설계

- 날짜: 2026-07-18
- 상태: 사용자 승인됨
- 배경: 2026-07-18 혼합 배포 장애 (신규 프론트 + 구형 백엔드, 가입 404 약 1시간)

## 문제

`.github/workflows/deploy.yml`의 backend/frontend 빌드 잡은 독립적이라 한쪽만 성공해도 Docker Hub의 `:latest`가 부분 갱신된다. 이후 deploy 잡만 실행되는 커밋(compose/워크플로 변경)이 `docker compose pull`을 하면 드리프트된 `:latest` 조합 — 즉 함께 검증된 적 없는 신구 버전 혼합 — 이 배포될 수 있다.

## 결정

deploy 잡이 `:latest` 대신 **커밋 sha 태그를 서버 `.env`에 영속 핀**하여 배포한다.

- 이번 워크플로 런에서 **backend 잡이 성공한 경우에만** 서버 `/usr/local/project/dngg/.env`의 `BACKEND_VERSION`을 `sha-<github.sha>`로 upsert(있으면 교체, 없으면 append; root 소유 파일이므로 `sudo`). frontend 동일.
- 빌드가 스킵된(변경 없는) 서비스는 핀을 건드리지 않는다 → 직전 배포 sha가 그대로 유지된다.
- 이후 기존 스텝(`docker compose pull` → `up -d` → 헬스체크)은 변경 없음 — pull이 핀된 sha 태그를 받는다.
- compose 파일 변경 없음 (`${FRONTEND_VERSION:-latest}` / `${BACKEND_VERSION:-latest}` 구조 그대로).
- 빌드 잡의 `:latest` 태그 푸시는 유지한다 (비상용 레거시 경로·로컬 편의용, 배포 경로에서는 미사용).

## 기각한 대안

- **up 시점에만 환경변수로 sha 주입(비영속)**: 이후 서버에서 수동 `docker compose up -d` 시 `:latest`로 되돌아가는 드리프트가 남음.
- **이미지 푸시를 deploy 단계로 이동**: 두 잡 모두 성공해야 `:latest` 푸시. 구조 변경이 크고, `:latest` 의존이 남음.

## 운영상 함의

1. **롤백 절차 의미 변화**: 기존에는 `.env` 핀이 "CI가 못 건드리는 고정"이었으나, 이제 해당 서비스가 재빌드되는 배포에서 CI가 핀을 덮어쓴다. 지속적 롤백은 문제 커밋 revert 후 재배포가 정석.
2. **handoff 릴리스 절차 단순화**: "프론트 핀을 latest로 복원" 단계가 불필요 — workflow_dispatch 릴리스가 두 서비스 핀을 새 sha로 직접 덮어쓴다.
3. **이 변경 자체의 첫 배포는 no-op**: `deploy.yml`만 바뀌므로 deploy-config 필터에 걸려 deploy 잡만 실행되고, 빌드 잡 스킵 → 핀 갱신 없음 → 현재 버전 조합을 그대로 pull/up.

## 에러 처리

- 한쪽 빌드 잡 실패 시: 기존 조건(`needs.*.result != 'failure'`)대로 deploy 잡 전체가 스킵 → 부분 배포 없음. 레지스트리에 sha 이미지는 남지만 배포에 영향 없음.
- `.env`에 해당 변수 줄이 없는 경우: upsert 스크립트가 append로 처리.

## 검증

- 푸시 전: actionlint(가능 시) + 스크립트 셸 문법 검토.
- 푸시 후(1차, no-op 배포): Actions 로그에서 핀 갱신 스텝 스킵 확인, 서버 `.env` 불변 확인, 헬스체크 green.
- 릴리스 시(2차, workflow_dispatch): 서버 `.env` 두 핀이 동일 sha로 갱신되고 `docker compose ps`의 이미지 태그가 일치하는지 확인.
