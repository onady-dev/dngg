# 확장 런북

최종 갱신: 2026-08-10

관련 문서: [확장 전략 설계](../superpowers/specs/2026-08-10-scaling-strategy-design.md) · [백업·복구 런북](./backup-restore.md)

---

# 🚨 트래픽이 늘었다 — 지금 뭘 해야 하는가

> 이 절만 읽어도 대응이 된다. 배경과 근거는 아래 본문에 있다.

## 0. 상태부터 본다 (1분)

```bash
# 서비스가 살아 있는가
curl -s https://dngg.one/api/health/ready        # {"status":"ok","db":"up"} 여야 정상

# 자원이 실제로 모자란가
ssh dngg 'free -m | head -2; uptime; nproc'
ssh dngg 'docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemPerc}}"'

# 최근 5분 응답시간 p95와 에러 (nginx 실측)
ssh dngg 'sudo tail -n 5000 /var/log/nginx/access.log | grep -E "\[$(date +%d/%b/%Y:%H:%M)" | \
  grep -o "rt=[0-9.]*" | cut -d= -f2 | sort -n | awk "{a[NR]=\$1} END{printf \"건수=%d p95=%.3fs max=%.3fs\n\", NR, a[int(NR*0.95)], a[NR]}"'
ssh dngg 'sudo tail -n 5000 /var/log/nginx/access.log | grep -cE "\" (50[0-9]|429) "'
```

## 1. 판단 — 이 서비스는 CPU가 남는 상태에서 먼저 느려진다

**p95가 1초를 넘는데 CPU 평균이 30% 미만이면 하드웨어를 늘려도 소용없다.**
2026-08-10 실측에서 동시 100명에 CPU 12.7%, 크레딧 무소모인데 p95가 7.2초였다.
범인은 DB 커넥션 풀이었다.

```
p95 > 1초?
├─ CPU 평균 > 40%  ────────────→ [B] 인스턴스를 키운다 (L1)
└─ CPU 여유 (< 30%) ───────────→ [A] 커넥션 풀부터 올린다  ← 대부분 이쪽
```

## [A] 커넥션 풀 올리기 — 재배포 없이 10초, 가장 효과 큰 조치

```bash
ssh dngg
cd /usr/local/project/dngg
sudo sed -i 's/^DB_POOL_MAX=.*/DB_POOL_MAX=60/' .env    # 없으면 새 줄 추가
sudo docker compose up -d backend
docker exec dngg-backend-1 printenv DB_POOL_MAX          # 반영 확인
curl -sf http://127.0.0.1:3010/health/ready
```

현재값 **40**. 실측: 10 → 40으로 올렸을 때 동시 50명 p95가 **3.118초 → 37ms**.
**상한은 Postgres `max_connections`(100).** 앱이 1대인 지금은 60~80까지 여유가 있다.

## [B] 인스턴스 키우기 (L1) — 다운타임 2~3분

t3.small(2 vCPU/2GB)이면 동시 100명에서 p95 10ms, 실패 0건이 실측으로 확인됐다. +$9/월.

**시작 전 반드시:** 배포 스큐 확인(`.env`의 sha == `origin/main` 최신) + 백업.
절차 전문은 아래 "L1 수직 확장 절차" 절. **기동 후 `docker compose up -d`를 잊지 말 것**
(`docker compose stop`으로 내린 컨테이너는 `restart: always`로 살아나지 않는다).

## [C] 그 외 즉시 조치 — 전부 컨테이너 재시작만으로 적용

