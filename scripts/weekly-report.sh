#!/usr/bin/env bash
# 마케팅 주간 지표를 집계해 SNS로 보낸다. systemd 타이머가 매주 월요일 실행한다.
#
# 이 리포트의 핵심은 "막힌 그룹" 항목이다 — 경기는 만들었는데 로그가 0인 그룹.
# 2026-08 사고(신규 그룹에 logitem 미시드 → 기록 자체가 불가능)가 6개월간
# 발견되지 않은 이유가 이 감지 장치의 부재였다.
set -euo pipefail

PROJECT_DIR="${DNGG_PROJECT_DIR:-/usr/local/project/dngg}"
REGION="${AWS_REGION:-ap-northeast-2}"
TOPIC="${DNGG_SNS_TOPIC:-arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts}"

# 실패 시 SNS로 알린다 — 이 알림이 없으면 "월요일에 메일이 안 왔다"가 "이상 없음"과
# 구분되지 않는다(docker 미기동·컨테이너명 변경·.env 키 변경·컬럼명 변경 등 어떤 이유로
# 실패하든 동일하게 조용히 사라졌었다). 알림 자체가 실패해도(네트워크 등) `|| true`로
# 막아 스크립트 종료 코드를 원인 그대로 유지한다 — 이중 실패로 원인이 가려지지 않게.
notify_failure() {
  local exit_code=$? line=${1:-?}
  aws sns publish --region "${REGION}" --topic-arn "${TOPIC}" \
    --subject "[dngg] 주간 마케팅 리포트 실패" \
    --message "$(date '+%Y-%m-%d %H:%M:%S %Z') weekly-report.sh 실패 (exit ${exit_code}, line ${line}).
원인 확인: ssh dngg 'journalctl -u dngg-weekly-report.service -n 50 --no-pager'" \
    >/dev/null || true
}
trap 'notify_failure ${LINENO}' ERR

set -a
# shellcheck disable=SC1091
. "${PROJECT_DIR}/.env"
set +a

q() {
  docker exec -e PGPASSWORD="${DB_PASSWORD}" postgres \
    psql -U "${DB_USERNAME}" -d "${DB_DATABASE}" -At -F ' | ' -c "$1"
}

# 자기 팀·테스트 그룹은 분석에서 제외한다(설계 §1 "분석에서 제외"). 새 테스트 그룹을
# 만들 때마다 이 스크립트를 고치지 않도록 환경변수로 덮어쓸 수 있게 한다.
#   1  스내치  — 대표 본인 팀(운영 계정 겸용)
#   9  테스트  — QA용
#   12 NE      — 대표 본인 소유(설계 §2 "범위에서 뺀 것" — 실사용 영향 없음)
#   13 sweep   — 테스트
#   15 HP      — 테스트(2026-08-10 실행에서 "즉시 연락"으로 오탐된 이력이 있다)
EXCLUDE_GROUPS="${DNGG_REPORT_EXCLUDE_GROUPS:-1,9,12,13,15}"

