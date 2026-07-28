"use client";

import { track } from "@/lib/analytics";
import * as S from "../styles/LandingStyles";

// 에셋은 가명화한 로컬 DB에서 새로 캡처해 public/landing/에 커밋한 것이다(Task 1 참고).
// next/image는 쓰지 않는다 — 이 프로젝트에 sharp가 없어서 운영 next start의 이미지
// 최적화 경로가 깨진다.
//
// variant "card"는 능력치 공유 카드다. 스크린샷과 비율이 달라 자르지 않고 렌더한다.
const FEATURES = [
  {
    src: "/landing/record.png",
    alt: "경기 기록 화면 — 선수별 득점·리바운드·어시스트를 터치로 기록하는 모습",
    title: "실시간 터치 기록",
    body: "경기 중에 득점·리바운드·어시스트를 터치로 남깁니다.",
    variant: "shot",
  },
  {
    src: "/landing/rankings.png",
    alt: "랭킹 화면 — 선수별 기록이 순위표로 정리된 모습",
    title: "자동 랭킹",
    body: "기록이 쌓이면 팀 랭킹이 저절로 정리됩니다.",
    variant: "shot",
  },
  {
    src: "/landing/ability.png",
    alt: "선수 능력치 공유 카드 — 6각 레이더 차트와 dn.gg 워터마크",
    title: "6각 능력치",
    body: "선수마다 능력치 카드가 만들어지고 링크 하나로 공유됩니다.",
    variant: "card",
  },
] as const;

export default function LandingHero() {
  return (
    <S.Container>
      <S.Hero>
        <S.Title>동호회 농구, 기억이 아니라 기록으로</S.Title>
        <S.Subtitle>
          경기 끝나고 스탯 정리하느라 남지 마세요. 터치 몇 번이면 랭킹과 6각 능력치가 자동으로
          만들어집니다.
        </S.Subtitle>
        <S.Cta href="/settings" onClick={() => track("landing_cta_click")}>
          무료로 시작하기
        </S.Cta>
      </S.Hero>

      <S.FeatureList>
        {FEATURES.map((feature, index) => {
          const isCard = feature.variant === "card";
          const Image = isCard ? S.CardShot : S.Shot;
          return (
            <S.Feature key={feature.src}>
              {/* width/height를 실제 표시 박스와 같게 둬서 레이아웃 시프트를 막는다.
                  스크린샷은 aspect-ratio 8/5 박스라 800×500, 카드는 자연 비율이라 800×420.
                  첫 장은 화면 안에 들어오므로 eager로 받는다. */}
              <Image
                src={feature.src}
                alt={feature.alt}
                width={800}
                height={isCard ? 420 : 500}
                loading={index === 0 ? "eager" : "lazy"}
              />
              <S.Caption>
                <S.CaptionStrong>{feature.title}</S.CaptionStrong>
                {feature.body}
              </S.Caption>
            </S.Feature>
          );
        })}
      </S.FeatureList>
    </S.Container>
  );
}