| 증상 | 조치 |
|---|---|
| 정상 사용자가 로그인에서 **429** | 전역 로그인 한도가 IP별이 아니라 **전역 1버킷**(5분 300회)이다. 스파이크가 스스로를 잠근다.<br>`sudo sed -i 's/^SITEWIDE_LOGIN_THROTTLE_LIMIT=.*/SITEWIDE_LOGIN_THROTTLE_LIMIT=2000/' .env && sudo docker compose up -d backend`<br>(줄이 없으면 추가) |
| 일반 요청에서 **429** 다발 | nginx `limit_req` (api 50r/s, web 100r/s)가 CGNAT 뒤 사용자들을 막는 중일 수 있다. `infra/nginx/nginx.conf`에서 rate를 올리고 `nginx -t && sudo systemctl reload nginx` |
| **502** | 컨테이너가 죽었다. `ssh dngg 'cd /usr/local/project/dngg && sudo docker compose up -d'` |
| 메모리 부족 | swap 2GB가 이미 있어 즉사하지는 않는다. available < 150MB면 L1로 간다 |

## 하지 말 것

- **스파이크가 예상될 때 인스턴스를 껐다 켜지 말 것.** T2는 정지하면 CPU 크레딧을
  전부 잃고 시간당 6씩만 회복한다(최대치까지 하루). 버스트 여력이 없는 상태로 맞게 된다.
- **보안 그룹의 22번을 좁히지 말 것.** CI 배포가 SSH로 서버에 붙는다. 좁히면 배포가
  통째로 막히는데, 백엔드 잡은 초록불이라 **조용히 구버전이 계속 돈다.**
- **`docker compose down -v` 절대 금지.** Postgres 볼륨이 삭제된다.

---

## 요약 — 부하 테스트가 뒤집은 전제

설계 단계에서는 스파이크 시 **CPU 크레딧 소진**과 **메모리 부족(OOM)**이 서비스를 죽일
것으로 보고, 그에 맞춰 L1(수직 확장) 트리거를 잡았다. 실측 결과는 달랐다.

**동시 100명까지 태워도 CPU는 최대 12.7%, 크레딧은 144에서 1도 줄지 않았고, swap은 14MB만
썼다. 그런데도 p95는 7.2초였고 요청이 타임아웃됐다.** 병목은 하드웨어가 아니라
**DB 커넥션 풀 크기(10)**였다.

풀을 40으로 올리자 같은 조건에서 p95가 **3.118초 → 37ms**로 떨어졌다.

→ **수직 확장(L1)은 이 병목을 고치지 못한다.** 트리거와 대응을 아래와 같이 고쳤다.

## 부하 테스트 실측 (2026-08-10)

도구: k6 (`loadtest/k6-read-paths.js`), 로컬 → `https://dngg.one`.
경로: `/api/group/all`, `/api/health/ready`, `/` (SSR). 로그인은 전역 rate limit을
소진시키므로 제외.

> 테스트 출발 IP는 `infra/nginx/nginx.conf`의 `geo` 예외 목록에 있어야 한다.
> 아니면 측정되는 건 서버 한계가 아니라 nginx의 429다.

### 커넥션 풀 10 (기본값)

| 동시 사용자 | median | p95 | p99 | max | 5xx |
|---|---|---|---|---|---|
| ~10 | 2ms | **7ms** | 14ms | 48ms | 0 |
| ~25 | 2ms | **1.03초** | 3.17초 | 32초 | 0 |
| ~50 | 2ms | **3.12초** | 15.8초 | 60초 | 2 |
| ~100 | 2ms | **7.23초** | 60초 | 60초 | 26 |

**median이 전 구간 2ms로 일정한데 p95만 폭발한다.** 용량 부족이 아니라 고정 크기 큐
뒤에서 대기가 쌓이는 신호이고, 꺾이는 지점이 풀 크기 10과 일치한다.

같은 구간의 자원 사용률:

| 지표 | 최대치 | 판단 |
|---|---|---|
| CPU (CloudWatch) | **12.7%** | 여유 |
| CPU (컨테이너 합계) | 31.3% | 여유 |
| CPU 크레딧 | 144 → 144 (**소모 없음**) | 여유 |
| CPUSurplusCreditBalance | 0 | 과금 없음 |
| available 메모리 | 최저 189MB | 여유 |
| swap | 최대 14MB | 거의 미사용 |

### 커넥션 풀 40 (현재 운영값)

