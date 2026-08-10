# 백업·복구 런북

최종 갱신: 2026-08-10

관련 문서: [확장 전략 설계](../superpowers/specs/2026-08-10-scaling-strategy-design.md) · [구현 계획](../superpowers/plans/2026-08-10-scaling-readiness.md)

## 개요

| 대상 | 방법 | 주기 | 보관 | 비용 |
|---|---|---|---|---|
| DB | `pg_dump` → gzip → S3 | 매일 04:10 KST | 30일 | 월 $0.01 미만 |
| 설정 (nginx·.env·compose) | tar.gz → S3 | 매주 일요일 04:30 KST | 30일 | 무시 가능 |
| 시스템 전체 | EBS 스냅샷 (DLM) | 매주 | 4주 | 월 $1~2 |

**S3 버킷:** `dngg-backup-691967102238` (ap-northeast-2)
- 퍼블릭 액세스 전면 차단, SSE-S3(AES256) 기본 암호화, 버전 관리 활성
- 수명주기: 현행 객체 30일, 비현행 버전 7일 후 만료

**권한:** EC2 인스턴스 역할 `dngg-ec2-ses-role`의 인라인 정책 `dngg-backup-and-alerts`
(`s3:PutObject/GetObject/ListBucket` + `sns:Publish`). 인스턴스 프로파일은 `dngg-ec2-ses-profile`.

## 스케줄러는 cron이 아니라 systemd 타이머다

**이 서버(Amazon Linux 2023)에는 cron이 설치되어 있지 않다** — `cronie` 패키지가 없고
`crontab` 명령도, `/etc/cron.d`도 없다. 예약 실행은 전부 systemd 타이머로 한다
(certbot 갱신도 `certbot-renew.timer`로 돌고 있다).

유닛 파일은 `infra/systemd/`에 버전 관리되어 있고, 서버의 `/etc/systemd/system/`에 설치된다.

```bash
# 상태 확인
systemctl list-timers 'dngg-*' --no-pager

# 즉시 1회 실행 (타이머와 무관하게)
sudo systemctl start dngg-backup-db.service

# 로그
sudo journalctl -u dngg-backup-db.service -n 50 --no-pager
```

`Persistent=true`이므로 인스턴스가 꺼져 있어 놓친 실행은 다음 부팅 직후 따라잡는다
(`start-dngg.sh`/`stop-dngg.sh`로 인스턴스를 정지하는 운용과 맞물린다).

## 유닛 설치·갱신

```bash
scp infra/systemd/dngg-*.service infra/systemd/dngg-*.timer dngg:/tmp/
ssh dngg 'sudo mv /tmp/dngg-*.service /tmp/dngg-*.timer /etc/systemd/system/ && \
  sudo chown root:root /etc/systemd/system/dngg-* && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now dngg-backup-db.timer'
```

> 서버의 `/usr/local/project/dngg`는 **root 소유**다. 스크립트 배포는 `/tmp`를 경유해
> `sudo mv`로 설치한다 (`scp`로 직접 쓰면 Permission denied).

## DB 복구

### 1. 복원할 덤프 고르기

```bash
aws s3 ls s3://dngg-backup-691967102238/db/ --region ap-northeast-2 | sort | tail -10
```

### 2. 복원

`restore-db.sh <s3-키> <컨테이너> <DB사용자> <DB이름> <비밀번호>`

**운영 복구 (서버에서):**

```bash
ssh dngg
cd /usr/local/project/dngg
set -a && . ./.env && set +a
# 앱을 먼저 내려 쓰기를 막는다. DB 컨테이너는 살려둔다.
docker compose stop backend frontend
./scripts/restore-db.sh db/dngg-<타임스탬프>.sql.gz postgres "$DB_USERNAME" "$DB_DATABASE" "$DB_PASSWORD"
docker compose start backend frontend
curl -sf http://127.0.0.1:3010/health/ready
```

> 덤프는 `--clean --if-exists`로 떠 있어 복원 시 기존 객체를 지우고 다시 만든다.
> **`docker compose down -v`는 절대 쓰지 말 것** — Postgres 볼륨이 삭제된다.

**로컬 검증용 복원:**

```bash
docker run -d --name dngg-restore-test \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=postgres -e POSTGRES_DB=dngg postgres:15
# pg_isready로 기동 대기 후
./scripts/restore-db.sh db/dngg-<타임스탬프>.sql.gz dngg-restore-test postgres dngg test
docker rm -f dngg-restore-test   # 확인 끝나면 정리
```

### 3. 행 수 대조

복원이 실제로 온전한지 확인한다. 아래 쿼리를 운영과 복원본에서 각각 돌려 비교한다.

```sql
select 'app_setting' as t, count(*) as n from app_setting
union all select 'email_verification', count(*) from email_verification
union all select 'game', count(*) from game
union all select 'group', count(*) from "group"
union all select 'in_game_player', count(*) from in_game_player
union all select 'inquiry', count(*) from inquiry
union all select 'log', count(*) from log
union all select 'logitem', count(*) from logitem
union all select 'payment', count(*) from payment
union all select 'player', count(*) from player
union all select 'subscription', count(*) from subscription
union all select 'team', count(*) from team
union all select 'team_player', count(*) from team_player
union all select 'user', count(*) from "user"
order by t;
```

> `group`과 `user`는 SQL 예약어라 큰따옴표가 필요하다.

## 복구 리허설 기록

| 실시일 | 덤프 | 결과 |
|---|---|---|
| 2026-08-10 | `db/dngg-20260810-130915.sql.gz` (113,807 bytes) | ✅ 14개 테이블 행 수 전부 일치 |

당시 기준값: `log=7627`, `in_game_player=1085`, `player=133`, `logitem=100`, `game=93`,
`team_player=59`, `team=11`, `user=11`, `group=10`, `email_verification=6`, `inquiry=2`,
`app_setting=0`, `payment=0`, `subscription=0`.

**복구해본 적 없는 백업은 백업이 아니다.** 스키마가 크게 바뀌면 리허설을 다시 한다.

## 알려진 사항

- **덤프 크기**: DB 자체는 약 7.4MB인데 gzip 덤프는 약 111KB다. 백업 스크립트의 최소 크기
  가드는 1KB이므로, 덤프가 갑자기 수 KB 이하로 떨어지면 업로드를 막고 실패한다.
- **`.env` 권한**: 서버의 `/usr/local/project/dngg/.env`가 `644`(누구나 읽기 가능)이고
  `JWT_SECRET`·`DB_PASSWORD`·`TOSS_SECRET_KEY`가 들어 있다. 현재 로그인 사용자가
  `ec2-user` 하나뿐이라 실질 위험은 낮지만 `600`으로 좁히는 편이 낫다. 백업 tar에도
  같은 시크릿이 들어가므로 S3 버킷의 퍼블릭 차단이 중요하다.
