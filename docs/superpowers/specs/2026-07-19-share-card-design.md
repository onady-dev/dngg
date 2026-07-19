# 공유 카드 생성 — 상세 설계 (마케팅 Phase 0 핵심 지렛대)

- 작성일: 2026-07-19
- 상위 전략: `docs/superpowers/specs/2026-07-19-marketing-gtm-design.md`
- 대상: `frontend/`(Next.js 14 App Router)
- 상태: 설계(구현 전)

## 1. 목적

경기 결과·선수 능력치를 **브랜딩된 이미지 카드**로 만들어, 총무·팀원이 카톡 단톡방·밴드·인스타에 공유하면 그 자체가 광고가 되게 한다. 카드에는 `dn.gg` 워터마크 + 딥링크가 박혀, 본 사람이 유입되는 성장 루프의 진입점이다.

## 2. 핵심 통찰 — 한국식 공유는 "링크 공유"

한국 아마추어 팀은 결과를 **카톡 단톡방에 링크로** 공유한다. 카카오톡은 링크의 `og:image`를 미리보기 카드로 자동 렌더한다. 따라서 가장 레버리지가 큰 방식은:

- **동적 OG 이미지**: 공유 가능한 페이지(선수/경기결과/랭킹)에 페이지별 `og:image`를 서버에서 생성 → **어떤 링크 공유든 자동으로 브랜디드 카드가 뜬다.**

여기에 스토리/인스타·직접 이미지 공유용으로:

- **인앱 공유 버튼**: Web Share API로 같은 이미지를 파일 공유(폴백: 다운로드 + 링크 복사).

→ **이미지 소스는 하나**(아래 3.2 이미지 라우트), OG와 인앱 버튼이 공유.

## 3. 아키텍처

### 3.1 렌더링 방식 — `next/og` (ImageResponse)

- Next 14.1 내장 `next/og`의 `ImageResponse`로 JSX → PNG(1200×630) 생성. 별도 무거운 클라 의존성 없음.
- **한글 폰트 임베드 필수**: Satori는 기본 폰트에 한글 글리프가 없어 한글이 두부(□)로 나온다. Pretendard 또는 Noto Sans KR의 서브셋 `.otf/.ttf`를 `fonts` 옵션으로 전달(ArrayBuffer). 파일은 `frontend/public` 또는 fetch로 로드.
- Satori 제약: flexbox 서브셋만(그리드 X), SVG는 제한적 지원. 카드 레이아웃은 이 범위에 맞춘다. 6각 레이더는 인라인 `<svg>`(polygon/line/circle/text) 또는 data-URI `<img>`로 삽입(기존 `RadarChart` 기하 재사용).

**대안(비채택)**: 클라이언트 캔버스(html-to-image류) — 링크 공유 시 OG 미리보기가 안 되고(카톡에서 카드 안 뜸) 의존성 추가. 인앱 저장엔 되지만 루프 핵심(링크 공유)을 못 살림.

### 3.2 이미지 라우트

- 컨벤션 활용: 라우트별 `opengraph-image.tsx`(예: `app/player/[id]/opengraph-image.tsx`) → 해당 페이지의 `og:image`로 자동 연결.
- 또는 공용 라우트 `app/card/[type]/[id]/route.tsx`(type: `ability`|`game`|`daily`)로 통합하고, 각 페이지 `generateMetadata`에서 이 URL을 `og:image`로 지정 + 인앱 버튼도 이 URL 사용. **공용 라우트 권장**(OG·인앱·확장 카드가 한 소스).
- 데이터: 라우트가 서버에서 백엔드 호출(`${NEXT_PUBLIC_API_URL}/player/:id`, `/player/:id/ability` 등)로 카드 데이터 확보.
- 캐싱: `Cache-Control`(예: `s-maxage`)로 크롤러 반복 요청·재계산 완화. 데이터 변경 반영을 위해 URL에 버전/쿼리 옵션.

### 3.3 페이지 메타데이터 연결