동시 50명, 3분:

| | 풀 10 | 풀 40 |
|---|---|---|
| p95 | 3.118초 | **37ms** |
| p90 | — | 19.9ms |
| 처리량 | 27.5 req/s | **36.2 req/s** |
| 메모리 영향 | — | 없음 (available 231MB) |

잔여: 전체의 약 1.5%가 여전히 5초를 넘는다(`/api/group/all` 위주). p95가 37ms라
당장은 문제가 아니지만, 다음 병목 후보로 남겨둔다 — 아래 "미해결" 참고.

## L1~L3 레버와 트리거 (실측 반영)

```
[L0] 현재 + 완충장치         t2.micro 1대, nginx, 컨테이너 3개        $0 추가
      ↓ p95 > 1초가 지속 (아래 판단 순서를 먼저 따를 것)
[L1] 수직 확장               t3.small (2 vCPU / 2GB)                 +$9/월
      ↓ t3.small에서도 CPU 평균 > 40%
[L2] DB 분리                 RDS db.t4g.micro 또는 별도 EC2           +$15~25/월
      ↓ 수직 확장으로 감당 불가
[L3] 앱 다중화               ASG + 코드 제약 3종 해결                 +$20~/월
```

### p95가 1초를 넘었을 때 — 판단 순서

**바로 L1으로 가지 말 것.** 실측상 이 서비스는 CPU가 남는 상태에서 먼저 느려진다.

1. **CPU와 메모리를 먼저 본다.**
   - CPU 평균 < 30%이고 available 메모리 > 200MB인데 느리다 → **하드웨어 문제가 아니다.** 2번으로.
   - CPU가 실제로 높다(평균 > 40%) → L1이 맞다.
2. **커넥션 풀 포화를 의심한다.** 지금까지 확인된 유일한 실제 병목이다.
   ```bash
   # 대기 중인 커넥션이 있는지
   ssh dngg 'cd /usr/local/project/dngg && set -a && . ./.env && set +a && \
     docker exec -e PGPASSWORD="$DB_PASSWORD" postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" \
     -tAc "select state, count(*) from pg_stat_activity group by state"'
   ```
   활성 커넥션이 `DB_POOL_MAX`에 붙어 있으면 풀을 올린다 (아래 절차).
3. 풀을 올려도 안 되면 L1 → L2 순으로 간다.

### ⚠️ 인스턴스를 정지/시작하면 CPU 크레딧이 0으로 초기화된다

T2 인스턴스는 **정지하면 쌓아둔 크레딧을 전부 잃는다.** 다시 켜면 0에서 시작해
시간당 6씩 회복하므로 최대치(144)까지 하루가 걸린다. 실측:

```
15:02 (t3.small)        151.57
15:07 (t2.micro 복귀)     0.04   ← 초기화
15:37                     2.23   ← 시간당 6씩 회복
```

`unlimited` 모드라 잔량이 0이어도 스로틀되지 않고 초과분이 과금될 뿐이므로 위험하지는
않다. 다만 **`start-dngg.sh`로 켠 직후나 L1 전환 직후에는 버스트 여력이 없다는 뜻**이니,
스파이크가 예상되는 시점에 인스턴스를 껐다 켜지 않는 편이 좋다.

이 초기화 때문에 "CPUCreditBalance < 50" 알람은 켤 때마다 8시간씩 울리는 오알람이 되어
2026-08-10에 폐기하고 `CPUSurplusCreditBalance > 0`으로 대체했다.

### 지표별 트리거 (CloudWatch·자체 모니터링)

