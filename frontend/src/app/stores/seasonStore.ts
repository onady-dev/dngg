import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Season } from "@/lib/seasonApi";

// 'all' = 전체(시즌 미지정 경기 포함)
export type SeasonSelection = number | "all";

interface SeasonState {
  // 그룹을 바꿨을 때 이전 그룹의 시즌이 남아 빈 화면이 나오지 않도록 그룹별로 기억한다.
  selectionByGroup: Record<number, SeasonSelection>;
  setSelection: (groupId: number, selection: SeasonSelection) => void;
  getSelection: (groupId: number) => SeasonSelection | undefined;
}

export const useSeasonStore = create<SeasonState>()(
  persist(
    (set, get) => ({
      selectionByGroup: {},
      setSelection: (groupId, selection) =>
        set((state) => ({
          selectionByGroup: { ...state.selectionByGroup, [groupId]: selection },
        })),
      getSelection: (groupId) => get().selectionByGroup[groupId],
    }),
    { name: "season-storage" }
  )
);

// 저장된 선택 → 현재 시즌 → 전체 순으로 해석한다.
// 저장된 시즌이 삭제됐으면 존재 검증에서 걸러져 다음 후보로 넘어간다.
export const resolveSeasonSelection = (
  stored: SeasonSelection | undefined,
  seasons: Season[],
  currentSeasonId: number | null
): SeasonSelection => {
  if (stored === "all") return "all";
  if (typeof stored === "number" && seasons.some((s) => s.id === stored)) {
    return stored;
  }
  if (currentSeasonId !== null && seasons.some((s) => s.id === currentSeasonId)) {
    return currentSeasonId;
  }
  return "all";
};

// API 쿼리 파라미터로 변환한다. 'all'이면 파라미터를 생략한다(= 전체).
export const toSeasonParam = (selection: SeasonSelection): number | undefined =>
  selection === "all" ? undefined : selection;

// 쿼리스트링 조각을 만든다. 예: "&seasonId=42" 또는 ""
export const seasonQuery = (selection: SeasonSelection): string =>
  selection === "all" ? "" : `&seasonId=${selection}`;
