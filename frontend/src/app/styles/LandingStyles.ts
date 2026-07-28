import Link from "next/link";
import styled from "styled-components";

export const Container = styled.section`
  margin: var(--header-height) auto 0;
  max-width: 48rem;
  padding: 2.5rem 1rem 3rem;
`;

export const Hero = styled.div`
  text-align: center;
  margin-bottom: 2.5rem;
`;

export const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.35;
  color: var(--text-color);
  margin-bottom: 0.875rem;
  /* 한글이 단어 중간에서 끊기지 않게 한다 */
  word-break: keep-all;

  @media (min-width: 768px) {
    font-size: 2.25rem;
  }
`;

export const Subtitle = styled.p`
  font-size: 1rem;
  line-height: 1.7;
  color: #4a5568;
  margin-bottom: 1.75rem;
  word-break: keep-all;
`;

export const Cta = styled(Link)`
  display: inline-block;
  padding: 0.875rem 2rem;
  background-color: var(--primary-color);
  color: white;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 700;

  &:hover {
    background-color: var(--hover-color);
  }
`;

export const FeatureList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
`;

export const Feature = styled.figure`
  margin: 0;
`;

export const Shot = styled.img`
  display: block;
  width: 100%;
  /* height 속성(500)이 CSS height로 잡히면 aspect-ratio가 무시되고 세로로 긴 박스가
     된다 — 그러면 cover가 가로를 잘라 화면 절반이 날아간다. auto로 풀어줘야 한다. */
  height: auto;
  /* 스크린샷 둘(비율 1.49)을 같은 박스에 맞춘다 — 아래가 잘리고 위쪽이 남는다 */
  aspect-ratio: 8 / 5;
  object-fit: cover;
  object-position: top;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background-color: #f7fafc;
`;

/* 능력치 공유 카드는 비율이 1.90이라 위 박스에 cover로 넣으면 좌우의 dn.gg 워터마크와
   URL이 잘린다. 자르지 않고 자연 비율 그대로 렌더한다. */
export const CardShot = styled.img`
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background-color: #ffffff;
`;

export const Caption = styled.figcaption`
  margin-top: 0.75rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: #4a5568;
  word-break: keep-all;
`;

export const CaptionStrong = styled.strong`
  display: block;
  color: var(--text-color);
  font-weight: 700;
  margin-bottom: 0.25rem;
`;
