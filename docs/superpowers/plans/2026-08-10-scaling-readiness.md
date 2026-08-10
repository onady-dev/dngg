# 트래픽 스파이크 대비 (Scaling Readiness) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 트래픽이 실제로 늘기 전까지 비용을 늘리지 않으면서, 급증이 와도 서비스가 통째로 내려가지 않고 데이터를 잃지 않도록 완충·방어·관측·백업을 갖추고 확장 절차를 검증해둔다.

**Architecture:** 인프라 구조는 바꾸지 않는다(EIP → 호스트 nginx → 컨테이너 3개). 대신 (1) 절벽형 실패를 완만한 저하로 바꾸는 완충장치(swap, CPU 크레딧 `unlimited`), (2) nginx·보안그룹 단의 방어, (3) 헬스체크·알람 기반 관측, (4) pg_dump/스냅샷 백업을 추가하고, 용량 증설은 지표 트리거를 갖춘 레버(L1)로 **리허설까지만** 해둔다.

**Tech Stack:** NestJS 11 + TypeORM (backend), Docker Compose, nginx, AWS (EC2/EBS/DLM/S3/SNS/CloudWatch/Budgets), k6, Jest

**설계 문서:** `docs/superpowers/specs/2026-08-10-scaling-strategy-design.md`

## Global Constraints

모든 태스크의 요구사항에 아래가 암묵적으로 포함된다.

- **커밋 메시지 제목·본문은 한글**로 쓴다. conventional commit 타입 접두어(`feat:`, `fix:`, `docs:`, `chore:`)는 영문 그대로.
- **`main` 푸시 = 운영 배포.** `.github/workflows/deploy.yml`의 경로 필터: `backend/**` → backend 잡, `frontend/**` → frontend 잡, `docker-compose.yaml`·워크플로 변경 → deploy 잡. `docs/**`·`scripts/**`·`infra/**`·`loadtest/**`만 바뀐 커밋은 배포를 트리거하지 않는다.
- 작업 브랜치는 `feat/scaling-readiness`. 코드 태스크는 브랜치에 커밋만 하고, **배포는 Task 8에서 한 번에** 한다.
- **`docker compose down -v` 절대 금지** (Postgres 볼륨 삭제).
- **`pg-data/` 디렉토리를 직접 건드리지 말 것.**
- 전역 `ValidationPipe`가 `whitelist` + `forbidNonWhitelisted`로 동작한다 — 새 엔드포인트 필드는 반드시 DTO에 선언해야 한다.
- 백엔드 테스트는 `backend/` 안에서 `pnpm test` (jest, `rootDir: src`, `testRegex: .*\.spec\.ts$`). 단일 파일은 `pnpm test -- <경로>`.
- **`pnpm lint`는 `eslint --fix`라 저장소 전체를 수정한다.** 태스크와 무관한 파일이 바뀌므로 커밋 전 `git add`는 반드시 **경로를 명시**해서 한다.
- **서버에 cron이 없다** (Amazon Linux 2023, `cronie` 미설치 — `crontab` 명령도 `/etc/cron.d`도 없음). 예약 실행은 전부 **systemd 타이머**로 한다. 유닛 파일은 `infra/systemd/`에 버전 관리하고 `/etc/systemd/system/`에 설치한다. (Task 1 실행 중 확인 — 계획 초안의 `crontab` 지시는 이 규칙으로 대체됨)
- **서버의 `/usr/local/project/dngg`는 root 소유다.** 파일 배포는 `/tmp`로 `scp` 후 `sudo mv`로 설치한다 (`scp`로 직접 쓰면 Permission denied). `ssh dngg`의 `ec2-user`는 비밀번호 없는 sudo와 docker 그룹 권한을 가진다.

**고정 식별자 (모든 AWS 명령에서 사용):**

| 항목 | 값 |
|---|---|
| 리전 | `ap-northeast-2` |
| AWS 계정 | `691967102238` |
| EC2 인스턴스 | `i-0bb00c849769dcb7e` |
| EBS 볼륨 | `vol-090d42ef7023a685e` |
| 보안 그룹 | `sg-035e49b91ab5412e2` |
| EIP | `3.34.242.163` (`eipalloc-00be290ccda3d7421`) |
| SSH 별칭 | `ssh dngg` |
| 서버 프로젝트 경로 | `/usr/local/project/dngg` |
| S3 백업 버킷 (신규) | `dngg-backup-691967102238` |
| 알림 수신 이메일 | 계획에 `<이메일>`로 표기 — 실행 시작 시 한 번 확인해 모든 태스크에서 같은 값을 쓴다 |

---

## File Structure

**신규 생성**

| 파일 | 책임 |
|---|---|
| `scripts/backup-db.sh` | pg_dump → gzip → S3 업로드. 빈 덤프 가드 포함 |
| `scripts/restore-db.sh` | S3 덤프를 지정 DB로 복원 (리허설·실복구 공용) |
| `scripts/backup-config.sh` | nginx.conf·.env·compose를 tar.gz로 S3 업로드 |
| `scripts/monitor-resources.sh` | 5분마다 메모리/디스크/5xx/p95/429 확인 후 SNS 발행 |
| `infra/systemd/dngg-backup-db.{service,timer}` | DB 백업 예약 실행 (매일 04:10 KST) |
| `infra/systemd/dngg-backup-config.{service,timer}` | 설정 백업 예약 실행 (매주 일 04:30 KST) |
| `infra/systemd/dngg-monitor.{service,timer}` | 리소스 모니터링 예약 실행 (5분 간격) |
| `infra/nginx/nginx.conf` | 운영 nginx 설정의 **버전 관리본** (서버가 유일본이던 문제 해소) |
| `backend/src/common/env.ts` | 환경변수 파싱 헬퍼 — TypeORM 풀 상한과 로그인 한도가 공유한다 |
| `backend/src/common/env.spec.ts` | 위 테스트 |
| `backend/src/config/typeorm.options.ts` | TypeORM 옵션 생성 — 커넥션 풀 상한을 env로 조정 가능하게 |
| `backend/src/config/typeorm.options.spec.ts` | 위 테스트 |
| `backend/src/modules/health/health.controller.ts` | `/health`(liveness), `/health/ready`(DB 포함) |
| `backend/src/modules/health/health.controller.spec.ts` | 위 테스트 |
| `backend/src/modules/health/health.module.ts` | 헬스 모듈 |
| `loadtest/k6-read-paths.js` | 읽기 경로 부하 시나리오 |
| `docs/runbooks/backup-restore.md` | 백업·복구 런북 |
| `docs/runbooks/scaling.md` | L1~L3 확장 런북 + 부하 테스트 실측 결과 |

**수정**

| 파일 | 변경 |
|---|---|
| `backend/src/app.module.ts` | TypeORM 옵션을 `buildTypeOrmOptions()`로 교체, `HealthModule` 등록 |
| `backend/src/modules/user/login-throttler.guard.ts` | 전역 로그인 한도를 env로 조정 가능하게 |
| `backend/src/modules/user/login-throttler.guard.spec.ts` | 위 테스트 추가 |
| `backend/src/modules/user/user.module.ts` | `resolveSitewideLoginLimit(process.env)` 사용 |
| `docker-compose.yaml` | 죽은 `postgresql.conf` 마운트 제거, `DB_POOL_MAX`·`SITEWIDE_LOGIN_THROTTLE_LIMIT` 주입 |
| `.github/workflows/deploy.yml` | 헬스체크를 `/group/all` → `/health/ready`로 교체 |
| `start-dngg.sh` / `stop-dngg.sh` / `full-stop-dngg.sh` / `optimize-lb.sh` | 존재하지 않는 LB 참조 정리 |
| `CLAUDE.md` / `PROJECT_CONTEXT.md` | nginx 리버스 프록시 계층 보강 |

---

## Task 1: DB 백업 (pg_dump → S3) 과 복구 리허설

**Files:**
- Create: `scripts/backup-db.sh`
- Create: `scripts/restore-db.sh`
- Create: `docs/runbooks/backup-restore.md`

**Interfaces:**
- Produces: S3 버킷 `dngg-backup-691967102238`, 객체 경로 규약 `db/dngg-<YYYYmmdd-HHMMSS>.sql.gz`. Task 2·12가 같은 버킷을 사용한다.

**왜 먼저 하는가:** 이후 모든 태스크가 서버를 만진다. 되돌릴 수 있는 변경이라도 백업 없이 시작하면 안전망 없이 작업하는 셈이다.

- [ ] **Step 1: 작업 브랜치 생성**

```bash
cd /Users/onady/project/dngg
git switch main
git switch -c feat/scaling-readiness
```

- [ ] **Step 2: S3 버킷 생성 (퍼블릭 차단·버전관리·암호화·30일 수명주기)**

```bash
BUCKET=dngg-backup-691967102238
aws s3api create-bucket --bucket $BUCKET --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2

aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption --bucket $BUCKET \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-bucket-versioning --bucket $BUCKET --versioning-configuration Status=Enabled

aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration '{
  "Rules":[{"ID":"expire-old-backups","Status":"Enabled","Filter":{"Prefix":""},
            "Expiration":{"Days":30},
            "NoncurrentVersionExpiration":{"NoncurrentDays":7}}]}'
```

Expected: 각 명령이 에러 없이 끝난다. `aws s3api get-bucket-encryption --bucket $BUCKET`로 확인.

- [ ] **Step 3: EC2 인스턴스 프로파일에 S3·SNS 권한 부여**

먼저 현재 붙어 있는 역할 이름을 확인한다 (SES용으로 이미 하나 있다):

```bash
aws ec2 describe-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2 \
  --query 'Reservations[].Instances[].IamInstanceProfile.Arn' --output text
```

Expected: `arn:aws:iam::691967102238:instance-profile/<프로파일명>` 출력. 프로파일에 연결된 역할명을 얻는다:

```bash
aws iam get-instance-profile --instance-profile-name <프로파일명> \
  --query 'InstanceProfile.Roles[].RoleName' --output text
```

그 역할에 인라인 정책을 붙인다 (`<역할명>`을 위에서 얻은 값으로 치환):

```bash
aws iam put-role-policy --role-name <역할명> --policy-name dngg-backup-and-alerts \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[
      {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:ListBucket"],
       "Resource":["arn:aws:s3:::dngg-backup-691967102238","arn:aws:s3:::dngg-backup-691967102238/*"]},
      {"Effect":"Allow","Action":["sns:Publish"],"Resource":"*"}
    ]}'
```

> 인스턴스 프로파일이 아예 없다면 역할을 새로 만들어 연결해야 한다. 그 경우 `aws iam create-role`(신뢰 주체 `ec2.amazonaws.com`) → `create-instance-profile` → `add-role-to-instance-profile` → `aws ec2 associate-iam-instance-profile` 순서로 진행하고, 런북에 기록한다.

