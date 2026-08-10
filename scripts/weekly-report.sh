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

set -a
# shellcheck disable=SC1091
. "${PROJECT_DIR}/.env"
set +a

q() {
  docker exec -e PGPASSWORD="${DB_PASSWORD}" postgres \
    psql -U "${DB_USERNAME}" -d "${DB_DATABASE}" -At -F ' | ' -c "$1"
}

# 1) 최근 7일 신규 그룹 (group에는 생성일이 없어 소유 user.createdAt을 대리값으로 쓴다)
#    그룹당 계정이 여러 개인 사례가 실재한다(그룹 1 스내치는 2계정). group by 없이
#    user.createdAt 아무 행이나 걸러내면 (a) 기존 그룹에 최근 멤버가 합류했을 때
#    "신규 그룹"으로 오탐되고 (b) 같은 그룹이 여러 행으로 중복 출력된다. 그룹의
#    가장 이른 user.createdAt(min)을 그룹 생성 시각의 대리값으로 쓴다.
NEW_GROUPS="$(q "
  select g.id, g.name, min(u.\"createdAt\")::date as created
    from \"group\" g join \"user\" u on u.\"groupId\" = g.id
   group by g.id, g.name
  having min(u.\"createdAt\") >= now() - interval '7 days'
   order by min(u.\"createdAt\");")"

# 2) 막힌 그룹 — 최근 14일 내 생성 + 경기 있음 + 로그 0
#    14일인 이유: 동호회 경기 주기가 주 1회 수준이라 7일 창은
#    "아직 안 모인 팀"과 "막힌 팀"을 구분하지 못한다.
#    NEW_GROUPS와 같은 이유로 min(user.createdAt)을 그룹 생성 시각의 대리값으로 쓴다 —
#    where 절에 걸면 계정이 둘인 그룹은 아무 계정 하나만 최근이어도 걸리는 오탐이 생긴다.
STUCK="$(q "
  select g.id, g.name, count(distinct ga.id) as games
    from \"group\" g
    join \"user\" u on u.\"groupId\" = g.id
    join game ga on ga.\"groupId\" = g.id
   where not exists (select 1 from log l where l.\"groupId\" = g.id)
   group by g.id, g.name
  having min(u.\"createdAt\") >= now() - interval '14 days';")"

# 3) 주간 기록 활동 — 지난 7일 로그를 남긴 그룹
ACTIVE="$(q "
  select g.id, g.name, count(*) as logs
    from log l join \"group\" g on g.id = l.\"groupId\"
   where l.\"createdAt\" >= now() - interval '7 days'
   group by g.id, g.name
   order by count(*) desc;")"

# 4) Breakers(그룹 14) 복구 추적 — 복구 메일 발송 후 기록 재개 여부
BREAKERS="$(q "select count(*) from log where \"groupId\" = 14;")"

MESSAGE="$(cat <<EOF
$(date '+%Y-%m-%d') 주간 마케팅 지표

■ 신규 그룹 (최근 7일)
${NEW_GROUPS:-없음}

■ ⚠️ 막힌 그룹 — 경기는 있는데 로그 0 (최근 14일 생성)
${STUCK:-없음}
  → 있으면 즉시 해당 총무에게 연락. 기록이 아예 불가능한 상태일 수 있다.

■ 기록 활동 (최근 7일)
${ACTIVE:-없음}

■ Breakers(14) 누적 로그: ${BREAKERS}
  → 0에서 움직이면 복구 성공. 2주 무반응이면 실패 처리.

판단 기준: docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md 5절
해석 방법: docs/runbooks/marketing-metrics.md
EOF
)"

aws sns publish --region "${REGION}" --topic-arn "${TOPIC}" \
  --subject "[dngg] 주간 마케팅 지표" \
  --message "${MESSAGE}" >/dev/null

echo "${MESSAGE}"
