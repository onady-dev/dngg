"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GroupPlayer } from "./types";
import * as S from "./styles/PlayerDetailStyles";

interface PlayerSwitcherProps {
  players: GroupPlayer[];
  currentPlayerId: number;
}

export default function PlayerSwitcher({ players, currentPlayerId }: PlayerSwitcherProps) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // 현재 선수를 제외한 같은 그룹 선수 (이름 가나다순)
  const others = useMemo(
    () =>
      players
        .filter((p) => p.id !== currentPlayerId)
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [players, currentPlayerId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return others;
    return others.filter((p) => p.name.toLowerCase().includes(q));
  }, [others, query]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // 다른 선수가 없으면 렌더하지 않는다
  if (others.length === 0) return null;

  const goTo = (id: number) => {
    setQuery("");
    setOpen(false);
    router.push(`/player/${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const target = filtered[highlight];
      if (target) goTo(target.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <S.SwitcherWrap ref={wrapRef}>
      <S.SwitcherInput
        type="text"
        value={query}
        placeholder="다른 선수 검색…"
        aria-label="다른 선수 검색"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <S.SwitcherDropdown role="listbox">
          {filtered.length === 0 ? (
            <S.SwitcherEmpty>일치하는 선수가 없습니다</S.SwitcherEmpty>
          ) : (
            filtered.map((p, i) => (
              <S.SwitcherItem
                key={p.id}
                role="option"
                aria-selected={i === highlight}
                isActive={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => goTo(p.id)}
              >
                <span>{p.name}</span>
                {p.backnumber != null && p.backnumber !== "" && (
                  <span className="num">#{p.backnumber}</span>
                )}
              </S.SwitcherItem>
            ))
          )}
        </S.SwitcherDropdown>
      )}
    </S.SwitcherWrap>
  );
}
