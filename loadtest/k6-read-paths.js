import http from 'k6/http';
import { check, sleep } from 'k6';

// 읽기 경로만 태운다. 로그인은 전역 rate limit(5분 300회)이 IP별이 아니라 전역
// 단일 버킷이라, 테스트가 그걸 소진시키면 실제 사용자가 5분간 잠긴다.
//
// 이 테스트를 쏘는 IP는 nginx의 rate limit 예외 목록(infra/nginx/nginx.conf의 geo
// 블록)에 있어야 한다. 아니면 측정되는 건 서버 한계가 아니라 nginx의 429다.
export const options = {
  stages: [
    { duration: '3m', target: 10 },
    { duration: '3m', target: 25 },
    { duration: '3m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // 에러율 5%를 넘으면 즉시 중단한다 — 운영 대상이라 끝까지 밀어붙이지 않는다.
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true }],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE = __ENV.BASE_URL || 'https://dngg.one';

export default function () {
  // 그룹 목록 — 인증 없이 DB를 읽는 실사용 경로
  const groups = http.get(`${BASE}/api/group/all`, {
    tags: { name: 'group/all' },
  });
  check(groups, { 'group/all 200': (r) => r.status === 200 });

  // 커넥션 풀을 거치는 가장 가벼운 DB 왕복 (SELECT 1)
  const health = http.get(`${BASE}/api/health/ready`, {
    tags: { name: 'health/ready' },
  });
  check(health, { 'health/ready 200': (r) => r.status === 200 });

  // 프론트 SSR — 메모리를 가장 많이 쓰는 컨테이너라 함께 태운다
  const front = http.get(`${BASE}/`, { tags: { name: 'frontend' } });
  check(front, { 'frontend 200': (r) => r.status === 200 });

  sleep(1);
}
