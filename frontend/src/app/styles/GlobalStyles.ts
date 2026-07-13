"use client";

import { createGlobalStyle } from "styled-components";

const GlobalStyles = createGlobalStyle`
  :root {
    --primary-color: #007AFF;
    --background-color: #FFFFFF;
    --text-color: #333333;
    --border-color: #E5E5E5;
    --hover-color: #0056b3;
    --header-height: 60px;
  }

  /* 모바일: 헤더가 두 줄(로고+그룹 선택 / 네비게이션)로 표시됨 */
  @media (max-width: 768px) {
    :root {
      --header-height: 98px;
    }
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    background-color: var(--background-color);
    color: var(--text-color);
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    min-height: 100vh;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
  }

  main {
    background-color: var(--background-color);
  }

  ul, li {
    list-style: none;
  }
`;

export default GlobalStyles;