- [ ] **Step 4: 백업 스크립트 작성**

`scripts/backup-db.sh`:

```bash
#!/usr/bin/env bash
# 운영 DB를 pg_dump로 받아 gzip 후 S3에 올린다. cron에서 매일 1회 실행.
set -euo pipefail

PROJECT_DIR="${DNGG_PROJECT_DIR:-/usr/local/project/dngg}"
BUCKET="${DNGG_BACKUP_BUCKET:-dngg-backup-691967102238}"
REGION="${AWS_REGION:-ap-northeast-2}"

# DB_USERNAME/DB_PASSWORD/DB_DATABASE를 서버 .env에서 읽는다.
set -a
# shellcheck disable=SC1091
. "${PROJECT_DIR}/.env"
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DUMP="${TMP}/dngg-${STAMP}.sql.gz"

docker exec -e PGPASSWORD="${DB_PASSWORD}" postgres \
  pg_dump -U "${DB_USERNAME}" -d "${DB_DATABASE}" \
    --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "${DUMP}"

# pg_dump가 실패해도 파이프라인 뒤쪽 gzip은 성공하므로, 빈 덤프가 조용히
# 올라가는 것을 크기로 한 번 더 막는다.
SIZE="$(stat -c%s "${DUMP}")"
if [ "${SIZE}" -lt 1024 ]; then
  echo "덤프가 비정상적으로 작다 (${SIZE} bytes) — 업로드를 중단한다" >&2
  exit 1
fi

aws s3 cp "${DUMP}" "s3://${BUCKET}/db/dngg-${STAMP}.sql.gz" --region "${REGION}"
echo "백업 완료: s3://${BUCKET}/db/dngg-${STAMP}.sql.gz (${SIZE} bytes)"
```

`scripts/restore-db.sh`:

```bash
#!/usr/bin/env bash
# S3의 덤프를 지정한 Postgres로 복원한다. 복구 리허설과 실제 복구에 함께 쓴다.
# 사용법: restore-db.sh <s3-키> <대상 컨테이너> <DB 사용자> <DB 이름> <비밀번호>
set -euo pipefail

KEY="${1:?복원할 S3 키를 지정하라 (예: db/dngg-20260810-040000.sql.gz)}"
CONTAINER="${2:?대상 컨테이너명}"
DB_USER="${3:?DB 사용자}"
DB_NAME="${4:?DB 이름}"
DB_PASS="${5:?DB 비밀번호}"
BUCKET="${DNGG_BACKUP_BUCKET:-dngg-backup-691967102238}"
REGION="${AWS_REGION:-ap-northeast-2}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

aws s3 cp "s3://${BUCKET}/${KEY}" "${TMP}/dump.sql.gz" --region "${REGION}"
gunzip -c "${TMP}/dump.sql.gz" \
  | docker exec -i -e PGPASSWORD="${DB_PASS}" "${CONTAINER}" \
      psql -U "${DB_USER}" -d "${DB_NAME}"

echo "복원 완료: ${KEY} → ${CONTAINER}/${DB_NAME}"
```

- [ ] **Step 5: 실행 권한 부여 후 서버에 배포하고 수동 실행**

```bash
chmod +x scripts/backup-db.sh scripts/restore-db.sh
scp scripts/backup-db.sh scripts/restore-db.sh dngg:/usr/local/project/dngg/scripts/ \
  || ssh dngg 'mkdir -p /usr/local/project/dngg/scripts' && \
     scp scripts/backup-db.sh scripts/restore-db.sh dngg:/usr/local/project/dngg/scripts/
ssh dngg 'chmod +x /usr/local/project/dngg/scripts/*.sh && /usr/local/project/dngg/scripts/backup-db.sh'
```

Expected: `백업 완료: s3://dngg-backup-691967102238/db/dngg-<타임스탬프>.sql.gz (약 2000~5000 bytes)` 출력. DB가 7.4MB라 gzip 후 수 KB가 정상이다.

- [ ] **Step 6: 복구 리허설 — 로컬 컨테이너에 복원해 행 수 대조**

먼저 운영의 기준 행 수를 확보한다:

```bash
ssh dngg 'cd /usr/local/project/dngg && set -a && . ./.env && set +a && \
  docker exec -e PGPASSWORD="$DB_PASSWORD" postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -tAc \
  "select \"Game\", (select count(*) from \"game\") union all select \"Log\", (select count(*) from \"log\") union all select \"Player\", (select count(*) from \"player\")"'
```

로컬에 빈 Postgres를 띄우고 복원한다 (**운영 DB는 건드리지 않는다**):

```bash
cd /Users/onady/project/dngg
docker run -d --name dngg-restore-test -e POSTGRES_PASSWORD=test -e POSTGRES_USER=postgres -e POSTGRES_DB=dngg postgres:15
sleep 10
LATEST=$(aws s3 ls s3://dngg-backup-691967102238/db/ --region ap-northeast-2 | sort | tail -1 | awk '{print $4}')
./scripts/restore-db.sh "db/$LATEST" dngg-restore-test postgres dngg test
docker exec -e PGPASSWORD=test dngg-restore-test psql -U postgres -d dngg -tAc \
  "select 'Game', (select count(*) from \"game\") union all select 'Log', (select count(*) from \"log\") union all select 'Player', (select count(*) from \"player\")"
```

Expected: 운영에서 뽑은 행 수와 **정확히 일치**. 정리:

```bash
docker rm -f dngg-restore-test
```

- [ ] **Step 7: systemd 타이머 등록 (매일 04:10 KST)**

`subscription-renewal.cron.ts`가 매일 04:00에 도는 것을 피해 10분 뒤로 둔다. `infra/systemd/dngg-backup-db.service`(`Type=oneshot`, `User=ec2-user`, `After=docker.service`)와 `dngg-backup-db.timer`(`OnCalendar=*-*-* 04:10:00`, `Persistent=true`, `RandomizedDelaySec=120`)를 만들어 설치한다.

```bash
scp infra/systemd/dngg-backup-db.service infra/systemd/dngg-backup-db.timer dngg:/tmp/
ssh dngg 'sudo mv /tmp/dngg-backup-db.service /tmp/dngg-backup-db.timer /etc/systemd/system/ && \
  sudo chown root:root /etc/systemd/system/dngg-backup-db.* && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now dngg-backup-db.timer && \
  systemctl list-timers dngg-backup-db.timer --no-pager'
```

그 뒤 타이머가 아니라 **서비스가 실제로 도는지** 직접 확인한다 (systemd 환경은 대화형 셸과 다르다):

```bash
ssh dngg 'sudo systemctl start dngg-backup-db.service && sleep 8 && \
  systemctl is-failed dngg-backup-db.service; \
  sudo journalctl -u dngg-backup-db.service -n 15 --no-pager -o cat'
```

Expected: 다음 실행 시각이 잡히고, `is-failed`가 `inactive`(oneshot 정상 완료), 로그에 `백업 완료: s3://...`.

- [ ] **Step 8: 런북 작성**

`docs/runbooks/backup-restore.md`에 다음을 기록한다: 버킷명과 경로 규약, 백업 스케줄(매일 04:10 KST), Step 6에서 검증한 복구 절차(명령 그대로), 실제 장애 시 복구 순서(컨테이너 정지 → 복원 → 기동), Step 3에서 확인한 IAM 역할명, 리허설 실시일과 대조한 행 수.

- [ ] **Step 9: 커밋**

```bash
git add scripts/backup-db.sh scripts/restore-db.sh docs/runbooks/backup-restore.md
git commit -m "feat: DB 백업을 S3로 자동화하고 복구 절차를 검증

매일 04:10 KST에 pg_dump를 gzip해 S3로 올린다. pg_dump 실패 시 파이프라인
뒤쪽 gzip은 성공하므로 빈 덤프가 조용히 올라가지 않도록 크기 가드를 뒀다.
복원 스크립트로 로컬 컨테이너에 실제 복구해 행 수까지 대조했다."
```

---

## Task 2: 설정 파일 백업과 EBS 스냅샷 자동화

**Files:**
- Create: `scripts/backup-config.sh`
- Create: `infra/systemd/dngg-backup-config.service`, `infra/systemd/dngg-backup-config.timer`
- Modify: `docs/runbooks/backup-restore.md`

**Interfaces:**
- Consumes: Task 1의 S3 버킷과 IAM 권한.
- Produces: DLM 정책 ID(런북에 기록), S3 경로 `config/dngg-config-<타임스탬프>.tar.gz`.

**왜 필요한가:** `nginx.conf`가 서버의 `/etc/nginx/nginx.conf` 한 곳에만 있고 버전 관리가 안 된다. 인스턴스가 유실되면 TLS·프록시 설정을 처음부터 다시 짜야 한다.

- [ ] **Step 1: 설정 백업 스크립트 작성**

`scripts/backup-config.sh`:

```bash
#!/usr/bin/env bash
# nginx 설정·환경변수·compose를 묶어 S3에 올린다. 주 1회 실행.
# .env에는 시크릿이 들어 있으므로 저장소가 아니라 암호화된 S3에만 둔다.
set -euo pipefail

PROJECT_DIR="${DNGG_PROJECT_DIR:-/usr/local/project/dngg}"
BUCKET="${DNGG_BACKUP_BUCKET:-dngg-backup-691967102238}"
REGION="${AWS_REGION:-ap-northeast-2}"

STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGE="${TMP}/config"
mkdir -p "${STAGE}"

sudo cat /etc/nginx/nginx.conf > "${STAGE}/nginx.conf"
cp "${PROJECT_DIR}/.env" "${STAGE}/env"
cp "${PROJECT_DIR}/docker-compose.yaml" "${STAGE}/docker-compose.yaml"
sudo cp -r /etc/letsencrypt/renewal "${STAGE}/letsencrypt-renewal" 2>/dev/null || true

tar -czf "${TMP}/dngg-config-${STAMP}.tar.gz" -C "${TMP}" config
aws s3 cp "${TMP}/dngg-config-${STAMP}.tar.gz" \
  "s3://${BUCKET}/config/dngg-config-${STAMP}.tar.gz" --region "${REGION}"
echo "설정 백업 완료: s3://${BUCKET}/config/dngg-config-${STAMP}.tar.gz"
```

- [ ] **Step 2: 배포 후 수동 실행**

```bash
chmod +x scripts/backup-config.sh
scp scripts/backup-config.sh dngg:/usr/local/project/dngg/scripts/
ssh dngg 'chmod +x /usr/local/project/dngg/scripts/backup-config.sh && /usr/local/project/dngg/scripts/backup-config.sh'
```

Expected: `설정 백업 완료: s3://...` 출력.

- [ ] **Step 3: systemd 타이머 등록 (매주 일요일 04:30 KST)**