# 1) 최근 7일 신규 그룹 (group에는 생성일이 없어 소유 user.createdAt을 대리값으로 쓴다)
#    그룹당 계정이 여러 개인 사례가 실재한다(그룹 1 스내치는 2계정). group by 없이
#    user.createdAt 아무 행이나 걸러내면 (a) 기존 그룹에 최근 멤버가 합류했을 때
#    "신규 그룹"으로 오탐되고 (b) 같은 그룹이 여러 행으로 중복 출력된다. 그룹의
#    가장 이른 user.createdAt(min)을 그룹 생성 시각의 대리값으로 쓴다.
NEW_GROUPS="$(q "
  select g.id, g.name, min(u.\"createdAt\")::date as created
    from \"group\" g join \"user\" u on u.\"groupId\" = g.id
   where g.id not in (${EXCLUDE_GROUPS})
   group by g.id, g.name
  having min(u.\"createdAt\") >= now() - interval '7 days'
   order by min(u.\"createdAt\");")"

# 2) 막힌 그룹(신규 위험) — 최근 14일 내 생성 + 경기 있음 + 로그 0
#    14일인 이유: 동호회 경기 주기가 주 1회 수준이라 7일 창은
#    "아직 안 모인 팀"과 "막힌 팀"을 구분하지 못한다.
#    game은 소프트 삭제(status='DELETED')라 삭제된 경기까지 세면 경기를 만들었다
#    지운 그룹이 오탐된다 — status <> 'DELETED'로 제외한다.
#    NEW_GROUPS와 같은 이유로 min(user.createdAt)을 그룹 생성 시각의 대리값으로 쓴다 —
#    where 절에 걸면 계정이 둘인 그룹은 아무 계정 하나만 최근이어도 걸리는 오탐이 생긴다.
STUCK="$(q "
  select g.id, g.name, count(distinct ga.id) as games
    from \"group\" g
    join \"user\" u on u.\"groupId\" = g.id
    join game ga on ga.\"groupId\" = g.id and ga.status <> 'DELETED'
   where not exists (select 1 from log l where l.\"groupId\" = g.id)
     and g.id not in (${EXCLUDE_GROUPS})
   group by g.id, g.name
  having min(u.\"createdAt\") >= now() - interval '14 days';")"

# 2-1) 누적 막힌 그룹 (창 없음) — 14일을 넘겨 막힌 그룹은 위 STUCK에 영원히 안 잡힌다.
#    game에 createdAt이 없어 그룹 생성 후 경과일 기준 창을 씌울 방법이 없다(사용자가
#    입력하는 date만 있음) — 가입 후 2주 넘어 첫 경기를 만드는 팀(휴가·시즌·주 1회
#    주기)이 막히면 창 있는 쿼리로는 한 번도 안 걸린다. 창 없이 전수 스캔한다.
CHRONIC_STUCK="$(q "
  select g.id, g.name, count(distinct ga.id) as games
    from \"group\" g
    join game ga on ga.\"groupId\" = g.id and ga.status <> 'DELETED'
   where not exists (select 1 from log l where l.\"groupId\" = g.id)
     and g.id not in (${EXCLUDE_GROUPS})
   group by g.id, g.name
   order by g.id;")"

# 2-2) 셋업 미완료 그룹 — 가입은 했는데 선수가 0명 (창 없음)
#    위 두 쿼리는 전부 `join game`이라 **경기를 만든 적 없는 그룹은 구조적으로 안 잡힌다.**
#    실제 이탈은 두 유형이다: (a) 기록하다 막힘 → STUCK이 잡는다 (b) 셋업조차 안 함 →
#    지금까지 아무도 안 봤다. 과거 86ers·NE가 (b)로 사라졌고, 2026-08-10 아웃리치로
#    들어온 그룹 16도 가입 다음날까지 선수 0명이었다. 유입이 늘면 (b)가 더 흔해진다.
#    선수 0명이면 경기도 못 만들므로 선수 수만 보면 충분하다.
SETUP_STALLED="$(q "
  select g.id, g.name, min(u.\"createdAt\")::date as signup
    from \"group\" g join \"user\" u on u.\"groupId\" = g.id
   where not exists (select 1 from player p where p.\"groupId\" = g.id)
     and g.id not in (${EXCLUDE_GROUPS})
   group by g.id, g.name
   order by min(u.\"createdAt\");")"

# 3) 주간 기록 활동 — 지난 7일 로그를 남긴 그룹
ACTIVE="$(q "
  select g.id, g.name, count(*) as logs
    from log l join \"group\" g on g.id = l.\"groupId\"
   where l.\"createdAt\" >= now() - interval '7 days'
     and g.id not in (${EXCLUDE_GROUPS})
   group by g.id, g.name
   order by count(*) desc;")"

# 4) Breakers(그룹 14) 복구 추적 — 복구 메일 발송 후 기록 재개 여부
BREAKERS="$(q "select count(*) from log where \"groupId\" = 14;")"

MESSAGE="$(cat <<EOF
$(date '+%Y-%m-%d') 주간 마케팅 지표

■ 신규 그룹 (최근 7일)
${NEW_GROUPS:-없음}

■ ⚠️ 막힌 그룹 — 경기는 있는데 로그 0 (최근 14일 생성, 신규 위험)
${STUCK:-없음}
  → 있으면 즉시 해당 총무에게 연락. 기록이 아예 불가능한 상태일 수 있다.

■ 누적 막힌 그룹 — 경기는 있는데 로그 0 (생성 시점 무관, 창 없음)
${CHRONIC_STUCK:-없음}
  → 위 "막힌 그룹"보다 넓은 전수 스캔. 14일을 넘겨 막힌 팀도 여기서는 계속 잡힌다.

■ ⚠️ 셋업 미완료 그룹 — 가입했는데 선수 0명
${SETUP_STALLED:-없음}
  → 가입 직후일수록 살릴 확률이 높다. 셋업 지원 1:1 연락 대상.
     경기를 만든 적이 없어 위 "막힌 그룹" 항목에는 절대 안 잡히는 유형이다.

■ 기록 활동 (최근 7일)
${ACTIVE:-없음}

■ Breakers(14) 누적 로그: ${BREAKERS}
  → 0에서 움직이면 복구 성공. 2주 무반응이면 실패 처리.

판단 기준: docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md 5절
해석 방법: docs/runbooks/marketing-metrics.md
EOF
)"

# journal에 지표를 먼저 남긴다 — SNS publish가 여기서 실패해도(위 trap이 실패
# 알림을 보내는 것과 별개로) 이번 주 숫자 자체는 journalctl로 확인 가능해야 한다.
echo "${MESSAGE}"

aws sns publish --region "${REGION}" --topic-arn "${TOPIC}" \
  --subject "[dngg] 주간 마케팅 지표" \
  --message "${MESSAGE}" >/dev/null