| 지표 | 임계 | 알람 | 의미 |
|---|---|---|---|
| p95 응답시간 | > 1초 | 자체 스크립트 | **1차 신호.** 위 판단 순서를 따른다 |
| available 메모리 | < 150MB | 자체 스크립트 | 실측상 100 VU에서도 189MB — 도달하면 이례적 |
| swap 사용량 | > 512MB | 자체 스크립트 | 메모리 압박 선행 신호 |
| CPUSurplusCreditBalance | > 0 (15분 지속) | `dngg-cpu-surplus-credits` | baseline(10%)을 넘겨 **초과 크레딧이 과금되기 시작**했다는 뜻. `unlimited` 모드에서 의미 있는 유일한 크레딧 신호 |
| StatusCheckFailed | >= 1 | `dngg-status-check-failed` | 인스턴스 자체 장애 |
| 5xx 비율 | > 5% | 자체 스크립트 | |
| 429 발생 | > 50건/5분 | 자체 스크립트 | rate limit이 CGNAT 뒤 정상 사용자를 막고 있을 수 있다 |

## 커넥션 풀 조정 (가장 효과가 큰 레버)

```bash
ssh dngg
cd /usr/local/project/dngg
sudo sed -i 's/^DB_POOL_MAX=.*/DB_POOL_MAX=60/' .env   # 없으면 새 줄로 추가
sudo docker compose up -d backend
docker exec dngg-backend-1 printenv DB_POOL_MAX        # 반영 확인
curl -sf http://127.0.0.1:3010/health/ready
```

재빌드·재배포가 필요 없다. 컨테이너 재시작만으로 몇 초 안에 적용된다.

**상한:** Postgres `max_connections`가 100이다. 앱 인스턴스가 하나뿐인 지금은 60까지
여유가 있지만, L3(다중화)로 가면 `인스턴스 수 × DB_POOL_MAX < 100`을 지켜야 한다.
넘기면 `too many clients already`로 **전체 장애**가 난다.

**현재 운영값: 40** (서버 `.env`).

## 스파이크 중 즉시 쓸 수 있는 조치

재배포 없이 컨테이너 재시작만으로 되는 것들:

| 증상 | 조치 |
|---|---|
| p95 상승, CPU 여유 | `DB_POOL_MAX` 상향 (위 절차) |
| 정상 사용자가 로그인 429 | `.env`에 `SITEWIDE_LOGIN_THROTTLE_LIMIT=1000` 후 `docker compose up -d backend` |
| 특정 IP 폭주 | nginx `limit_req` zone rate 조정 후 `nginx -t && systemctl reload nginx` |
| 관리자·테스트가 429에 걸림 | `infra/nginx/nginx.conf`의 `geo` 예외 목록에 IP 추가 후 reload |

## L1 수직 확장 절차 (t2.micro → t3.small)

**선행 조건:** 인스턴스 타입 변경은 stop/start이고, 그건 백엔드 재시작이며,
`synchronize: true`는 재시작마다 스키마를 실제 DB에 맞춘다. **배포 스큐가 없는
상태에서만** 진행한다.

```bash
# 0) 선행 확인 — .env의 sha가 origin/main 최신 커밋과 일치하는지
ssh dngg 'grep -E "^FRONTEND_VERSION|^BACKEND_VERSION" /usr/local/project/dngg/.env'
git log --oneline -1 origin/main
ssh dngg 'sudo systemctl start dngg-backup-db.service'   # 백업 먼저

# 1) 정지
ssh dngg 'cd /usr/local/project/dngg && docker compose stop'
aws ec2 stop-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 wait instance-stopped --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2

# 2) 타입 변경
aws ec2 modify-instance-attribute --instance-id i-0bb00c849769dcb7e --region ap-northeast-2 \
  --instance-type '{"Value":"t3.small"}'

# 3) 기동 — EIP가 유지되는지 반드시 확인 (3.34.242.163)
aws ec2 start-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 wait instance-running --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
aws ec2 describe-instances --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2 \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text

# 4) 복구 확인
sleep 60
curl -sf https://dngg.one/api/health/ready
ssh dngg 'docker logs dngg-backend-1 --since 5m 2>&1 | grep -icE "query: (ALTER|CREATE|DROP)"'  # 0이어야 정상
ssh dngg 'swapon --show; nproc; free -m | head -2'

# 5) 함께 올릴 값
ssh dngg 'cd /usr/local/project/dngg && sudo sed -i "s/^DB_POOL_MAX=.*/DB_POOL_MAX=60/" .env && sudo docker compose up -d backend'

# 6) 크레딧 모드 재확인 (t3는 기본이 unlimited, t2로 되돌리면 standard로 돌아갈 수 있음)
aws ec2 describe-instance-credit-specifications --instance-ids i-0bb00c849769dcb7e --region ap-northeast-2
```

