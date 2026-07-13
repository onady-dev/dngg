/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  compiler: {
    // SSR과 클라이언트의 styled-components 클래스명을 일치시켜 hydration 오류를 방지
    styledComponents: true,
  },
};

export default nextConfig;
