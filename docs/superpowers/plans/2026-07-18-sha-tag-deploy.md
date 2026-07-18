# CI sha 태그 배포 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deploy 잡이 `:latest` 드리프트 대신, 이번 런에서 빌드 성공한 서비스만 커밋 sha 태그로 서버 `.env`에 핀 고정해 배포하게 한다.

**Architecture:** 빌드 잡(`:sha-<커밋>` 태그 푸시)과 compose(`${*_VERSION:-latest}`)는 그대로 두고, deploy 잡에 "핀 upsert" 스텝 하나를 추가한다. 빌드가 스킵된 서비스는 `.env`의 기존 핀(직전 배포 sha)을 유지한다.

**Tech Stack:** GitHub Actions (dorny/paths-filter, appleboy/ssh-action), docker compose, 서버 `.env`(root 소유, sudo 필요).

**Spec:** `docs/superpowers/specs/2026-07-18-sha-tag-deploy-design.md`

## Global Constraints

- **main 푸시 = 운영 배포.** 푸시는 반드시 사용자 확인 후에만 한다.
- 서버 `.env`는 `/usr/local/project/dngg/.env`, root 소유 → 모든 읽기/쓰기에 `sudo`.
- `docker-compose.yaml`은 수정하지 않는다.
- 빌드 잡의 `:latest` 푸시는 유지한다 (비상용 레거시 경로).
- GitHub Actions 워크플로는 로컬에서 실행 검증이 불가 — YAML 파스 검사 + 내장 셸 스크립트 `bash -n` 문법 검사로 대신하고, 실제 검증은 푸시 후 no-op 배포 런에서 한다.

---

### Task 1: deploy 잡에 sha 핀 upsert 스텝 추가 + 문서 동기화

**Files:**
- Modify: `.github/workflows/deploy.yml` (deploy 잡, "Sync docker-compose.yaml to server" 스텝과 "Pull images and restart services" 스텝 사이)
- Modify: `CLAUDE.md` ("배포 — CI/CD" 섹션의 롤백/버전 고정 설명)

**Interfaces:**
- Consumes: 기존 `needs.backend.result` / `needs.frontend.result` (deploy 잡의 `needs: [changes, backend, frontend]`에서 제공), `github.sha`, 시크릿 `EC2_HOST`/`EC2_USER`/`EC2_SSH_KEY`, `env.DEPLOY_PATH`.
- Produces: 서버 `.env`의 `BACKEND_VERSION`/`FRONTEND_VERSION`이 빌드 성공 서비스에 한해 `sha-<커밋>`으로 갱신됨. 기존 pull/up 스텝이 이를 그대로 소비.

- [ ] **Step 1: deploy.yml에 핀 스텝 추가**

`Sync docker-compose.yaml to server` 스텝 바로 다음, `Pull images and restart services` 스텝 바로 앞에 삽입:

```yaml
      # 이번 런에서 빌드 성공한 서비스만 커밋 sha 태그로 핀 고정한다.
      # :latest 드리프트로 인한 신구 버전 혼합 배포(2026-07-18 장애)를 방지 —
      # 빌드가 스킵된 서비스는 .env의 직전 배포 sha를 그대로 유지한다.
      - name: Pin built services to this commit's image tag
        if: needs.backend.result == 'success' || needs.frontend.result == 'success'
        uses: appleboy/ssh-action@v1.2.0
        env:
          BACKEND_BUILT: ${{ needs.backend.result == 'success' }}
          FRONTEND_BUILT: ${{ needs.frontend.result == 'success' }}
          SHA_TAG: sha-${{ github.sha }}
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: BACKEND_BUILT,FRONTEND_BUILT,SHA_TAG
          script: |
            set -e
            cd ${{ env.DEPLOY_PATH }}
            pin() {
              if sudo grep -q "^$1=" .env; then
                sudo sed -i "s|^$1=.*|$1=$2|" .env
              else
                echo "$1=$2" | sudo tee -a .env > /dev/null
              fi
              echo "pinned $1=$2"
            }
            if [ "$BACKEND_BUILT" = "true" ]; then pin BACKEND_VERSION "$SHA_TAG"; fi
            if [ "$FRONTEND_BUILT" = "true" ]; then pin FRONTEND_VERSION "$SHA_TAG"; fi
```

- [ ] **Step 2: CLAUDE.md 롤백/버전 고정 설명 갱신**

"배포 — CI/CD" 섹션의 해당 불릿을 다음으로 교체:

기존:
```
- 롤백/버전 고정: 서버 `/usr/local/project/dngg/.env`의 `FRONTEND_VERSION`/`BACKEND_VERSION`을 `sha-<커밋>`으로 바꾸고 `docker compose up -d <서비스>`. 고정돼 있으면 CI deploy가 돌아도 그 서비스는 pull되지 않는다. **릴리스 전에 `latest`로 복원할 것.**
```