**되돌리기:** 같은 절차에서 `t3.small`을 `t2.micro`로 바꾼다.
크레딧 모드는 t3↔t2 왕복 후에도 `unlimited`가 유지되는 것을 확인했지만, 매번 확인한다.

### ⚠️ 컨테이너를 `docker compose stop`으로 내렸다면 반드시 다시 올려야 한다

`restart: always`는 **명시적으로 정지시킨 컨테이너에는 적용되지 않는다.** 위 절차의
1단계에서 `docker compose stop`을 하므로, 기동 후에는 사람이 올려야 한다.

```bash
ssh dngg 'cd /usr/local/project/dngg && sudo docker compose up -d'
```

(단순 재부팅은 다르다 — 명시적 정지가 없었으므로 `restart: always`가 알아서 복구한다.)

## L1 리허설 결과 (2026-08-10)

t2.micro ↔ t3.small 왕복을 실제로 수행했다. **부팅 시 사이트가 스스로 복구되지 않는
버그 2개를 찾아 고쳤다.**

### 찾은 것 — 재부팅하면 사이트가 영영 안 올라왔다

| 유닛 | 발견 당시 | 증상 |
|---|---|---|
| `nginx` | **`disabled`** | 부팅해도 nginx가 안 뜸 → 접속 자체 실패(연결 거부) |
| `docker` | **`disabled`** | 부팅해도 컨테이너가 안 뜸 → nginx는 뜨지만 **502** |

`docker`가 `disabled`인데도 평소 문제가 없어 보였던 이유는 **소켓 활성화** 때문이다.
누군가 `docker ps` 같은 명령을 한 번 실행하면 그때 데몬이 뜨고, `restart: always`
컨테이너가 따라 올라온다. 즉 **사람이 SSH로 들어가 docker를 건드리기 전까지는 사이트가
죽어 있다.** `start-dngg.sh`로 인스턴스를 켜도 마찬가지다.

조치:

```bash
sudo systemctl enable nginx docker containerd
```

검증: 위 조치 후 `systemctl reboot`으로 재부팅 → **수동 개입 없이 41초 만에 완전 복구**.
docker·nginx·컨테이너 3개·타이머 3개 자동 기동, swap·swappiness·`DB_POOL_MAX`·
크레딧 모드 전부 유지.

### 실측 다운타임

| 구간 | 소요 | 비고 |
|---|---|---|
| t2.micro → t3.small | 8분 43초 | 이 중 약 6분이 nginx 미기동 대기 |
| t3.small → t2.micro | 6분 42초 | 이 중 상당 부분이 docker 미기동 대기 |
| 재부팅만 (수정 후) | **41초** | 완전 자동 |

**부팅 버그를 고친 지금, L1 전환의 예상 다운타임은 2~3분이다** (인스턴스 stop/start
약 1분 30초 + 부팅 + 컨테이너 기동). 여기에 `docker compose up -d` 한 번이 더 필요하다.

### 함께 확인한 것

- **EIP가 유지된다** (`3.34.242.163`) — 타입 변경 왕복 후에도 그대로. DNS 갱신 불필요.
- **`synchronize: true`가 스키마를 건드리지 않았다** — 재기동 로그에 `ALTER`/`CREATE`/`DROP` 0건.
- swap(2GB, `fstab`), `swappiness=10`(`sysctl.d`), `DB_POOL_MAX`(서버 `.env`) 모두 영속.
- t3.small의 크레딧 모드는 기본 `unlimited`이고, t2.micro로 되돌린 뒤에도 `unlimited`가 유지됐다.

