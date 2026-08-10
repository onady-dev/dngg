# 마케팅 주간 지표 — 확인과 해석

매주 월요일 09:00(KST) `dngg-weekly-report.timer`가 SNS 메일을 보낸다.
설계·판단 기준: `docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md`

## 항목별 해석

| 항목 | 의미 | 걸렸을 때 할 일 |
|---|---|---|
| 신규 그룹 | 최근 7일 가입 | 5절 판단 기준의 유입 카운트 |
| **막힌 그룹** | 경기는 있는데 로그 0 (최근 14일 생성, 신규 위험) | **즉시 총무에게 연락.** 기록이 불가능한 상태일 수 있다 |
| **누적 막힌 그룹** | 경기는 있는데 로그 0 (생성 시점 무관, 창 없음) | 위 "막힌 그룹"이 놓치는, 가입 2주 이후 첫 경기를 만든 팀까지 잡는다. 늘어나는 건 정상 — 창이 없어 한 번 걸리면 로그가 생길 때까지 계속 남는다 |
| 기록 활동 | 최근 7일 로그를 남긴 그룹 | 로그 100개+ = 경기 한 판을 끝까지 기록 (활성 기준) |
| Breakers(14) | 복구 메일 결과 추적 | 0에서 움직이면 성공. 2주 무반응이면 실패 처리 |

자기 팀·테스트 그룹(기본값: 1·9·12·13·15, `weekly-report.sh`의 `EXCLUDE_GROUPS` 기본값에
있음)은 모든 항목에서 제외된다. 새 테스트 그룹을 하나 더 빼려면 기본값을 저장소의
`scripts/weekly-report.sh`에서 고쳐 재배포하거나(영구·버전관리됨), 서버에서
`sudo systemctl edit dngg-weekly-report.service`로 `[Service]` 섹션에
`Environment=DNGG_REPORT_EXCLUDE_GROUPS=1,9,12,13,15,<새 그룹 id>`를 추가한다(서버 로컬
override — 다음 재설치 때 사라지지 않지만 저장소와 별도로 관리해야 함을 유의). 1회성
확인만 필요하면 수동 실행 시 앞에 붙여도 된다:
`ssh dngg 'sudo DNGG_REPORT_EXCLUDE_GROUPS=... /usr/local/project/dngg/scripts/weekly-report.sh'`

## 월요일에 메일이 안 오면

이 리포트가 실패하면(컨테이너 미기동·`.env` 키 변경·컬럼명 변경 등) `weekly-report.sh`의
`trap ... ERR`가 별도로 "[dngg] 주간 마케팅 리포트 실패" SNS 메일을 보낸다 — 그 메일이
왔다면 원인 확인부터 시작한다. **그 메일도 안 왔다면** (SNS 자체가 안 되는 상황, 혹은
타이머가 아예 안 돈 상황) 아래 순서로 확인한다.

1. 타이머가 돌았는지 확인:
   ```bash
   ssh dngg 'systemctl list-timers dngg-weekly-report.timer --no-pager'
   ```
   `Last` 시각이 지난 월요일보다 훨씬 이전이면 타이머 자체가 안 돈 것 — `docker`·`nginx`처럼
   부팅 자동시작이 풀렸을 가능성을 먼저 의심한다(`systemctl is-enabled dngg-weekly-report.timer`).
2. 최근 실행 로그 확인:
   ```bash
   ssh dngg 'journalctl -u dngg-weekly-report.service -n 50 --no-pager'
   ```
   실패 지점(어느 쿼리에서 죽었는지)이 여기 남는다 — 스크립트가 실패해도 지표 부분까지는
   journal에 echo되므로(publish 실패와 무관하게), 어디까지 계산됐는지도 확인 가능하다.
3. 수동으로 1회 실행해 재현:
   ```bash
   ssh dngg 'sudo /usr/local/project/dngg/scripts/weekly-report.sh'
   ```

## 수동 실행

**주의: 아래 명령은 실제로 SNS 메일을 발송한다.** 지표만 보고 싶으면 결과를 journal이나
터미널 출력으로 확인하고 메일함은 무시해도 되지만, 발송 자체를 막는 옵션은 없다 — 자주
돌리면 실제 발송 메일이 그만큼 늘어난다.

```bash
ssh dngg 'sudo /usr/local/project/dngg/scripts/weekly-report.sh'
```

## 서버 설치·갱신

스크립트나 유닛을 고친 뒤에는 서버에 직접 반영해야 한다 — **CI는 이 파일들을 배포하지 않는다.**

```bash
scp scripts/weekly-report.sh dngg:/tmp/
scp infra/systemd/dngg-weekly-report.* dngg:/tmp/
ssh dngg 'sudo mv /tmp/weekly-report.sh /usr/local/project/dngg/scripts/ && \
  sudo chown root:root /usr/local/project/dngg/scripts/weekly-report.sh && \
  sudo chmod +x /usr/local/project/dngg/scripts/weekly-report.sh && \
  sudo mv /tmp/dngg-weekly-report.* /etc/systemd/system/ && \
  sudo chown root:root /etc/systemd/system/dngg-weekly-report.service /etc/systemd/system/dngg-weekly-report.timer && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now dngg-weekly-report.timer'
```

> `scp`로 `/etc`·`/usr/local`에 직접 쓰면 Permission denied가 난다. `/tmp`를 거쳐 `sudo mv`한다.
>
> 유닛 파일 `chown root:root`는 `docs/runbooks/backup-restore.md`의 기존 설치 절차와 동일한
> 컨벤션이다. 스크립트(`weekly-report.sh`)의 `chown root:root`는 그 절차에는 없는 추가
> 단계인데, 이 서비스가 `User=root`로 남아 있어(→ 2026-08 리뷰에서 확인된 사실:
> `docker exec`·`.env` 읽기 자체에 root가 필요한 건 아니다 — `dngg-backup-db.service`가
> 같은 작업을 `User=ec2-user`로 문제없이 수행한다. root는 관행상 유지 중일 뿐이며, 바꾸려면
> 서버에서 실제 실행 권한을 검증한 뒤에 해야 한다) 유닛과 소유권을 맞춘 것이다. 기능적으로는
> 디렉터리가 이미 root 소유라 실행 여부에는 영향 없다. 기존 스크립트들(`backup-db.sh` 등)은
> 여전히 `ec2-user` 소유로 남아 있어 저장소 전체의 확정된 컨벤션은 아니다.

## 상태 확인

```bash
ssh dngg 'systemctl list-timers dngg-weekly-report.timer --no-pager'
ssh dngg 'journalctl -u dngg-weekly-report.service -n 50 --no-pager'
```
