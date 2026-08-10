#!/usr/bin/env bash
# 5분마다 실행되며 임계치를 넘긴 항목만 SNS로 알린다.
# CloudWatch 에이전트의 커스텀 메트릭은 개당 월 $0.30라 "트래픽 전엔 비용 증가 없음"
# 제약에 걸린다. SNS 이메일 무료 한도(월 1000건) 안에서 자체 처리한다.
set -uo pipefail

TOPIC="${DNGG_SNS_TOPIC:-arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts}"
REGION="${AWS_REGION:-ap-northeast-2}"
ACCESS_LOG="${DNGG_ACCESS_LOG:-/var/log/nginx/access.log}"
STATE_DIR="/var/tmp/dngg-monitor"
mkdir -p "${STATE_DIR}"

# 임계치 — docs/runbooks/scaling.md의 L1 트리거와 같은 값을 쓴다.
MEM_MIN_MB="${DNGG_MEM_MIN_MB:-150}"
DISK_MAX_PCT="${DNGG_DISK_MAX_PCT:-80}"
P95_MAX_SEC="${DNGG_P95_MAX_SEC:-1.0}"
ERR_5XX_MAX_PCT="${DNGG_ERR_5XX_MAX_PCT:-5}"

ALERTS=""
add_alert() { ALERTS="${ALERTS}- $1"$'\n'; }

# 같은 키로 이미 알렸으면 60분간 재알림하지 않는다 — 한 번의 장애로 알림이
# 12통씩 쏟아지면 그 다음부터는 아무도 안 읽는다.
should_alert() {
  local f="${STATE_DIR}/$1"
  if [ -f "${f}" ] && [ "$(( $(date +%s) - $(stat -c %Y "${f}") ))" -lt 3600 ]; then
    return 1
  fi
  touch "${f}"
  return 0
}
clear_alert() { rm -f "${STATE_DIR}/$1"; }

# ── 메모리 ────────────────────────────────────────────────
MEM_AVAIL=$(free -m | awk '/^Mem:/ {print $7}')
if [ "${MEM_AVAIL:-9999}" -lt "${MEM_MIN_MB}" ]; then
  should_alert mem && add_alert "사용 가능 메모리 ${MEM_AVAIL}MB (임계 ${MEM_MIN_MB}MB) — L1 확장 검토"
else
  clear_alert mem
fi

# ── swap 사용량 (메모리 압박의 선행 신호) ──────────────────
SWAP_USED=$(free -m | awk '/^Swap:/ {print $3}')
if [ "${SWAP_USED:-0}" -gt 512 ]; then
  should_alert swap && add_alert "swap 사용량 ${SWAP_USED}MB — 메모리가 부족해 스왑에 의존 중, L1 확장 검토"
else
  clear_alert swap
fi

# ── 디스크 ────────────────────────────────────────────────
DISK_PCT=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "${DISK_PCT:-0}" -gt "${DISK_MAX_PCT}" ]; then
  should_alert disk && add_alert "디스크 사용률 ${DISK_PCT}% (임계 ${DISK_MAX_PCT}%)"
else
  clear_alert disk
fi

# ── 컨테이너 생존 ─────────────────────────────────────────
for c in dngg-backend-1 dngg-frontend-1 postgres; do
  if ! docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true; then
    should_alert "container-$c" && add_alert "컨테이너 ${c}가 실행 중이 아니다"
  else
    clear_alert "container-$c"
  fi
done

# ── nginx 최근 5분: 5xx 비율, p95 응답시간, 429 ────────────
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
          | sort -n | awk '{a[NR]=$1} END{if(NR>0){i=int(NR*0.95); if(i<1)i=1; printf "%.3f", a[i]}}')
    if [ -n "${P95}" ] && awk -v p="${P95}" -v m="${P95_MAX_SEC}" 'BEGIN{exit !(p>m)}'; then
      should_alert p95 && add_alert "최근 5분 p95 응답시간 ${P95}초 (임계 ${P95_MAX_SEC}초) — L1 확장 검토"
    else
      clear_alert p95
    fi

    # 429는 rate limit이 동작한 흔적이다. 소량은 정상(봇 차단)이지만 많으면
    # 정상 사용자를 막고 있을 수 있다 — 특히 CGNAT 뒤의 사용자들.
    C429=$(printf '%s\n' "${RECENT}" | grep -cE '" 429 ' || true)
    if [ "${C429:-0}" -gt 50 ]; then
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
  echo "이상 없음 (mem=${MEM_AVAIL}MB swap=${SWAP_USED}MB disk=${DISK_PCT}%)"
fi