Task 1에서 만든 `infra/systemd/dngg-backup-db.*`와 같은 형태로 `dngg-backup-config.service`/`.timer`를 만든다. 서비스는 `Type=oneshot`, `User=ec2-user`, `After=docker.service`, `ExecStart=/usr/local/project/dngg/scripts/backup-config.sh`. 타이머는 `OnCalendar=Sun *-*-* 04:30:00`, `Persistent=true`, `RandomizedDelaySec=120`, `WantedBy=timers.target`.

> `backup-config.sh`는 `sudo cat /etc/nginx/nginx.conf`를 쓴다. `User=ec2-user`로 실행되므로 비밀번호 없는 sudo가 동작하는지 Step 4에서 반드시 확인한다 — 안 되면 `User=root`로 돌린다.

```bash
scp infra/systemd/dngg-backup-config.service infra/systemd/dngg-backup-config.timer dngg:/tmp/
ssh dngg 'sudo mv /tmp/dngg-backup-config.service /tmp/dngg-backup-config.timer /etc/systemd/system/ && \
  sudo chown root:root /etc/systemd/system/dngg-backup-config.* && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now dngg-backup-config.timer && \
  systemctl list-timers dngg-backup-config.timer --no-pager'
```

- [ ] **Step 3b: 타이머가 아니라 서비스가 실제로 도는지 확인**

systemd 환경은 대화형 셸과 PATH·환경변수가 다르다. 반드시 직접 기동해 확인한다.

```bash
ssh dngg 'sudo systemctl start dngg-backup-config.service && sleep 8 && \
  systemctl is-failed dngg-backup-config.service; \
  sudo journalctl -u dngg-backup-config.service -n 15 --no-pager -o cat'
```

Expected: `is-failed`가 `inactive`(oneshot 정상 완료), 로그에 `설정 백업 완료: s3://...`.

- [ ] **Step 4: DLM 서비스 역할 생성**

```bash
aws iam create-role --role-name AWSDataLifecycleManagerDefaultRole \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"dlm.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy --role-name AWSDataLifecycleManagerDefaultRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole
```

Expected: 이미 존재하면 `EntityAlreadyExists` — 그대로 진행해도 된다.

- [ ] **Step 5: 볼륨에 태그를 달고 DLM 정책 생성 (주 1회, 4주 보관)**

```bash
aws ec2 create-tags --resources vol-090d42ef7023a685e --region ap-northeast-2 \
  --tags Key=Backup,Value=dngg

aws dlm create-lifecycle-policy --region ap-northeast-2 \
  --description "dngg 주간 EBS 스냅샷 (4주 보관)" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::691967102238:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"EBS_SNAPSHOT_MANAGEMENT",
    "ResourceTypes":["VOLUME"],
    "TargetTags":[{"Key":"Backup","Value":"dngg"}],
    "Schedules":[{
      "Name":"weekly",
      "CreateRule":{"CronExpression":"cron(0 19 ? * SUN *)"},
      "RetainRule":{"Count":4},
      "CopyTags":true
    }]}'
```

> `cron(0 19 ? * SUN *)`은 UTC 기준이라 KST 월요일 04:00이다. DLM은 UTC만 받는다.

Expected: `PolicyId` 반환. 확인:

```bash
aws dlm get-lifecycle-policies --region ap-northeast-2 --output table
```

- [ ] **Step 6: 런북 갱신 후 커밋**

`docs/runbooks/backup-restore.md`에 설정 백업 경로·스케줄, DLM 정책 ID, 스냅샷에서 인스턴스를 복원하는 절차를 추가한다.

```bash
git add scripts/backup-config.sh docs/runbooks/backup-restore.md
git commit -m "feat: nginx 설정·환경변수 백업과 주간 EBS 스냅샷 자동화

nginx.conf가 서버 한 곳에만 있어 인스턴스 유실 시 복구가 불가능했다.
설정 묶음을 주 1회 S3에 올리고, DLM으로 EBS 스냅샷을 주 1회 4주 보관한다."
```

---

## Task 3: swap 2GB 추가

**Files:** 서버 설정만 변경 (저장소 변경 없음). 절차는 Task 14의 런북에 기록한다.

**왜 필요한가:** available 메모리가 242MB인데 swap이 없다. 초과하면 커널이 프로세스를 죽인다(OOM Kill). swap이 있으면 같은 상황이 "느려짐"으로 바뀐다.

- [ ] **Step 1: 사전 상태 기록**

```bash
ssh dngg 'free -m; echo "---"; df -h /; echo "---"; swapon --show || echo "(swap 없음)"'
```

Expected: swap 없음, `/`에 12GB 이상 여유.

- [ ] **Step 2: swap 파일 생성**

`fallocate`는 XFS에서 홀(hole) 있는 파일을 만들어 `swapon`이 거부할 수 있으므로 `dd`를 쓴다. 약 20초 걸린다.

```bash
ssh dngg 'sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress && \
  sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile'
```

Expected: `Setting up swapspace version 1, size = 2 GiB` 출력.

- [ ] **Step 3: 재부팅 후에도 유지되도록 fstab 등록**

```bash
ssh dngg 'grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab'
```

- [ ] **Step 4: swappiness를 10으로 (평소엔 안 쓰고 급할 때만)**

```bash
ssh dngg 'echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-dngg-swappiness.conf && \
  sudo sysctl -p /etc/sysctl.d/99-dngg-swappiness.conf'
```

- [ ] **Step 5: 검증**

```bash
ssh dngg 'swapon --show; free -m; cat /proc/sys/vm/swappiness; grep swapfile /etc/fstab'
```

Expected: swap 2GB 활성, swappiness `10`, fstab에 항목 존재.

---

## Task 4: CPU 크레딧 `unlimited` 전환과 예산 알람

**Files:** AWS 설정만 변경. 절차와 비용 계산은 Task 14의 런북에 기록한다.

**왜 필요한가:** 현재 `standard` 모드에 크레딧 144/144다. 100% 부하가 지속되면 약 2.7시간 뒤 크레딧이 바닥나고 CPU가 baseline 10%로 **하드 스로틀**된다 — 사실상 장애다. `unlimited`는 평소 $0이고 초과분만 vCPU-시간당 $0.05가 붙어, "트래픽이 늘 때만 비용이 는다"는 제약에 정확히 맞는다.

- [ ] **Step 1: 현재 상태 확인**

```bash
aws ec2 describe-instance-credit-specifications --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
```

Expected: `"CpuCredits": "standard"`.

- [ ] **Step 2: `unlimited`로 전환**

```bash
aws ec2 modify-instance-credit-specification --region ap-northeast-2 \
  --instance-credit-specifications 'InstanceId=i-0bb00c849769dcb7e,CpuCredits=unlimited'
```

Expected: `SuccessfulInstanceCreditSpecifications`에 인스턴스 ID. 재부팅 불필요.

- [ ] **Step 3: 전환 확인**

```bash
aws ec2 describe-instance-credit-specifications --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
```

Expected: `"CpuCredits": "unlimited"`.

- [ ] **Step 4: 월 예산 알람 생성 ($50, 80%에서 통지)**

`<이메일>`을 실제 수신 주소로 치환한다.

```bash
cat > /tmp/budget.json <<'EOF'
{
  "BudgetName": "dngg-monthly",
  "BudgetLimit": {"Amount": "50", "Unit": "USD"},
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
EOF

cat > /tmp/budget-notify.json <<'EOF'
[{
  "Notification": {
    "NotificationType": "ACTUAL",
    "ComparisonOperator": "GREATER_THAN",
    "Threshold": 80,
    "ThresholdType": "PERCENTAGE"
  },
  "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "<이메일>"}]
}]
EOF

aws budgets create-budget --account-id 691967102238 \
  --budget file:///tmp/budget.json \
  --notifications-with-subscribers file:///tmp/budget-notify.json
```

Expected: 에러 없이 종료. 확인:

```bash
aws budgets describe-budgets --account-id 691967102238 --query 'Budgets[].BudgetName' --output text
```

- [ ] **Step 5: 이론적 최대 비용을 런북에 기록**

`unlimited`의 상한은 `720h × 0.9 × $0.05 ≈ $32/월`(1 vCPU를 한 달 내내 100%로 태울 때)이다. 예산 $50 안에 들어오므로 폭주 리스크가 없다는 근거를 Task 14 런북에 남긴다.

---

## Task 5: TypeORM 커넥션 풀 명시와 죽은 compose 마운트 제거

**Files:**
- Create: `backend/src/common/env.ts`
- Create: `backend/src/common/env.spec.ts`
- Create: `backend/src/config/typeorm.options.ts`
- Create: `backend/src/config/typeorm.options.spec.ts`
- Modify: `backend/src/app.module.ts:30-40`
- Modify: `docker-compose.yaml`

**Interfaces:**
- Produces: `readPositiveInt(raw: string | undefined, fallback: number): number` (in `src/common/env.ts`), `buildTypeOrmOptions(env: NodeJS.ProcessEnv): TypeOrmModuleOptions`, 상수 `DEFAULT_DB_POOL_MAX = 10`, `DB_CONNECTION_TIMEOUT_MS = 5000`. Task 6이 `readPositiveInt`를 재사용한다 — 그래서 TypeORM 설정이 아니라 기존 `src/common/`(이미 `log-format.ts`, `bootstrap-failure.ts`가 있다)에 둔다.

**배경:** 현재 `app.module.ts`에 풀 설정이 없어 node-postgres 기본값 10이 우연히 적용되고 있다. 또 compose가 `./postgresql.conf:/etc/postgresql.conf`를 마운트하는데 서버에 그 파일이 없어 **Docker가 빈 디렉토리를 만들어 놨고**, postgres:15는 애초에 그 경로를 읽지 않는다(실효 `config_file`은 `/var/lib/postgresql/data/postgresql.conf`). 아무 일도 하지 않으면서 튜닝이 적용된다는 착각만 만든다.

- [ ] **Step 1: 실패하는 테스트 작성 (2개 파일)**

`backend/src/common/env.spec.ts`:

```ts
import { readPositiveInt } from './env';

describe('readPositiveInt', () => {
  test('양의 정수 문자열을 파싱한다', () => {
    expect(readPositiveInt('20', 10)).toBe(20);
  });

  test('미설정·비정수·0·음수는 기본값으로 폴백한다', () => {
    expect(readPositiveInt(undefined, 10)).toBe(10);
    expect(readPositiveInt('', 10)).toBe(10);
    expect(readPositiveInt('abc', 10)).toBe(10);
    expect(readPositiveInt('0', 10)).toBe(10);
    expect(readPositiveInt('-5', 10)).toBe(10);
    expect(readPositiveInt('1.5', 10)).toBe(10);
  });
});
```

`backend/src/config/typeorm.options.spec.ts`:

```ts
import {
  DEFAULT_DB_POOL_MAX,
  DB_CONNECTION_TIMEOUT_MS,
  buildTypeOrmOptions,
} from './typeorm.options';

const baseEnv = {
  DB_HOST: 'db',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'pw',
  DB_DATABASE: 'dngg',
} as NodeJS.ProcessEnv;

// extra는 TypeORM 타입상 any라 테스트에서 좁혀 쓴다.
function poolOf(env: NodeJS.ProcessEnv): { max: number; connectionTimeoutMillis: number } {
  return buildTypeOrmOptions(env).extra as { max: number; connectionTimeoutMillis: number };
}

describe('buildTypeOrmOptions', () => {
  test('커넥션 풀 상한과 획득 타임아웃을 명시한다', () => {
    expect(poolOf(baseEnv)).toEqual({
      max: DEFAULT_DB_POOL_MAX,
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    });
  });

  test('DB_POOL_MAX로 풀 상한을 조정할 수 있다 (L1 확장 시 20으로 올린다)', () => {
    expect(poolOf({ ...baseEnv, DB_POOL_MAX: '20' }).max).toBe(20);
  });

  test('잘못된 DB_POOL_MAX는 기본값으로 폴백해 부팅을 막지 않는다', () => {
    expect(poolOf({ ...baseEnv, DB_POOL_MAX: 'abc' }).max).toBe(DEFAULT_DB_POOL_MAX);
  });

  // synchronize를 끄면 운영 스키마가 갱신되지 않아 조용히 깨진다.
  // 이 저장소는 아직 synchronize에 의존하므로 값이 바뀌면 테스트가 잡아야 한다.
  test('기존 동작(synchronize: true)을 유지한다', () => {
    const options = buildTypeOrmOptions(baseEnv) as { synchronize: boolean; type: string };
    expect(options.synchronize).toBe(true);
    expect(options.type).toBe('postgres');
  });

  test('DB_PORT를 숫자로 변환한다', () => {
    const options = buildTypeOrmOptions(baseEnv) as { port: number };
    expect(options.port).toBe(5432);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/common/env.spec.ts src/config/typeorm.options.spec.ts
```

Expected: 둘 다 FAIL — `Cannot find module './env'`, `Cannot find module './typeorm.options'`.

- [ ] **Step 3: 구현 작성 (2개 파일)**

`backend/src/common/env.ts`:

```ts
// 잘못된 환경변수 때문에 컨테이너가 부팅에 실패하는 것보다, 기본값으로
// 조용히 폴백하고 뜨는 편이 운영에서 안전하다.
// 빈 문자열은 Number('')이 0이 되므로 양수 조건에서 함께 걸러진다.
export function readPositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
```

`backend/src/config/typeorm.options.ts`:

```ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { readPositiveInt } from '../common/env';

// node-postgres 기본 풀 상한과 같은 값이지만, 우연이 아니라 의도임을 명시한다.
export const DEFAULT_DB_POOL_MAX = 10;

// 스파이크 때 커넥션 획득 대기가 무한정 쌓이지 않고 빠르게 실패하게 한다.
export const DB_CONNECTION_TIMEOUT_MS = 5000;

export function buildTypeOrmOptions(
  env: NodeJS.ProcessEnv,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    entities: ['dist/entities/*.entity.js'],
    autoLoadEntities: true,
    synchronize: true,
    logging: false,
    extra: {
      max: readPositiveInt(env.DB_POOL_MAX, DEFAULT_DB_POOL_MAX),
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/common/env.spec.ts src/config/typeorm.options.spec.ts
```

Expected: 두 파일 모두 PASS.

- [ ] **Step 5: `app.module.ts`가 새 함수를 쓰도록 교체**

`backend/src/app.module.ts`에서 `TypeOrmModule.forRoot({...})` 블록 전체를 아래로 바꾸고, 상단에 import를 추가한다.

```ts
import { buildTypeOrmOptions } from './config/typeorm.options';
```

```ts
    TypeOrmModule.forRoot(buildTypeOrmOptions(process.env)),
```

- [ ] **Step 6: 전체 테스트와 빌드 확인**

```bash
cd backend && pnpm test && pnpm build
```

Expected: 모든 테스트 PASS, 빌드 성공.

- [ ] **Step 7: compose에서 죽은 마운트 제거하고 `DB_POOL_MAX` 주입**

`docker-compose.yaml`의 `db.volumes`에서 아래 줄을 **삭제**한다:

```yaml
      - ./postgresql.conf:/etc/postgresql.conf
```

`backend.environment`에 아래를 **추가**한다:

```yaml
      # L1 확장(t3.small) 시 20으로 올린다 — docs/runbooks/scaling.md 참고
      - DB_POOL_MAX=${DB_POOL_MAX:-10}
```

- [ ] **Step 8: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/common/env.ts backend/src/common/env.spec.ts \
        backend/src/config/typeorm.options.ts backend/src/config/typeorm.options.spec.ts \
        backend/src/app.module.ts docker-compose.yaml
git commit -m "refactor: TypeORM 커넥션 풀을 명시하고 죽은 postgresql.conf 마운트를 제거

풀 상한 10은 node-postgres 기본값이 우연히 적용되던 것이었다. 의도를 명시하고
DB_POOL_MAX로 조정 가능하게 해 L1 확장 때 재빌드 없이 올릴 수 있게 했다.
획득 타임아웃 5초를 둬 스파이크 때 대기가 무한정 쌓이지 않게 한다.