### t3.small 성능 실측 (풀 40)

| 구성 | 동시 50 p95 | 동시 100 p95 | 실패율 | 처리량 |
|---|---|---|---|---|
| t2.micro + 풀 10 | 3.118초 | 7.229초 | 0.53% | 27.5 req/s |
| t2.micro + 풀 40 | 37ms | (미측정) | 0.68% | 36.2 req/s |
| **t3.small + 풀 40** | **6ms** | **10ms** | **0%** | **200.9 req/s** |

t3.small은 동시 100명에서 60,477건 중 **실패 0건**, CPU 평균 31%. 두 조치가 서로 다른
병목을 푼다 — 풀 확대가 큐 대기를 없애고, vCPU 2개가 남은 꼬리를 없앤다.

**현재는 비용 제약에 따라 t2.micro로 되돌려 둔 상태다.** 마케팅 캠페인 직전에 미리
t3.small로 올려두면 스파이크 당일 다운타임 없이 넘길 수 있다.

## L2·L3의 선행 조건

지금은 문서만 있고 실행 준비는 되어 있지 않다.

**L2 (DB 분리)** — `pg-data` 바인드 마운트에서 관리형 DB로 옮기는 절차는 별도 설계가 필요하다.
`Log.player`·`InGamePlayer.player`의 FK가 의도적으로 제거된 상태라 이전 시 재생성되지
않도록 주의해야 한다.

**L3 (앱 다중화)** — 백엔드를 2대 이상으로 늘리면 다음이 깨진다:

- `LoginThrottlerGuard` — `@nestjs/throttler` 기본 스토리지가 프로세스 메모리 `Map`이라
  인스턴스마다 카운터가 따로 돈다. 유효 한도가 N배로 느슨해지는데 **코드상 감지 신호가
  전혀 없다.** 공유 스토리지(Redis 등)로 옮겨야 한다.
- `subscription-renewal.cron.ts`의 `@Cron(EVERY_DAY_AT_4AM)` — 인스턴스 수만큼 중복 발화.
- `synchronize: true` — 여러 인스턴스가 동시 부팅하며 스키마를 고치려 든다.
- `DB_POOL_MAX × 인스턴스 수 < 100` (Postgres `max_connections`).

## 인프라 참고

```
dngg.one ──DNS(Namecheap)──→ EIP 3.34.242.163 ──→ EC2 t2.micro (ap-northeast-2c)
                                                    └─ nginx (호스트, 80/443, certbot)
                                                         ├─ /      → :3000 frontend (docker)
                                                         └─ /api/  → :3010 backend  (docker)
                                                                       └─ postgres (docker, ./pg-data)
```

**로드밸런서는 없다.** `start-dngg.sh` 등이 참조하는 ALB는 삭제된 지 오래다.

| 항목 | 값 |
|---|---|
| 인스턴스 | `i-0bb00c849769dcb7e` |
| EBS 볼륨 | `vol-090d42ef7023a685e` (gp3 30GB) |
| 보안 그룹 | `sg-035e49b91ab5412e2` |
| EIP | `3.34.242.163` / `eipalloc-00be290ccda3d7421` |
| SNS 알림 토픽 | `arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts` |
| 예산 알람 | `dngg-monthly` ($50, 실제 80% + 예측 100%) |

