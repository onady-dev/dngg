# 마케팅 주간 지표 — 확인과 해석

매주 월요일 09:00(KST) `dngg-weekly-report.timer`가 SNS 메일을 보낸다.
설계·판단 기준: `docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md`

## 항목별 해석

| 항목 | 의미 | 걸렸을 때 할 일 |
|---|---|---|
| 신규 그룹 | 최근 7일 가입 | 5절 판단 기준의 유입 카운트 |
| **막힌 그룹** | 경기는 있는데 로그 0 | **즉시 총무에게 연락.** 기록이 불가능한 상태일 수 있다 |
| 기록 활동 | 최근 7일 로그를 남긴 그룹 | 로그 100개+ = 경기 한 판을 끝까지 기록 (활성 기준) |
| Breakers(14) | 복구 메일 결과 추적 | 0에서 움직이면 성공. 2주 무반응이면 실패 처리 |

## 수동 실행

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
> 단계다 — `Type=oneshot`/`User=root` 서비스가 실행하는 파일의 소유권을 유닛과 일관되게
> 맞추기 위함이며(기능적으로는 디렉터리가 이미 root 소유라 실행 여부에는 영향 없다),
> 기존 스크립트들(`backup-db.sh` 등)은 여전히 `ec2-user` 소유로 남아 있어 저장소
> 전체의 확정된 컨벤션은 아니다.

## 상태 확인

```bash
ssh dngg 'systemctl list-timers dngg-weekly-report.timer --no-pager'
ssh dngg 'journalctl -u dngg-weekly-report.service -n 50 --no-pager'
```