compose의 postgresql.conf 마운트는 서버에 해당 파일이 없어 Docker가 빈
디렉토리를 만들어 놓은 상태였고, postgres:15는 그 경로를 읽지도 않는다.
아무 효과 없이 튜닝이 적용된다는 착각만 만들어 제거한다."
```

---

## Task 6: 전역 로그인 rate limit을 환경변수로

**Files:**
- Modify: `backend/src/modules/user/login-throttler.guard.ts:14`
- Modify: `backend/src/modules/user/login-throttler.guard.spec.ts`
- Modify: `backend/src/modules/user/user.module.ts:21,47`
- Modify: `docker-compose.yaml`

**Interfaces:**
- Consumes: Task 5의 `readPositiveInt` (`backend/src/common/env.ts`).
- Produces: `resolveSitewideLoginLimit(env: NodeJS.ProcessEnv): number`, 상수 `DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT = 300`.

**배경:** `SITEWIDE_LOGIN_THROTTLE_LIMIT = 300` / TTL 5분이 코드 상수다. 이건 IP별이 아니라 **전역 단일 버킷**이라 누가 채우든 그 5분 동안 모든 사용자가 429를 받는다. 스프레이 공격 방어로는 옳지만 초당 1회꼴이라 **마케팅 스파이크 자체가 이 한도를 칠 수 있고**, 지금은 올리려면 재빌드·재배포가 필요하다.

- [ ] **Step 1: 실패하는 테스트 추가**

`backend/src/modules/user/login-throttler.guard.spec.ts` 맨 아래에 추가하고, 파일 상단 import에 `DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT`와 `resolveSitewideLoginLimit`를 더한다.

```ts
describe('resolveSitewideLoginLimit', () => {
  test('미설정이면 기본값 300을 쓴다', () => {
    expect(resolveSitewideLoginLimit({})).toBe(
      DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT,
    );
    expect(DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT).toBe(300);
  });

  // 스파이크 때 재배포 없이 .env 수정 + 컨테이너 재시작만으로 올릴 수 있어야 한다.
  test('환경변수로 한도를 올릴 수 있다', () => {
    expect(
      resolveSitewideLoginLimit({ SITEWIDE_LOGIN_THROTTLE_LIMIT: '1000' }),
    ).toBe(1000);
  });

  test('무효한 값은 기본값으로 폴백해 부팅을 막지 않는다', () => {
    for (const bad of ['abc', '0', '-5', '', '1.5']) {
      expect(
        resolveSitewideLoginLimit({ SITEWIDE_LOGIN_THROTTLE_LIMIT: bad }),
      ).toBe(DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT);
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/user/login-throttler.guard.spec.ts
```

Expected: FAIL — `resolveSitewideLoginLimit is not a function` 또는 import 에러.

- [ ] **Step 3: 구현**

`backend/src/modules/user/login-throttler.guard.ts`에서 14번째 줄

```ts
export const SITEWIDE_LOGIN_THROTTLE_LIMIT = 300;
```

을 아래로 교체하고, 파일 상단에 import를 추가한다:

```ts
import { readPositiveInt } from '../../common/env';
```

```ts
export const DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT = 300;

// 이 버킷은 전역 단일 키라, 스파이크로 정상 사용자가 한꺼번에 몰리면 서비스가
// 스스로를 잠글 수 있다. 재배포 없이 .env + 컨테이너 재시작만으로 올릴 수 있게
// 환경변수를 받는다.
export function resolveSitewideLoginLimit(env: NodeJS.ProcessEnv): number {
  return readPositiveInt(
    env.SITEWIDE_LOGIN_THROTTLE_LIMIT,
    DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT,
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/user/login-throttler.guard.spec.ts
```

Expected: PASS.

- [ ] **Step 5: `user.module.ts`가 새 함수를 쓰도록 교체**

21번째 줄 import 목록에서 `SITEWIDE_LOGIN_THROTTLE_LIMIT`를 `resolveSitewideLoginLimit`로 바꾸고, 47번째 줄을 교체한다:

```ts
        limit: resolveSitewideLoginLimit(process.env),
```

- [ ] **Step 6: 전체 테스트와 빌드**

```bash
cd backend && pnpm test && pnpm build
```

Expected: 전부 PASS, 빌드 성공.

- [ ] **Step 7: compose에 환경변수 추가**

`docker-compose.yaml`의 `backend.environment`에 추가한다:

```yaml
      # 전역 로그인 한도(5분 창). 전역 단일 버킷이라 스파이크 때 정상 사용자를
      # 429로 잠글 수 있다 — 그때 서버 .env에서 올리고 컨테이너만 재시작한다.
      - SITEWIDE_LOGIN_THROTTLE_LIMIT=${SITEWIDE_LOGIN_THROTTLE_LIMIT:-300}
```

- [ ] **Step 8: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/user/login-throttler.guard.ts \
        backend/src/modules/user/login-throttler.guard.spec.ts \
        backend/src/modules/user/user.module.ts docker-compose.yaml
git commit -m "feat: 전역 로그인 rate limit을 환경변수로 조정 가능하게

전역 버킷(5분 300회)은 IP별이 아니라 단일 키라, 마케팅 스파이크로 정상
사용자가 몰리면 서비스가 스스로를 429로 잠글 수 있다. 기존에는 한도를
올리려면 재빌드·재배포가 필요했다. 기본값 300은 그대로 두고, 필요 시
서버 .env 수정과 컨테이너 재시작만으로 올릴 수 있게 한다."
```

---

## Task 7: 헬스체크 엔드포인트와 CI 교체

**Files:**
- Create: `backend/src/modules/health/health.controller.ts`
- Create: `backend/src/modules/health/health.controller.spec.ts`
- Create: `backend/src/modules/health/health.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `.github/workflows/deploy.yml:189`

**Interfaces:**
- Produces: `GET /health` → `{ status: 'ok' }`, `GET /health/ready` → `{ status: 'ok', db: 'up' }` 또는 503. nginx 경유 시 공개 URL은 `https://dngg.one/api/health/ready`. Task 8·11·13이 이 경로를 사용한다.

**배경:** 현재 CI 헬스체크는 `/group/all`을 쓴다. 인증 없는 데이터 엔드포인트라 헬스체크용으로 부적절하고, DB 장애와 앱 장애를 구분하지 못한다. `@nestjs/terminus`는 이 용도에 과하므로 직접 구현한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/health/health.controller.spec.ts`:

```ts
import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

function makeController(query: jest.Mock): HealthController {
  return new HealthController({ query } as unknown as DataSource);
}

describe('HealthController', () => {
  test('liveness는 DB를 건드리지 않고 ok를 반환한다', () => {
    const query = jest.fn();
    expect(makeController(query).liveness()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  test('readiness는 DB 쿼리가 성공하면 ok를 반환한다', async () => {
    const query = jest.fn().mockResolvedValue([{ result: 1 }]);
    await expect(makeController(query).readiness()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  // DB가 죽었는데도 200을 뱉는 헬스체크는 없느니만 못하다.
  // 이 테스트가 사라지면 배포 검증이 통째로 무의미해진다.
  test('readiness는 DB 쿼리가 실패하면 503을 던진다', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection refused'));
    await expect(makeController(query).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/health/health.controller.spec.ts
```

Expected: FAIL — `Cannot find module './health.controller'`.

- [ ] **Step 3: 구현 작성**

`backend/src/modules/health/health.controller.ts`:

```ts
import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // 프로세스 생존만 본다. DB가 죽어도 앱이 살아 있으면 200이다.
  @Get()
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  // 실제로 트래픽을 받을 수 있는 상태인지 본다 — DB 연결까지 확인한다.
  @Get('ready')
  async readiness(): Promise<{ status: string; db: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
```

`backend/src/modules/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/health/health.controller.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: `app.module.ts`에 모듈 등록**

import를 추가하고 `imports` 배열 끝(다른 도메인 모듈들과 나란히)에 `HealthModule`을 넣는다.

```ts
import { HealthModule } from './modules/health/health.module';
```

- [ ] **Step 6: 로컬에서 실제 동작 확인**

```bash
cd /Users/onady/project/dngg
docker compose up -d db
cd backend && pnpm dev
```

다른 터미널에서:

```bash
curl -s http://localhost:3010/health; echo
curl -s http://localhost:3010/health/ready; echo
```

Expected: `{"status":"ok"}`, `{"status":"ok","db":"up"}`.

DB를 멈춰 503을 확인한다:

```bash
docker compose stop db
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/health/ready
docker compose start db
```

Expected: `503`. 확인 후 백엔드 dev 서버를 종료한다.

- [ ] **Step 7: CI 헬스체크 교체**

`.github/workflows/deploy.yml` 189번째 줄을 바꾼다.

변경 전:
```yaml
            curl -sf http://127.0.0.1:3010/group/all > /dev/null && echo "backend OK"
```

변경 후:
```yaml
            curl -sf http://127.0.0.1:3010/health/ready > /dev/null && echo "backend OK"
```

> 헬스체크는 새 이미지를 pull·기동한 **뒤에** 실행되므로 같은 커밋에 넣어도 안전하다. 백엔드 빌드가 실패해 구버전이 그대로 도는 경우에는 이 헬스체크가 실패하는데, 그건 의도된 동작이다(기존 `/group/all`은 그런 스큐를 조용히 통과시켰다).

- [ ] **Step 8: 전체 테스트·빌드 후 커밋**

```bash
cd backend && pnpm test && pnpm build
cd /Users/onady/project/dngg
git add backend/src/modules/health/ backend/src/app.module.ts .github/workflows/deploy.yml
git commit -m "feat: 헬스체크 엔드포인트 추가하고 CI 검증을 교체

CI가 /group/all로 배포를 검증하고 있었다. 인증 없는 데이터 엔드포인트라
헬스체크용으로 부적절하고 DB 장애와 앱 장애를 구분하지 못한다.

/health는 프로세스 생존만, /health/ready는 DB 연결까지 확인한다.
DB가 끊기면 503을 던지도록 하고 테스트로 고정했다 — 장애에도 200을 뱉는
헬스체크는 없느니만 못하다."
```

---

## Task 8: 코드 변경 3건 통합 배포와 운영 검증

**Files:** 배포만 수행 (저장소 변경 없음).

**Interfaces:**
- Consumes: Task 5·6·7의 커밋.

**왜 하나로 묶는가:** Task 5·6·7은 모두 `backend/**`와 `docker-compose.yaml`을 건드린다. 따로 머지하면 운영 배포가 3번 일어난다. 한 번에 올려 배포 리스크와 검증 횟수를 줄인다.

- [ ] **Step 1: 배포 전 백업 확보**

```bash
ssh dngg '/usr/local/project/dngg/scripts/backup-db.sh'
```

Expected: 백업 완료 메시지.

- [ ] **Step 2: 현재 배포된 버전 기록 (롤백 대비)**

```bash
ssh dngg 'grep -E "^FRONTEND_VERSION|^BACKEND_VERSION" /usr/local/project/dngg/.env'
```

출력값을 Task 14 런북에 "롤백 지점"으로 적어둔다.

- [ ] **Step 3: 브랜치를 main에 머지하고 푸시 (= 운영 배포)**

```bash
cd /Users/onady/project/dngg
cd backend && pnpm test && pnpm build && cd ..
git switch main
git merge --no-ff feat/scaling-readiness -m "feat: 확장 대비 백엔드 변경 통합 (커넥션 풀·로그인 한도 env화·헬스체크)"
git push origin main
```

- [ ] **Step 4: CI 성공 확인**

```bash
gh run watch
```

Expected: backend 잡과 deploy 잡 모두 success. 헬스체크 단계에서 `backend OK` / `frontend OK` 출력.

- [ ] **Step 5: 운영에서 직접 스모크 테스트**

```bash
curl -s https://dngg.one/api/health; echo
curl -s https://dngg.one/api/health/ready; echo
curl -s -o /dev/null -w "%{http_code}\n" https://dngg.one/
```

Expected: `{"status":"ok"}`, `{"status":"ok","db":"up"}`, `200`.

- [ ] **Step 6: 죽은 마운트가 실제로 사라졌는지, 커넥션 풀이 적용됐는지 확인**

```bash
ssh dngg 'docker inspect postgres --format "{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}"'
ssh dngg 'docker exec dngg-backend-1 printenv DB_POOL_MAX SITEWIDE_LOGIN_THROTTLE_LIMIT'
```

Expected: 마운트 목록에 `/etc/postgresql.conf`가 **없다**. 환경변수는 `10`, `300`.

- [ ] **Step 7: 서버에 남은 빈 디렉토리 정리**

```bash
ssh dngg 'cd /usr/local/project/dngg && ls -ld postgresql.conf 2>/dev/null && sudo rmdir postgresql.conf && echo "제거 완료" || echo "이미 없음"'
```

- [ ] **Step 8: 로그인이 정상 동작하는지 확인**

브라우저에서 `https://dngg.one/settings`로 이동해 실제 계정으로 로그인한다.

Expected: 정상 로그인. 429가 뜨면 즉시 Step 9로 롤백한다.

- [ ] **Step 9 (문제 발생 시에만): 롤백**

```bash
ssh dngg 'cd /usr/local/project/dngg && sed -i "s/^BACKEND_VERSION=.*/BACKEND_VERSION=<Step 2에서 기록한 값>/" .env && docker compose up -d backend'
```

그 뒤 문제 커밋을 revert해 새로 배포한다 (`.env` 핀은 다음 배포에서 덮어써진다).

---

## Task 9: 보안 그룹 축소

**Files:** AWS 설정만 변경. 절차는 Task 14 런북에 기록한다.

**배경:** 포트 3010이 `0.0.0.0/0`에 열려 있다. 프론트는 `NEXT_PUBLIC_API_URL=https://dngg.one/api`로 nginx만 경유하므로 직접 노출이 불필요하고, 열려 있는 동안은 Task 10에서 붙일 nginx rate limit이 `http://3.34.242.163:3010`으로 통째로 우회된다. SSH 22도 전 세계에 열려 있다.

**⚠️ 잠금 위험:** SSH 규칙을 지우기 전에 **현재 IP가 기존 전체 허용(-1) 규칙에 포함되는지 반드시 확인**한다. 확인 없이 지우면 접속이 끊긴다.

- [ ] **Step 1: 현재 규칙 스냅샷 기록 (롤백용)**

```bash
aws ec2 describe-security-groups --group-ids sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --query 'SecurityGroups[].IpPermissions' --output json > /tmp/sg-before.json
cat /tmp/sg-before.json
```

- [ ] **Step 2: 내 현재 공인 IP가 허용 목록에 있는지 확인**

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
echo "현재 IP: $MYIP"
aws ec2 describe-security-groups --group-ids sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --query 'SecurityGroups[].IpPermissions[?IpProtocol==`-1`].IpRanges[].CidrIp' --output text
```

Expected: 출력된 목록(현재 `175.197.23.126/32`, `119.196.110.67/32`, `119.196.110.160/32`, `220.76.219.142/32`)에 `$MYIP/32`가 **포함되어 있어야 한다.**

포함되지 않으면 먼저 추가한다:

```bash
aws ec2 authorize-security-group-ingress --group-id sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --ip-permissions "IpProtocol=-1,IpRanges=[{CidrIp=${MYIP}/32,Description=현재작업PC}]"
```

- [ ] **Step 3: SSH 세션을 하나 더 열어둔 채로 진행**

별도 터미널에서 `ssh dngg`로 접속해 **연결을 유지**한다. 규칙 변경으로 새 접속이 막혀도 이 세션으로 되돌릴 수 있다.

- [ ] **Step 4: 3010 공개 노출 제거**

```bash
aws ec2 revoke-security-group-ingress --group-id sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --protocol tcp --port 3010 --cidr 0.0.0.0/0
```

- [ ] **Step 5: 사이트가 여전히 정상인지 즉시 확인**

```bash
curl -s https://dngg.one/api/health/ready; echo
curl -s -o /dev/null -w "%{http_code}\n" https://dngg.one/
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://3.34.242.163:3010/health || echo "직접 접근 차단됨 (정상)"
```

Expected: 앞의 둘은 정상(`{"status":"ok","db":"up"}`, `200`), 마지막은 타임아웃/실패.

- [ ] **Step 6: SSH 전체 공개 제거**

```bash
aws ec2 revoke-security-group-ingress --group-id sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --protocol tcp --port 22 --cidr 0.0.0.0/0
```

- [ ] **Step 7: 새 SSH 접속이 되는지 확인 (기존 세션은 열어둔 채로)**

```bash
ssh -o ConnectTimeout=10 dngg 'echo "SSH 정상"'
```

Expected: `SSH 정상`. 실패하면 즉시 Step 8로 되돌린다.

- [ ] **Step 8 (문제 발생 시에만): 롤백**

```bash
aws ec2 authorize-security-group-ingress --group-id sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --protocol tcp --port 3010 --cidr 0.0.0.0/0
```

- [ ] **Step 9: 최종 규칙 확인**

```bash
aws ec2 describe-security-groups --group-ids sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --query 'SecurityGroups[].IpPermissions[].{Port:FromPort,Proto:IpProtocol,Cidr:IpRanges[].CidrIp}' --output json
```

Expected: 80/443만 `0.0.0.0/0`, 나머지는 지정 IP뿐.

---

## Task 10: nginx 강화와 설정 버전 관리

**Files:**
- Create: `infra/nginx/nginx.conf`
- Modify: `docs/runbooks/backup-restore.md`

**Interfaces:**
- Produces: nginx access log의 `rt=` 필드(요청 처리 시간). Task 12의 모니터링 스크립트가 이 포맷을 파싱한다.

**배경:** nginx에 `limit_req`가 없고 gzip도 꺼져 있으며, 설정이 서버 한 곳에만 존재한다.

- [ ] **Step 1: 현재 설정을 저장소로 가져와 버전 관리 시작**

```bash
cd /Users/onady/project/dngg
mkdir -p infra/nginx
ssh dngg 'sudo cat /etc/nginx/nginx.conf' > infra/nginx/nginx.conf
git add infra/nginx/nginx.conf
git commit -m "chore: 운영 nginx 설정을 저장소로 편입

서버의 /etc/nginx/nginx.conf가 유일본이라 인스턴스 유실 시 TLS·프록시
설정을 복구할 수 없었다. 강화 작업 전 현재 상태를 그대로 먼저 기록한다."
```

- [ ] **Step 2: 서버에서 현재 설정 백업**

```bash
ssh dngg 'sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak-$(date +%Y%m%d-%H%M%S) && ls -la /etc/nginx/nginx.conf.bak-*'
```

- [ ] **Step 3: `infra/nginx/nginx.conf`의 `http { }` 블록 안, `server { }` 블록보다 앞에 아래를 추가**

```nginx
    # ── 확장 대비 추가 (2026-08-10) ─────────────────────────────
    # 요청 처리 시간을 로그에 남긴다 — scripts/monitor-resources.sh가 p95를 계산한다.
    log_format timed '$remote_addr - $remote_user [$time_local] "$request" '
                     '$status $body_bytes_sent "$http_referer" "$http_user_agent" '
                     'rt=$request_time urt=$upstream_response_time';
    access_log /var/log/nginx/access.log timed;

    # IP당 요청 제한. 백엔드에 닿기 전에 걸러낸다.
    # 정상 사용자는 초당 20회를 넘기지 않는다 — 실측은 docs/runbooks/scaling.md 참고.
    limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
    limit_req_zone $binary_remote_addr zone=web:10m rate=50r/s;
    limit_req_status 429;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_proxied any;
    gzip_vary on;
    gzip_types application/json application/javascript application/x-javascript
               text/css text/plain text/xml application/xml image/svg+xml;
    # ────────────────────────────────────────────────────────────
```

- [ ] **Step 4: `location /` 와 `location /api/` 에 각각 limit_req 적용**

`location / {` 블록 첫 줄에 추가:

```nginx
        limit_req zone=web burst=100 nodelay;
```

`location /api/ {` 블록 첫 줄에 추가:

```nginx
            limit_req zone=api burst=40 nodelay;
```

- [ ] **Step 5: 서버에 반영하고 문법 검사 (reload 전에)**

```bash
scp infra/nginx/nginx.conf dngg:/tmp/nginx.conf
ssh dngg 'sudo cp /tmp/nginx.conf /etc/nginx/nginx.conf && sudo nginx -t'
```

Expected: `syntax is ok` / `test is successful`.

**문법 검사가 실패하면 즉시 되돌린다:**
```bash
ssh dngg 'sudo cp $(ls -t /etc/nginx/nginx.conf.bak-* | head -1) /etc/nginx/nginx.conf && sudo nginx -t'
```

- [ ] **Step 6: reload (restart 아님 — 무중단)**

```bash
ssh dngg 'sudo systemctl reload nginx && sudo systemctl status nginx --no-pager | head -5'
```

Expected: `active (running)`.

- [ ] **Step 7: 동작 검증**

```bash
curl -s https://dngg.one/api/health/ready; echo
curl -s -o /dev/null -w "%{http_code}\n" https://dngg.one/
curl -s -H "Accept-Encoding: gzip" -o /dev/null -D - https://dngg.one/api/health/ready | grep -i "content-encoding" || echo "(작은 응답이라 gzip 미적용 — 정상)"
ssh dngg 'sudo tail -3 /var/log/nginx/access.log'
```

Expected: 사이트 정상, access log에 `rt=` 필드가 보인다.

- [ ] **Step 8: rate limit이 실제로 동작하는지 확인**

```bash
for i in $(seq 1 120); do
  curl -s -o /dev/null -w "%{http_code} " "https://dngg.one/api/health"
done; echo
```

Expected: 대부분 `200`, 버스트를 넘긴 뒤 일부 `429`가 섞여 나온다. 429가 전혀 안 나오면 burst가 너무 크다는 뜻이니 값을 기록만 해두고 Task 13 부하 테스트 결과로 조정한다.

- [ ] **Step 9: 커밋**

```bash
git add infra/nginx/nginx.conf docs/runbooks/backup-restore.md
git commit -m "feat: nginx에 rate limit·gzip·응답시간 로깅 추가

IP당 요청 제한을 nginx 단에 둬 백엔드에 닿기 전에 걸러낸다. gzip은 꺼져
있어 대역폭과 체감 속도에서 손해를 보고 있었다. access log에 request_time을
남겨 모니터링 스크립트가 p95를 계산할 수 있게 한다.

적용은 nginx -t 통과 후 reload로 해 무중단으로 처리했다."
```

---

## Task 11: CloudWatch 알람과 SNS 알림

**Files:** AWS 설정만 변경. 값은 Task 14 런북에 기록한다.

**Interfaces:**
- Produces: SNS 토픽 ARN `arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts`. Task 12가 같은 토픽에 발행한다.

**배경:** 현재 CloudWatch 알람이 0개다. 무슨 일이 나도 사용자가 알려주기 전에는 알 수 없다.

- [ ] **Step 1: SNS 토픽 생성과 이메일 구독**

`<이메일>`을 실제 수신 주소로 치환한다.

```bash
TOPIC_ARN=$(aws sns create-topic --name dngg-alerts --region ap-northeast-2 --query TopicArn --output text)
echo "토픽: $TOPIC_ARN"
aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol email --notification-endpoint '<이메일>' --region ap-northeast-2
```

- [ ] **Step 2: 구독 확인 (수동 단계)**

받은 메일의 **Confirm subscription** 링크를 클릭한다. 확인 전에는 알림이 오지 않는다.

```bash
aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts --region ap-northeast-2 \
  --query 'Subscriptions[].{Endpoint:Endpoint,Arn:SubscriptionArn}' --output table
```

Expected: `SubscriptionArn`이 `PendingConfirmation`이 아니라 실제 ARN.

- [ ] **Step 3: CPU 크레딧 잔량 알람 (L1 트리거)**

```bash
aws cloudwatch put-metric-alarm --region ap-northeast-2 \
  --alarm-name dngg-cpu-credit-low \
  --alarm-description "CPU 크레딧 잔량 50 미만 — L1 수직 확장 검토 (docs/runbooks/scaling.md)" \
  --namespace AWS/EC2 --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=i-0bb00c849769dcb7e \
  --statistic Average --period 300 --evaluation-periods 2 \
  --threshold 50 --comparison-operator LessThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts
```

- [ ] **Step 4: 인스턴스 상태 검사 알람**

```bash
aws cloudwatch put-metric-alarm --region ap-northeast-2 \
  --alarm-name dngg-status-check-failed \
  --alarm-description "EC2 상태 검사 실패 — 인스턴스 자체 장애" \
  --namespace AWS/EC2 --metric-name StatusCheckFailed \
  --dimensions Name=InstanceId,Value=i-0bb00c849769dcb7e \
  --statistic Maximum --period 60 --evaluation-periods 2 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts
```

- [ ] **Step 5: 알람이 실제로 메일을 보내는지 발화 테스트**

임계치를 잠깐 비현실적으로 올려 강제 발화시킨다.

```bash
aws cloudwatch put-metric-alarm --region ap-northeast-2 \
  --alarm-name dngg-cpu-credit-low \
  --alarm-description "발화 테스트" \
  --namespace AWS/EC2 --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=i-0bb00c849769dcb7e \
  --statistic Average --period 300 --evaluation-periods 1 \
  --threshold 100000 --comparison-operator LessThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts
```

5~10분 안에 메일이 오는지 확인한다.

Expected: `ALARM: "dngg-cpu-credit-low"` 제목의 메일 수신. **메일이 오지 않으면 Step 2의 구독 확인이 안 된 것이다.**

- [ ] **Step 6: 임계치를 원래대로 되돌리기**

Step 3의 명령을 그대로 다시 실행한다. 상태 확인:

```bash
aws cloudwatch describe-alarms --region ap-northeast-2 \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Threshold:Threshold}' --output table
```

Expected: 두 알람 모두 `OK`, `dngg-cpu-credit-low`의 임계치가 `50.0`.

---

## Task 12: 자체 모니터링 cron (메모리·디스크·5xx·p95·429)

**Files:**
- Create: `scripts/monitor-resources.sh`
- Create: `infra/systemd/dngg-monitor.service`, `infra/systemd/dngg-monitor.timer`

**Interfaces:**
- Consumes: Task 10의 `rt=` 로그 포맷, Task 11의 SNS 토픽.

**배경:** 메모리·디스크는 CloudWatch 기본 메트릭에 없다. CloudWatch 에이전트의 커스텀 메트릭은 개당 월 $0.30라 "트래픽 전엔 비용 증가 없음" 제약에 걸린다. SNS 이메일은 월 1000건 무료이므로 자체 스크립트로 처리한다.

- [ ] **Step 1: 스크립트 작성**

`scripts/monitor-resources.sh`:

```bash
#!/usr/bin/env bash
# 5분마다 실행되며 임계치를 넘긴 항목만 SNS로 알린다.
# 같은 문제로 알림이 반복되지 않도록 상태 파일로 중복을 억제한다.
set -uo pipefail

TOPIC="${DNGG_SNS_TOPIC:-arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts}"
REGION="${AWS_REGION:-ap-northeast-2}"
ACCESS_LOG="${DNGG_ACCESS_LOG:-/var/log/nginx/access.log}"
STATE_DIR="/var/tmp/dngg-monitor"
mkdir -p "${STATE_DIR}"

# 임계치 — docs/runbooks/scaling.md의 L1 트리거와 같은 값을 쓴다.
MEM_MIN_MB=150
DISK_MAX_PCT=80
P95_MAX_SEC=1.0
ERR_5XX_MAX_PCT=5

ALERTS=""

add_alert() { ALERTS="${ALERTS}- $1"$'\n'; }

# 같은 키로 이미 알렸으면 60분간 재알림하지 않는다.
should_alert() {
  local key="$1" f="${STATE_DIR}/$1"
  if [ -f "${f}" ] && [ "$(( $(date +%s) - $(stat -c %Y "${f}") ))" -lt 3600 ]; then
    return 1
  fi
  touch "${f}"
  return 0
}

clear_alert() { rm -f "${STATE_DIR}/$1"; }

# ── 메모리 ────────────────────────────────────────────────
MEM_AVAIL=$(free -m | awk '/^Mem:/ {print $7}')
if [ "${MEM_AVAIL}" -lt "${MEM_MIN_MB}" ]; then
  should_alert mem && add_alert "사용 가능 메모리 ${MEM_AVAIL}MB (임계 ${MEM_MIN_MB}MB) — L1 확장 검토"
else
  clear_alert mem
fi

# ── 디스크 ────────────────────────────────────────────────
DISK_PCT=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "${DISK_PCT}" -gt "${DISK_MAX_PCT}" ]; then
  should_alert disk && add_alert "디스크 사용률 ${DISK_PCT}% (임계 ${DISK_MAX_PCT}%)"
else
  clear_alert disk
fi

# ── nginx 최근 5분: 5xx 비율, p95 응답시간, 429 발생 ───────
if [ -r "${ACCESS_LOG}" ]; then
  # 최근 5분을 "분 문자열 5개 중 하나와 일치"로 뽑는다. 타임스탬프 문자열
  # 대소 비교는 자정·월말에 뒤집히므로 쓰지 않는다.
  MINUTES=""
  for i in 0 1 2 3 4; do
    MINUTES="${MINUTES}${MINUTES:+|}$(date -d "${i} minutes ago" '+%d/%b/%Y:%H:%M')"
  done
  RECENT=$(tail -n 5000 "${ACCESS_LOG}" 2>/dev/null | grep -E "\[(${MINUTES})" || true)

  TOTAL=$(printf '%s\n' "${RECENT}" | grep -c . || true)
  if [ "${TOTAL:-0}" -ge 20 ]; then
    # 상태 코드는 반드시 `"$request"` 바로 뒤에 온다. 필드를 훑으면
    # body_bytes_sent나 user agent의 숫자를 5xx로 오탐한다.
    C5XX=$(printf '%s\n' "${RECENT}" | grep -cE '" 5[0-9][0-9] ' || true)
    PCT5XX=$(( C5XX * 100 / TOTAL ))
    if [ "${PCT5XX}" -gt "${ERR_5XX_MAX_PCT}" ]; then
      should_alert err5xx && add_alert "최근 5분 5xx 비율 ${PCT5XX}% (${C5XX}/${TOTAL})"
    else
      clear_alert err5xx
    fi

    P95=$(printf '%s\n' "${RECENT}" | grep -o 'rt=[0-9.]*' | cut -d= -f2 \
          | sort -n | awk '{a[NR]=$1} END{if(NR>0) printf "%.3f", a[int(NR*0.95)+(NR*0.95==int(NR*0.95)?0:1)]}')
    if [ -n "${P95}" ] && awk -v p="${P95}" -v m="${P95_MAX_SEC}" 'BEGIN{exit !(p>m)}'; then
      should_alert p95 && add_alert "최근 5분 p95 응답시간 ${P95}초 (임계 ${P95_MAX_SEC}초) — L1 확장 검토"
    else
      clear_alert p95
    fi

    C429=$(printf '%s\n' "${RECENT}" | grep -cE '" 429 ' || true)
    if [ "${C429:-0}" -gt 10 ]; then
      should_alert rate429 && add_alert "최근 5분 429 응답 ${C429}건 — rate limit이 정상 사용자를 막고 있을 수 있다"
    else
      clear_alert rate429
    fi
  fi
fi

# ── 발송 ──────────────────────────────────────────────────
if [ -n "${ALERTS}" ]; then
  aws sns publish --region "${REGION}" --topic-arn "${TOPIC}" \
    --subject "[dngg] 리소스 경고" \
    --message "$(date '+%Y-%m-%d %H:%M:%S %Z')

${ALERTS}
확장 판단 기준: docs/runbooks/scaling.md" >/dev/null
  echo "경고 발송:"; printf '%s' "${ALERTS}"
else
  echo "이상 없음 (mem=${MEM_AVAIL}MB disk=${DISK_PCT}%)"
fi
```

- [ ] **Step 2: 서버에 배포하고 수동 실행**

```bash
chmod +x scripts/monitor-resources.sh
scp scripts/monitor-resources.sh dngg:/usr/local/project/dngg/scripts/
ssh dngg 'chmod +x /usr/local/project/dngg/scripts/monitor-resources.sh && sudo /usr/local/project/dngg/scripts/monitor-resources.sh'
```

Expected: `이상 없음 (mem=...MB disk=...%)`.

- [ ] **Step 3: 임계치를 일부러 낮춰 알림이 실제로 가는지 확인**

```bash
ssh dngg 'sudo DNGG_SNS_TOPIC=arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts \
  bash -c "sed \"s/^MEM_MIN_MB=150/MEM_MIN_MB=99999/\" /usr/local/project/dngg/scripts/monitor-resources.sh > /tmp/mon-test.sh && bash /tmp/mon-test.sh"'
```

Expected: `경고 발송:` 출력, 몇 분 안에 `[dngg] 리소스 경고` 메일 수신.

- [ ] **Step 4: 상태 파일 정리 (테스트로 생긴 억제 상태 제거)**

```bash
ssh dngg 'sudo rm -f /var/tmp/dngg-monitor/* && rm -f /tmp/mon-test.sh'
```

- [ ] **Step 5: systemd 타이머 등록 (5분마다)**

`access.log` 읽기에 root 권한이 필요하므로 `User=root`로 돌린다. `infra/systemd/dngg-monitor.service`(`Type=oneshot`, `User=root`, `ExecStart=/usr/local/project/dngg/scripts/monitor-resources.sh`)와 `dngg-monitor.timer`(`OnBootSec=5min`, `OnUnitActiveSec=5min`, `WantedBy=timers.target`)를 만든다.

> 5분 간격 반복은 `OnCalendar`가 아니라 `OnUnitActiveSec`을 쓴다. 이 타이머는 놓친 실행을 따라잡을 필요가 없으므로 `Persistent=true`를 넣지 않는다.

```bash
scp infra/systemd/dngg-monitor.service infra/systemd/dngg-monitor.timer dngg:/tmp/
ssh dngg 'sudo mv /tmp/dngg-monitor.service /tmp/dngg-monitor.timer /etc/systemd/system/ && \
  sudo chown root:root /etc/systemd/system/dngg-monitor.* && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now dngg-monitor.timer && \
  systemctl list-timers dngg-monitor.timer --no-pager'
```

- [ ] **Step 6: 12분 뒤 journal 확인**

```bash
ssh dngg 'sudo journalctl -u dngg-monitor.service --since "-15min" --no-pager -o cat | tail -10'
```

Expected: `이상 없음 (mem=...MB disk=...%)` 줄이 2회 이상 쌓여 있다.

- [ ] **Step 7: 커밋**

```bash
git add scripts/monitor-resources.sh
git commit -m "feat: 메모리·디스크·5xx·p95·429 자체 모니터링 추가

CloudWatch 에이전트의 커스텀 메트릭은 개당 월 \$0.30라 '트래픽 전엔 비용
증가 없음' 제약에 걸린다. SNS 이메일 무료 한도(월 1000건) 안에서 자체
스크립트로 처리한다. 같은 문제로 알림이 반복되지 않도록 60분 억제를 뒀다."
```

---

## Task 13: k6 부하 테스트와 트리거 임계치 확정

**Files:**
- Create: `loadtest/k6-read-paths.js`
- Create: `docs/runbooks/scaling.md`

**Interfaces:**
- Produces: 실측한 한계 동시 사용자 수와 크레딧 소모율. Task 14의 런북 트리거 값이 이 결과로 확정된다.

**배경:** 설계의 트리거 임계치(크레딧 50, 메모리 150MB, p95 1초)는 아직 추정치다. 실측으로 검증한다.

**⚠️ 로그인 경로는 제외한다.** 전역 로그인 버킷(5분 300회)을 테스트가 스스로 소진시켜 실제 사용자를 잠근다.

- [ ] **Step 1: k6 설치**

```bash
brew install k6
k6 version
```

- [ ] **Step 2: 시나리오 작성**

`loadtest/k6-read-paths.js`:

```js
import http from 'k6/http';
import { check, sleep } from 'k6';

// 읽기 경로만 태운다. 로그인은 전역 rate limit(5분 300회)을 소진시켜
// 실제 사용자를 잠그므로 여기에 넣지 않는다.
export const options = {
  stages: [
    { duration: '3m', target: 10 },
    { duration: '3m', target: 25 },
    { duration: '3m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // 에러율 5%를 넘으면 즉시 중단한다.
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true }],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE = __ENV.BASE_URL || 'https://dngg.one';

export default function () {
  const res = http.get(`${BASE}/api/group/all`);
  check(res, { 'group/all 200': (r) => r.status === 200 });

  const health = http.get(`${BASE}/api/health/ready`);
  check(health, { 'health 200': (r) => r.status === 200 });

  sleep(1);
}
```

- [ ] **Step 3: 서버 지표를 동시에 관찰할 준비**

별도 터미널에서 1초 간격 관찰을 띄운다.

```bash
ssh dngg 'while true; do printf "%s mem_avail=%sMB swap_used=%sMB " "$(date +%H:%M:%S)" \
  "$(free -m | awk "/^Mem:/{print \$7}")" "$(free -m | awk "/^Swap:/{print \$3}")"; \
  docker stats --no-stream --format "{{.Name}}:{{.CPUPerc}}" | tr "\n" " "; echo; sleep 5; done'
```

- [ ] **Step 4: 테스트 전 백업과 크레딧 잔량 기록**

```bash
ssh dngg '/usr/local/project/dngg/scripts/backup-db.sh'
aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=i-0bb00c849769dcb7e --region ap-northeast-2 \
  --start-time "$(date -u -v-1H +%Y-%m-%dT%H:%M:%S)" --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
  --period 300 --statistics Average --query 'sort_by(Datapoints,&Timestamp)[-1]' --output json
```

- [ ] **Step 5: 부하 테스트 실행 (사용자가 적은 새벽에)**

```bash
cd /Users/onady/project/dngg
k6 run loadtest/k6-read-paths.js
```

Expected: 단계별 p95와 에러율이 출력된다. `abortOnFail`로 에러율 5% 초과 시 자동 중단된다.

- [ ] **Step 6: 결과 기록**

k6 출력에서 다음을 받아 적는다: 단계별(10/25/50/100 VU) p50·p95·p99와 에러율, **p95가 1초를 넘긴 첫 VU 수**, 관찰 터미널에서 본 최저 available 메모리와 swap 사용량 최댓값.

- [ ] **Step 7: 테스트 후 크레딧 소모량 확인**

```bash
aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=i-0bb00c849769dcb7e --region ap-northeast-2 \
  --start-time "$(date -u -v-1H +%Y-%m-%dT%H:%M:%S)" --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
  --period 300 --statistics Average --output table
```

Step 4의 값과 비교해 시간당 소모량을 계산한다.

- [ ] **Step 8: 결과가 이상하면 리전 내에서 재측정**

로컬에서 쏘면 집 회선이 먼저 병목일 수 있다. **p95가 나빠지는데 서버 CPU·메모리는 여유로우면** 회선 병목을 의심하고, 같은 리전에 임시 t3.micro를 띄워 거기서 k6를 실행한 뒤 종료한다(1시간에 수십 원).

- [ ] **Step 9: 런북 초안 작성과 커밋**

`docs/runbooks/scaling.md`를 만들고 Step 6~7의 실측값과, 그에 근거해 **확정한** L1 트리거 임계치를 기록한다. 추정치와 다르면 실측값을 채택하고 그 근거를 남긴다.

```bash
git add loadtest/k6-read-paths.js docs/runbooks/scaling.md
git commit -m "test: k6 읽기 경로 부하 시나리오 추가하고 L1 트리거를 실측으로 확정

설계 단계의 임계치(크레딧 50, 메모리 150MB, p95 1초)는 추정치였다.
동시 10→100까지 램프업해 실제로 꺾이는 지점을 측정하고 런북에 기록한다.
로그인 경로는 전역 rate limit을 소진시켜 실사용자를 잠그므로 제외했다."
```

---

## Task 14: L1 확장 리허설과 런북 완성

**Files:**
- Modify: `docs/runbooks/scaling.md`
- Modify: `start-dngg.sh`, `stop-dngg.sh`, `full-stop-dngg.sh`, `optimize-lb.sh`
- Modify: `CLAUDE.md`, `PROJECT_CONTEXT.md`

**배경:** 실제 스파이크 때 확장을 처음 해보는 일이 없게 미리 왕복해본다. 목적은 용량 확보가 아니라 **절차 검증**이므로 끝나면 t2.micro로 되돌린다.

**⚠️ 선행 조건:** 인스턴스 타입 변경은 stop/start이고, 그건 백엔드 재시작이며, `synchronize: true`는 재시작마다 스키마를 실제 DB에 맞춘다. **배포 스큐가 없는 상태에서만** 진행한다.

- [ ] **Step 1: 배포 상태와 백업 확인**

```bash
ssh dngg 'grep -E "^FRONTEND_VERSION|^BACKEND_VERSION" /usr/local/project/dngg/.env'
cd /Users/onady/project/dngg && git log --oneline -1 origin/main
ssh dngg '/usr/local/project/dngg/scripts/backup-db.sh'
```

Expected: `.env`의 sha가 `origin/main`의 최신 커밋과 일치. 백업 성공.

- [ ] **Step 2: 다운타임 측정 시작**

```bash
date '+시작 %H:%M:%S'
```

- [ ] **Step 3: 컨테이너 정지 후 인스턴스 중지**

```bash
ssh dngg 'cd /usr/local/project/dngg && docker compose stop'
aws ec2 stop-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 wait instance-stopped --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
echo "중지 완료 $(date '+%H:%M:%S')"
```

- [ ] **Step 4: 인스턴스 타입 변경**

```bash
aws ec2 modify-instance-attribute --instance-id i-0bb00c849769dcb7e --region ap-northeast-2 \
  --instance-type '{"Value":"t3.small"}'
aws ec2 describe-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2 \
  --query 'Reservations[].Instances[].InstanceType' --output text
```

Expected: `t3.small`.

- [ ] **Step 5: 기동 후 EIP 유지 확인 (가장 중요)**

```bash
aws ec2 start-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 wait instance-running --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 describe-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2 \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text
```

Expected: **`3.34.242.163`** — 바뀌었다면 DNS 갱신까지 사이트가 죽는다. 즉시 런북에 기록하고 Step 9로 되돌린다.

- [ ] **Step 6: 서비스 자동 복구 확인**

```bash
sleep 60
ssh dngg 'docker compose -f /usr/local/project/dngg/docker-compose.yaml ps; free -m; nproc'
curl -s https://dngg.one/api/health/ready; echo
curl -s -o /dev/null -w "%{http_code}\n" https://dngg.one/
date '+복구 %H:%M:%S'
```

Expected: 컨테이너 3개 `Up`(`restart: always`로 자동 기동), `nproc` = 2, 메모리 약 2GB, 헬스체크 정상. **Step 2부터 여기까지가 실제 다운타임이다 — 기록한다.**

- [ ] **Step 7: `synchronize`가 스키마를 건드리지 않았는지 확인**

```bash
ssh dngg 'docker logs dngg-backend-1 --since 10m 2>&1 | grep -iE "query: (ALTER|CREATE|DROP)" || echo "스키마 변경 없음 (정상)"'
```

Expected: `스키마 변경 없음 (정상)`. `ALTER`/`DROP`이 보이면 배포 스큐가 있었다는 뜻이니 런북에 경고로 남긴다.

- [ ] **Step 8: swap과 크레딧 모드가 유지되는지 확인**

```bash
ssh dngg 'swapon --show; cat /proc/sys/vm/swappiness'
aws ec2 describe-instance-credit-specifications --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
```

Expected: swap 2GB 활성(fstab 덕분), swappiness 10. t3는 기본이 `unlimited`다.

- [ ] **Step 9: t2.micro로 되돌리기**

```bash
ssh dngg 'cd /usr/local/project/dngg && docker compose stop'
aws ec2 stop-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 wait instance-stopped --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 modify-instance-attribute --instance-id i-0bb00c849769dcb7e --region ap-northeast-2 \
  --instance-type '{"Value":"t2.micro"}'
aws ec2 start-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 wait instance-running --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
sleep 60
curl -s https://dngg.one/api/health/ready; echo
```

Expected: `{"status":"ok","db":"up"}`.

- [ ] **Step 10: 크레딧 모드 재확인 (t2로 돌아오며 초기화됐을 수 있다)**

```bash
aws ec2 describe-instance-credit-specifications --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
```

`standard`로 돌아갔다면 Task 4 Step 2를 다시 실행한다.

- [ ] **Step 11: 런북 완성**

`docs/runbooks/scaling.md`에 다음을 채운다:

- L0~L3 레버 표와 **Task 13에서 확정한** 트리거 임계치
- **L1 실행 절차** — Step 3~6의 명령을 그대로, 선행 조건(배포 스큐 확인)과 함께
- **실측 다운타임** (Step 2~6)
- L1 시 함께 올릴 값: 서버 `.env`에 `DB_POOL_MAX=20` 추가 후 `docker compose up -d backend`
- 스파이크 시 로그인 429가 터질 때: 서버 `.env`에 `SITEWIDE_LOGIN_THROTTLE_LIMIT` 상향 후 `docker compose up -d backend`
- L2·L3의 선행 조건 (설계 문서 1절 인용 — throttler 인메모리 스토리지, cron 중복 발화, `synchronize`)
- 롤백 표 (설계 문서의 롤백 절)
- Task 4의 `unlimited` 비용 상한 계산 근거

- [ ] **Step 12: 낡은 스크립트와 문서 정리**

`optimize-lb.sh`와 `full-stop-dngg.sh`는 **존재하지 않는 로드밸런서**를 참조한다(`optimize-lb.sh`는 실행하면 실패한다). `start-dngg.sh`가 안내하는 접속 URL도 무효다. 네 스크립트에서 LB 관련 부분을 제거하고 안내 문구를 실제 구조(EIP 직결 + 호스트 nginx)에 맞게 고친다.

`CLAUDE.md`와 `PROJECT_CONTEXT.md`의 배포 구조 설명에 **nginx 리버스 프록시 계층**을 추가한다 — 현재 두 문서 모두 이 계층이 빠져 있어 컨테이너 포트가 곧 공개 포트인 것처럼 읽힌다.

- [ ] **Step 13: 커밋과 배포**

```bash
cd /Users/onady/project/dngg
git add docs/runbooks/scaling.md start-dngg.sh stop-dngg.sh full-stop-dngg.sh optimize-lb.sh \
        CLAUDE.md PROJECT_CONTEXT.md
git commit -m "docs: 확장 런북 완성하고 낡은 로드밸런서 참조를 정리

t2.micro↔t3.small 왕복을 실제로 리허설해 다운타임과 절차를 확정했다.
EIP가 유지되는 것과 synchronize가 스키마를 건드리지 않는 것을 확인했다.

optimize-lb.sh와 full-stop-dngg.sh가 이미 삭제된 로드밸런서를 참조하고
있었다. 실제 트래픽 경로는 EIP → 호스트 nginx → 컨테이너이며, 두 문서에
빠져 있던 nginx 계층을 보강한다."

git push origin main
```

> 이 커밋은 `docs/**`·루트 스크립트·마크다운만 바꾸므로 배포를 트리거하지 않는다. `CLAUDE.md`·`PROJECT_CONTEXT.md`도 경로 필터 대상이 아니다.

---

## 완료 기준

설계 문서의 수용 조건 전부가 확인되어야 한다.

- [ ] swap 활성 + `swappiness=10` (Task 3 Step 5)
- [ ] 크레딧 모드 `unlimited` (Task 4 Step 3, Task 14 Step 10에서 재확인)
- [ ] `/health/ready`가 DB 단절 시 실제로 503 (Task 7 Step 6)
- [ ] 알람이 실제로 메일을 보냄 (Task 11 Step 5, Task 12 Step 3)
- [ ] 3010 차단 후에도 사이트 정상 (Task 9 Step 5)
- [ ] pg_dump가 S3에 올라가고 그 덤프에서 복원 성공 + 행 수 일치 (Task 1 Step 6)
- [ ] L1 트리거 임계치가 실측으로 확정됨 (Task 13 Step 9)
- [ ] L1 왕복 리허설 완료, 다운타임 기록, EIP 유지 확인 (Task 14 Step 5~6)