신규:
```
- 배포는 sha 태그 핀 방식: deploy 잡이 이번 런에서 빌드 성공한 서비스만 서버 `.env`의 `FRONTEND_VERSION`/`BACKEND_VERSION`을 `sha-<커밋>`으로 갱신한다 (빌드 스킵된 서비스는 직전 배포 sha 유지 — `:latest`는 배포 경로에서 사용하지 않음).
- 롤백: 서버 `.env`의 해당 `*_VERSION`을 이전 `sha-<커밋>`으로 바꾸고 `docker compose up -d <서비스>`. 단, 그 서비스가 재빌드되는 다음 CI 배포가 핀을 덮어쓰므로, 지속적 롤백은 문제 커밋을 revert해 새로 배포하는 방식으로 한다.
```

그리고 같은 섹션 주의 불릿의 혼합 배포 문구 끝에 다음 문장을 덧붙인다: `(sha 핀 배포 전환 이후에는 deploy만 도는 커밋이 :latest를 집어오는 경로 자체가 제거됨)`

- [ ] **Step 3: YAML 파스 + 내장 스크립트 문법 검증**

```bash
ruby -ryaml -e 'YAML.load_file(".github/workflows/deploy.yml"); puts "yaml OK"'
```
Expected: `yaml OK`

핀 스크립트 문법 검사 (스크래치패드에 추출해 bash -n):
```bash
cat > /tmp/scratchpad-pin-check.sh <<'EOF'
set -e
cd /usr/local/project/dngg
pin() {
  if sudo grep -q "^$1=" .env; then
    sudo sed -i "s|^$1=.*|$1=$2|" .env
  else
    echo "$1=$2" | sudo tee -a .env > /dev/null
  fi
  echo "pinned $1=$2"
}
if [ "$BACKEND_BUILT" = "true" ]; then pin BACKEND_VERSION "$SHA_TAG"; fi
if [ "$FRONTEND_BUILT" = "true" ]; then pin FRONTEND_VERSION "$SHA_TAG"; fi
EOF
bash -n /tmp/scratchpad-pin-check.sh && echo "script OK"
```
Expected: `script OK`

(추가로 pin 함수 동작을 로컬 임시 .env로 시뮬레이션: 기존 키 교체·없는 키 append 두 케이스 확인 — sudo 제거판으로 실행)

- [ ] **Step 4: 커밋 (푸시 아님)**

```bash
git add .github/workflows/deploy.yml CLAUDE.md
git commit -m "ci: 배포를 :latest 대신 커밋 sha 태그 핀 방식으로 전환

빌드 성공한 서비스만 서버 .env의 *_VERSION을 sha-<커밋>으로 갱신해
:latest 드리프트로 인한 신구 버전 혼합 배포(2026-07-18 장애)를 차단.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: 푸시(사용자 확인 게이트) 및 no-op 배포 검증

**Files:** 없음 (검증만)

**Interfaces:**
- Consumes: Task 1의 커밋, GitHub Actions "Deploy" 워크플로.
- Produces: 검증된 sha 핀 배포 파이프라인. handoff 릴리스 절차에서 "핀 latest 복원" 단계 제거 근거.

- [ ] **Step 1: 사용자에게 푸시 확인** — main 푸시 = 운영 배포(이번엔 no-op 재배포)임을 명시하고 승인받는다. 승인 전 진행 금지.

- [ ] **Step 2: 푸시 후 Actions 런 관찰**

```bash
git push origin main
```
이후 Actions "Deploy" 런에서 확인 (gh CLI 없음 → API 또는 사용자 확인):
- changes 잡: deploy-config=true, backend/frontend=false
- backend/frontend 잡: skipped
- deploy 잡: "Pin built services..." 스텝 **skipped** (조건 불충족)
- Health check: green

- [ ] **Step 3: 서버 상태 불변 확인**

```bash
ssh dngg 'sudo grep -E "^(FRONTEND|BACKEND)_VERSION" /usr/local/project/dngg/.env; docker compose -f /usr/local/project/dngg/docker-compose.yaml ps --format "{{.Service}} {{.Image}}" 2>/dev/null || sudo docker ps --format "{{.Names}} {{.Image}}"'
```
Expected: `FRONTEND_VERSION=sha-bc97e69…` 유지, `BACKEND_VERSION=latest` 유지, 컨테이너 이미지 변화 없음.

- [ ] **Step 4: 메모리 갱신** — `dngg-cicd-deploy` 메모리에 sha 핀 배포 전환·새 롤백 절차·handoff 2번 단계 불필요를 기록.