**SSH는 작업 PC IP에서만 열려 있다.** IP가 바뀌면 접속이 막히는데, 복구는 SSH가 필요 없다:

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id sg-035e49b91ab5412e2 --region ap-northeast-2 \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${MYIP}/32,Description=workstation}]"
```

> AWS의 `Description` 필드는 **ASCII만** 받는다(SG 규칙, DLM 정책 모두). 한글을 넣으면
> `InvalidParameterValue`로 거부되고, 실패해도 뒤따르는 명령이 성공한 것처럼 보일 수 있으니
> 반드시 실제 상태를 조회해 확인한다. 보안 그룹 변경은 **전파에 십수 초** 걸린다.

## 미해결 / 다음 병목 후보

- 풀 40에서도 요청의 약 1.5%가 5초를 넘는다(`/api/group/all` 위주). 풀을 더 올려서
  해결되는지, 아니면 그 엔드포인트 자체가 무거운지 확인이 필요하다.

- **오래된 docker 이미지가 계속 쌓인다.** 배포 워크플로의 `docker image prune -f`는
  dangling 이미지만 지우고 `sha-<커밋>` 태그가 붙은 구버전은 남긴다. 2026-08-10에
  26개(11GB)가 쌓여 디스크가 70%였고, 정리 후 34%가 됐다. 약 2주에 11GB 속도라
  방치하면 두 달 안에 찬다.

  당장의 정리:
  ```bash
  ssh dngg 'cd /usr/local/project/dngg
    IN_USE=$(docker compose ps --format "{{.Image}}")
    KEEP=$(for r in onady/dngg-backend onady/dngg-frontend; do
      docker images "$r" --format "{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}" | sort -r | head -2 | cut -f2
    done)
    docker images --format "{{.Repository}}:{{.Tag}}" | grep "^onady/dngg-" | sort -u > /tmp/all
    printf "%s\n%s\n" "$KEEP" "$IN_USE" | grep -v "^$" | sort -u > /tmp/keep
    comm -23 /tmp/all /tmp/keep | xargs -r docker rmi'
  ```
  (현재 배포본과 직전 버전을 남긴다. 더 이전으로 롤백해야 하면 Docker Hub에서 다시 받는다.)

  근본 해결은 `deploy.yml`의 정리 단계를 태그된 구버전까지 회수하도록 고치는 것이다.

### 보안·설정 관련 (2026-08-10 작업 중 발견, 이번 범위 밖)

- **운영 `.env`에 `TOSS_SECRET_KEY`·`TOSS_WEBHOOK_SECRET`이 없다.** compose가
  `${TOSS_SECRET_KEY}`를 참조하므로 빈 문자열이 주입되고, `docker compose` 실행 시
  경고가 찍힌다. compose 주석대로면 **결제가 조용히 401로 실패하고 가격은 기본값으로
  폴백**된다. 유료화 미시작 상태라 의도된 것으로 보이지만 **유료화 개시 전 반드시
  채워야 한다.**
- **서버 `/usr/local/project/dngg/.env`가 `644`(누구나 읽기 가능)이고
  `JWT_SECRET`·`DB_PASSWORD`가 들어 있다.** 로그인 사용자가 `ec2-user` 하나뿐이라
  실질 위험은 낮지만 `600`으로 좁히는 편이 낫다.
- **보안 그룹의 기존 4개 IP가 모든 프로토콜/포트(-1) 허용이라 Postgres 5432도
  열려 있다.** 좁히면 본인 접근 경로가 막힐 수 있어 손대지 않았다.
- **SSH 22번이 전 세계에 열려 있다** — CI 배포가 SSH에 의존하기 때문이다(위 "하지 말 것"
  참고). 키 전용 인증(`passwordauthentication no`)이라 브루트포스는 통하지 않지만,
  7일간 실패 시도가 3,746건 관측됐다. 닫으려면 SSM 전환이나 러너 IP 자동 등록이
  선행되어야 한다. `PermitRootLogin yes`도 `prohibit-password`로 좁힐 여지가 있다.
- `worker_processes auto`가 1 vCPU에서 nginx 워커 1개를 만든다. L1으로 2 vCPU가 되면
  자동으로 2개가 되지만, 그전까지는 단일 워커가 상한이다.
- 컨테이너 포트가 docker 유저랜드 프록시(`docker-proxy`)를 거친다. 이 오버헤드는
  `docker stats`에 잡히지 않으므로 컨테이너 CPU 측정에서 누락된다.
- 백엔드 Dockerfile이 `node:20`인데 CI는 Node 22다.