- 공유 대상 페이지의 `generateMetadata`(선수 페이지엔 이미 존재)에서:
  - `openGraph.images = [{ url: cardUrl, width:1200, height:630 }]`, `title`, `description`(예: "유승 · 리바운드 상위 20% · dn.gg")
  - `twitter.card = 'summary_large_image'`
- 선수 페이지는 현재 데이터가 클라 페치라 카드 라우트가 자체적으로 서버 데이터를 가져와야 한다(3.2). `generateMetadata`도 최소 데이터(선수명)만 서버 페치.

### 3.4 인앱 공유 버튼

- 선수 상세/데일리/랭킹 화면에 "공유" 버튼.
- 동작: 카드 이미지 URL을 fetch → `navigator.share({ files:[png], text, url })`. 미지원 브라우저는 이미지 다운로드 + 링크 복사 폴백.
- 클릭 시 `share_click` 이벤트 계측(전략 문서 계측 항목과 연결).

## 4. 카드 종류 & 레이아웃

공통: 1200×630, 앱 팔레트(강조 `#2563eb`), 하단에 `dn.gg` 워터마크 + 딥링크 URL.

- **v1 — 선수 능력치 카드(최우선)**: 좌측 선수명·팀(그룹)명·포지션/번호, 우측 6각 레이더 + 상위 축 하이라이트("리바운드 상위 20%"). 자랑·재미 요소로 공유 유인이 가장 큼. 레이더 기하는 기존 `RadarChart` 재사용.
- **v2 — 경기 결과 카드**: 홈/어웨이 팀명·스코어·날짜·MVP.
- **v3 — 데일리/주간 MVP·랭킹 카드**: 상위 N 랭킹 + 데일리 MVP.

## 5. 딥링크 & UTM

- 카드/공유 URL: `https://dngg.one/player/{id}?utm_source=share&utm_medium=card&utm_campaign=ability` (브랜드 표기 "dn.gg", 실제 도메인 dngg.one).
- UTM은 랜딩/가입까지 보존(전략 문서 계측 E와 연동) → 공유→가입 전환 측정.

## 6. 제약 & 리스크

- **한글 폰트 임베드 필수**(누락 시 두부 렌더) — 서브셋으로 용량 관리.
- **Satori CSS/SVG 서브셋** — 레이아웃을 flexbox·제한 SVG로 맞춰야 함(그리드·복잡 CSS 불가).
- **카카오톡 OG 캐시** — 카톡은 미리보기를 공격적으로 캐시. 배포 후 카카오 개발자 디버거로 스크랩 갱신, URL 버전으로 캐시버스팅.
- **Web Share 파일 공유 편차** — iOS Safari 양호, 일부 안드로이드 제한 → 다운로드 폴백 필수.
- **클라 페치 페이지** — OG는 서버 데이터가 필요 → 카드 라우트가 백엔드를 서버에서 호출(3.2). 응답 지연 시 크롤러 타임아웃 주의 → 캐싱·경량 쿼리.

## 7. 단계(구현 순서)

- **P0a (MVP)**: 공용 카드 라우트 + **v1 선수 능력치 카드** + 한글 폰트 임베드 + 선수 페이지 `generateMetadata` og:image 연결. → 링크 공유 시 카톡에 카드 자동 표시.
- **P0b**: 인앱 "공유" 버튼(Web Share + 폴백) + `share_click` 계측.
- **P0c**: v2 경기 결과 · v3 데일리/랭킹 카드 확장.

## 8. 범위 밖(YAGNI)

- 카드 디자인 테마 다양화·커스터마이징 — MVP는 1종 고정.
- 애니메이션/동영상 카드 — 정적 PNG만.
- 서버측 이미지 CDN 최적화 — 초기 트래픽에선 라우트 캐시로 충분.

## 9. 다음 단계

P0a 구현 계획(카드 라우트·폰트·레이더 SVG 임베드·메타데이터) 작성 →
`docs/superpowers/plans/2026-07-19-share-card-p0a.md`
