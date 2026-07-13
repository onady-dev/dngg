"use client";

import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Link from "next/link";
import type { Player, Team as TeamType } from "@/types/player";
import PlayerCard from "./components/PlayerCard";
import SelectionActionBar from "./components/SelectionActionBar";
import { useGroupStore } from "../stores/groupStore";
import { api } from "@/lib/axios";
import NoGroupSelected from "../components/NoGroupSelected";
import { useAuthStore } from "../stores/useAuthStore";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useMounted } from "../lib/useMounted";
import {
  bulkUploadTeams,
  createTeam,
  deleteTeam,
  fetchTeams,
  renameTeam,
  resetTeams,
  updateTeamPlayers,
} from "@/lib/teamApi";

const SYNC_DEBOUNCE_MS = 400;

const TeamsPage = () => {
  const { selectedGroup } = useGroupStore();
  const user = useAuthStore((state) => state.user);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const mounted = useMounted();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamType | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNumber, setNewPlayerNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncingTeamIds, setSyncingTeamIds] = useState<Set<number>>(new Set());
  const [longPressedPlayer, setLongPressedPlayer] = useState<Player | null>(null);
  const [isPlayerActionModalOpen, setIsPlayerActionModalOpen] = useState(false);
  const [editingPlayerName, setEditingPlayerName] = useState("");
  const [editingPlayerNumber, setEditingPlayerNumber] = useState("");

  const canManage = !!user && user.groupId === selectedGroup;

  // 팀별 동기화 debounce 타이머와 최신 상태 참조
  const syncTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const teamsRef = useRef<TeamType[]>(teams);
  teamsRef.current = teams;
  const migrationCheckedRef = useRef<number | null>(null);

  // 선수 목록과 팀 구성을 서버에서 로드
  const loadData = async () => {
    if (!selectedGroup) return;

    setLoading(true);
    try {
      const [playersResponse, serverTeams] = await Promise.all([
        api.get(`/player?groupId=${selectedGroup}`),
        fetchTeams(selectedGroup),
      ]);
      const allPlayers: Player[] = playersResponse.data;

      setTeams(serverTeams);

      // 팀에 배정되지 않은 선수만 목록에 표시
      const assignedIds = serverTeams.flatMap((team) => team.players.map((p) => p.id));
      const availablePlayers = allPlayers
        .filter((player) => !assignedIds.includes(player.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(availablePlayers);

      return { allPlayers, serverTeams };
    } catch (error) {
      console.error("데이터를 불러오는데 실패했습니다:", error);
      showToast("팀/선수 정보를 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedGroup) {
      setLoading(false);
      return;
    }
    setSelectedPlayers([]);
    setSearchQuery("");
    loadData();
  }, [selectedGroup]);

  // 예전 버전이 이 기기에 남긴 localStorage 팀 구성을 서버로 1회 이전.
  // zustand persist의 user 복원이 마운트 이후에 끝나므로, 로그인 상태가 준비된 뒤 실행되도록
  // 별도 effect에서 user/loading을 지켜본다.
  useEffect(() => {
    if (!selectedGroup || loading) return;

    const storageKey = `teams_group_${selectedGroup}`;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    // 서버에 이미 팀이 있으면 서버가 진실 — 로컬 잔재는 청소만
    if (teams.length > 0) {
      localStorage.removeItem(storageKey);
      return;
    }

    if (!canManage || !user) return;
    if (migrationCheckedRef.current === selectedGroup) return;
    if (sessionStorage.getItem(`team_migration_dismissed_${selectedGroup}`)) return;
    migrationCheckedRef.current = selectedGroup;

    let localTeams: TeamType[] = [];
    try {
      localTeams = JSON.parse(saved);
    } catch {
      return;
    }
    if (!Array.isArray(localTeams) || localTeams.length === 0) return;

    const runMigration = async () => {
      const ok = await confirm({
        title: "팀 구성 서버로 옮기기",
        message: `이 기기에 저장된 팀 구성 ${localTeams.length}개를 서버로 옮기시겠습니까?\n옮기면 다른 기기에서도 같은 팀 구성을 볼 수 있습니다.`,
        confirmText: "옮기기",
      });
      if (!ok) {
        sessionStorage.setItem(`team_migration_dismissed_${selectedGroup}`, "1");
        return;
      }

      try {
        // 서버 팀이 0개인 시점이므로 players 상태가 그룹의 전체 선수 목록이다
        const validIds = new Set(players.map((p) => p.id));
        const payload = localTeams.map((team) => ({
          name: team.name,
          playerIds: team.players.map((p) => p.id).filter((id) => validIds.has(id)),
        }));
        await bulkUploadTeams(selectedGroup, payload, user.accessToken);
        localStorage.removeItem(storageKey);
        showToast("팀 구성을 서버로 옮겼습니다.", "success");
        await loadData();
      } catch (error) {
        console.error("팀 구성 이전에 실패했습니다:", error);
        showToast("팀 구성 이전에 실패했습니다. 기존 데이터는 보존됩니다.", "error");
      }
    };
    runMigration();
  }, [selectedGroup, loading, user, teams]);

  // 배정 변경을 서버에 반영 (팀별 debounce, 낙관적 업데이트의 후속 동기화)
  const scheduleSync = (teamId: number) => {
    if (!selectedGroup || !user) return;
    const timers = syncTimersRef.current;
    const existing = timers.get(teamId);
    if (existing) clearTimeout(existing);

    setSyncingTeamIds((prev) => new Set(prev).add(teamId));
    timers.set(
      teamId,
      setTimeout(async () => {
        timers.delete(teamId);
        const team = teamsRef.current.find((t) => t.id === teamId);
        if (!team) {
          setSyncingTeamIds((prev) => {
            const next = new Set(prev);
            next.delete(teamId);
            return next;
          });
          return;
        }
        try {
          await updateTeamPlayers(
            teamId,
            selectedGroup,
            team.players.map((p) => p.id),
            user.accessToken
          );
        } catch (error) {
          console.error("팀 구성 저장에 실패했습니다:", error);
          showToast("팀 구성 저장에 실패했습니다. 서버 상태로 되돌립니다.", "error");
          await loadData();
        } finally {
          setSyncingTeamIds((prev) => {
            const next = new Set(prev);
            next.delete(teamId);
            return next;
          });
        }
      }, SYNC_DEBOUNCE_MS)
    );
  };

  // 페이지 이탈 시 대기 중인 동기화를 즉시 실행 (유실 방지)
  useEffect(() => {
    return () => {
      const timers = syncTimersRef.current;
      timers.forEach((timer, teamId) => {
        clearTimeout(timer);
        const team = teamsRef.current.find((t) => t.id === teamId);
        if (team && selectedGroup && user) {
          updateTeamPlayers(
            teamId,
            selectedGroup,
            team.players.map((p) => p.id),
            user.accessToken
          ).catch(() => {});
        }
      });
      timers.clear();
    };
  }, [selectedGroup, user]);

  const handlePlayerClick = (player: Player) => {
    if (!canManage) return;
    if (selectedPlayers.find((p) => p.id === player.id)) {
      setSelectedPlayers(selectedPlayers.filter((p) => p.id !== player.id));
    } else {
      setSelectedPlayers([...selectedPlayers, player]);
    }
  };

  const handlePlayerLongPress = (player: Player) => {
    setLongPressedPlayer(player);
    setEditingPlayerName(player.name);
    setEditingPlayerNumber(player.backnumber?.toString() || "");
    setIsPlayerActionModalOpen(true);
  };

  const handleSavePlayer = async () => {
    if (!canManage || !longPressedPlayer || !user?.accessToken) return;

    try {
      const response = await api.put(`/player/${longPressedPlayer.id}`, {
        groupId: longPressedPlayer.groupId,
        name: editingPlayerName,
        backnumber: editingPlayerNumber ? editingPlayerNumber : null,
      }, {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      });
      const updatedPlayer = response.data;

      // 선수 목록 업데이트
      setPlayers(players.map(p =>
        p.id === longPressedPlayer.id ? updatedPlayer : p
      ).sort((a, b) => a.name.localeCompare(b.name)));

      // 팀에서도 해당 선수 정보 업데이트 (서버 관계는 id 기준이라 별도 동기화 불필요)
      setTeams(teams.map(team => ({
        ...team,
        players: team.players.map(p =>
          p.id === longPressedPlayer.id ? updatedPlayer : p
        ),
      })));

      setIsPlayerActionModalOpen(false);
      setLongPressedPlayer(null);
      showToast("선수 정보가 수정되었습니다.", "success");
    } catch (error) {
      console.error("선수 정보 수정에 실패했습니다:", error);
      showToast("선수 정보 수정에 실패했습니다.", "error");
    }
  };

  const handleDeletePlayer = async () => {
    if (!canManage || !longPressedPlayer || !user?.accessToken) return;

    const ok = await confirm({
      title: "선수 삭제",
      message: `${longPressedPlayer.name} 선수를 삭제하시겠습니까?\n삭제 후에는 되돌릴 수 없습니다.`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.delete(`/player/${longPressedPlayer.id}`, {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      });

      // 선수 목록/팀에서 제거 (서버는 조회 시 삭제된 선수를 자동 제외)
      setPlayers(players.filter((p) => p.id !== longPressedPlayer.id));
      setTeams(teams.map((team) => ({
        ...team,
        players: team.players.filter((p) => p.id !== longPressedPlayer.id),
      })));

      setIsPlayerActionModalOpen(false);
      setLongPressedPlayer(null);
      showToast("선수가 삭제되었습니다.", "success");
    } catch (error) {
      console.error("선수 삭제에 실패했습니다:", error);
      showToast("선수 삭제에 실패했습니다.", "error");
    }
  };

  const handleAddToTeam = (teamId: number) => {
    if (!canManage || selectedPlayers.length === 0) return;
    const updatedTeams = teams.map((team) => {
      if (team.id === teamId) {
        return {
          ...team,
          players: [...team.players, ...selectedPlayers],
        };
      }
      return team;
    });
    setTeams(updatedTeams);
    setPlayers(players.filter((p) => !selectedPlayers.find((sp) => sp.id === p.id)).sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedPlayers([]);
    scheduleSync(teamId);
  };

  const handleRemoveFromTeam = (teamId: number, player: Player) => {
    if (!canManage) return;
    const updatedTeams = teams.map((team) => {
      if (team.id === teamId) {
        return {
          ...team,
          players: team.players.filter((p) => p.id !== player.id),
        };
      }
      return team;
    });
    setTeams(updatedTeams);
    setPlayers([...players, player].sort((a, b) => a.name.localeCompare(b.name)));
    scheduleSync(teamId);
  };

  const handleAddPlayer = async () => {
    if (!canManage || !selectedGroup || !newPlayerName) return;

    try {
      const response = await api.post("/player", {
        groupId: selectedGroup,
        name: newPlayerName,
        backnumber: newPlayerNumber,
      }, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });
      setPlayers([...players, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setIsAddModalOpen(false);
      setNewPlayerName("");
      setNewPlayerNumber("");
      showToast(`${response.data.name} 선수가 추가되었습니다.`, "success");
    } catch (error) {
      console.error("선수 추가에 실패했습니다:", error);
      showToast("선수 추가에 실패했습니다. 로그인 상태를 확인해주세요.", "error");
    }
  };

  const openAddTeamModal = () => {
    setEditingTeam(null);
    setNewTeamName("");
    setIsTeamModalOpen(true);
  };

  const openRenameTeamModal = (team: TeamType) => {
    setEditingTeam(team);
    setNewTeamName(team.name);
    setIsTeamModalOpen(true);
  };

  const handleSubmitTeamModal = async () => {
    if (!canManage || !selectedGroup || !user || !newTeamName.trim()) return;

    try {
      if (editingTeam) {
        const updated = await renameTeam(editingTeam.id, selectedGroup, newTeamName.trim(), user.accessToken);
        setTeams(teams.map((team) => (team.id === editingTeam.id ? { ...team, name: updated?.name ?? newTeamName.trim() } : team)));
        showToast("팀 이름이 변경되었습니다.", "success");
      } else {
        const created = await createTeam(selectedGroup, newTeamName.trim(), user.accessToken);
        setTeams([...teams, { ...created, players: created.players ?? [] }]);
        showToast(`${created.name} 팀이 추가되었습니다.`, "success");
      }
      setNewTeamName("");
      setEditingTeam(null);
      setIsTeamModalOpen(false);
    } catch (error: any) {
      console.error("팀 저장에 실패했습니다:", error);
      if (error?.response?.status === 400) {
        showToast("같은 이름의 팀이 이미 있습니다.", "error");
      } else {
        showToast("팀 저장에 실패했습니다. 다시 시도해주세요.", "error");
      }
    }
  };

  const handleDeleteTeam = async (team: TeamType) => {
    if (!canManage || !selectedGroup || !user) return;
    const ok = await confirm({
      title: "팀 삭제",
      message: `${team.name} 팀을 삭제하시겠습니까?${team.players.length > 0 ? `\n소속 선수 ${team.players.length}명은 미배정 상태로 돌아갑니다.` : ""}`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteTeam(team.id, selectedGroup, user.accessToken);
      setTeams(teams.filter((t) => t.id !== team.id));
      setPlayers([...players, ...team.players].sort((a, b) => a.name.localeCompare(b.name)));
      showToast(`${team.name} 팀이 삭제되었습니다.`, "success");
    } catch (error) {
      console.error("팀 삭제에 실패했습니다:", error);
      showToast("팀 삭제에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  const handleResetTeams = async () => {
    if (!canManage || !selectedGroup || !user) return;
    const ok = await confirm({
      title: "팀 구성 초기화",
      message: "모든 팀과 선수 배정이 초기화됩니다.\n선수 명단은 유지되며, 팀 구성만 삭제됩니다.",
      confirmText: "초기화",
      danger: true,
    });
    if (!ok) return;

    try {
      await resetTeams(selectedGroup, user.accessToken);
      setTeams([]);
      const response = await api.get(`/player?groupId=${selectedGroup}`);
      setPlayers(response.data.sort((a: Player, b: Player) => a.name.localeCompare(b.name)));
      showToast("팀 구성이 초기화되었습니다.", "success");
    } catch (error) {
      console.error("팀 구성 초기화에 실패했습니다:", error);
      showToast("팀 구성 초기화에 실패했습니다.", "error");
    }
  };

  const filteredPlayers = searchQuery.trim()
    ? players.filter((player) => player.name.includes(searchQuery.trim()))
    : players;

  const isSyncing = syncingTeamIds.size > 0;

  if (!mounted) return null;

  if (!selectedGroup) {
    return <NoGroupSelected />;
  }

  if (loading) return <LoadingText>로딩 중...</LoadingText>;

  return (
    <Container $hasSelection={selectedPlayers.length > 0}>
      <Header>
        <Title>팀 관리</Title>
        <ButtonGroup>
          <AddPlayerButton onClick={() => setIsAddModalOpen(true)} disabled={!canManage}>선수 추가</AddPlayerButton>
          <AddTeamButton onClick={openAddTeamModal} disabled={!canManage}>팀 추가</AddTeamButton>
          <ResetButton onClick={handleResetTeams} disabled={!canManage || teams.length === 0}>팀 구성 초기화</ResetButton>
        </ButtonGroup>
      </Header>

      {!canManage && (
        <LoginBanner>
          <span>
            {user
              ? "내 소속 그룹을 선택하면 선수를 추가하고 팀을 구성할 수 있습니다."
              : "선수 추가·팀 구성은 로그인이 필요합니다. 팀 구성은 조회만 가능합니다."}
          </span>
          {!user && <Link href="/settings">로그인하기</Link>}
        </LoginBanner>
      )}

      <Content>
        <Section>
          <SectionTitleRow>
            <SectionTitle>선수 목록</SectionTitle>
            {players.length > 0 && (
              <SearchInput
                type="search"
                placeholder="선수 이름 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="선수 이름 검색"
              />
            )}
          </SectionTitleRow>
          {players.length === 0 ? (
            <EmptyGuide>
              {teams.some((team) => team.players.length > 0)
                ? "모든 선수가 팀에 배정되었습니다."
                : (
                  <>
                    아직 등록된 선수가 없습니다.
                    {canManage && (
                      <>
                        <br />
                        상단의 <strong>선수 추가</strong> 버튼으로 선수를 등록해보세요.
                      </>
                    )}
                  </>
                )}
            </EmptyGuide>
          ) : (
            <>
              {canManage && (
                <SectionHint>선수를 클릭해 선택하면 하단에 팀 배정 바가 나타납니다. 수정·삭제는 ⋯ 버튼을 누르세요.</SectionHint>
              )}
              {filteredPlayers.length === 0 ? (
                <EmptyGuide>{`"${searchQuery}"에 해당하는 선수가 없습니다.`}</EmptyGuide>
              ) : (
                <PlayerList>
                  {filteredPlayers.map((player) => (
                    <PlayerCard key={player.id} player={player} isSelected={selectedPlayers.some((p) => p.id === player.id)} onClick={() => handlePlayerClick(player)} onLongPress={canManage ? () => handlePlayerLongPress(player) : undefined} />
                  ))}
                </PlayerList>
              )}
            </>
          )}
        </Section>
        <Section>
          <SectionTitleRow>
            <SectionTitle>팀 구성</SectionTitle>
            {isSyncing && <SyncBadge>저장 중…</SyncBadge>}
          </SectionTitleRow>
          {teams.length === 0 ? (
            <EmptyGuide>
              아직 만들어진 팀이 없습니다.
              {canManage && (
                <>
                  <br />
                  상단의 <strong>팀 추가</strong> 버튼으로 팀을 만들고, 선수 목록에서 선수를 선택해 배정하세요.
                </>
              )}
            </EmptyGuide>
          ) : (
            <TeamContainer>
              {teams.map((team) => (
                <Team key={team.id}>
                  <TeamHeader>
                    <TeamTitle>
                      {team.name} <TeamCount>({team.players.length}명)</TeamCount>
                    </TeamTitle>
                    {canManage && (
                      <TeamHeaderActions>
                        <TeamIconButton aria-label={`${team.name} 이름 수정`} title="이름 수정" onClick={() => openRenameTeamModal(team)}>
                          ✎
                        </TeamIconButton>
                        <TeamIconButton aria-label={`${team.name} 팀 삭제`} title="팀 삭제" $danger onClick={() => handleDeleteTeam(team)}>
                          🗑
                        </TeamIconButton>
                      </TeamHeaderActions>
                    )}
                  </TeamHeader>
                  {team.players.length === 0 ? (
                    <TeamEmptyText>선수 목록에서 선수를 선택해 배정하세요.</TeamEmptyText>
                  ) : (
                    <TeamPlayerList>
                      {team.players.map((player) => (
                        <PlayerCard
                          key={player.id}
                          player={player}
                          onLongPress={canManage ? () => handlePlayerLongPress(player) : undefined}
                          onRemove={canManage ? () => handleRemoveFromTeam(team.id, player) : undefined}
                        />
                      ))}
                    </TeamPlayerList>
                  )}
                </Team>
              ))}
            </TeamContainer>
          )}
        </Section>
      </Content>

      {canManage && (
        <SelectionActionBar
          count={selectedPlayers.length}
          teams={teams}
          onAssign={handleAddToTeam}
          onClear={() => setSelectedPlayers([])}
          onAddTeam={openAddTeamModal}
        />
      )}

      {isAddModalOpen && (
        <Modal onClick={() => setIsAddModalOpen(false)}>
          <ModalContent role="dialog" aria-modal="true" aria-label="선수 추가" onClick={(e) => e.stopPropagation()}>
            <ModalTitle>선수 추가</ModalTitle>
            <Input type="text" placeholder="선수 이름" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} />
            <Input type="number" placeholder="등번호" value={newPlayerNumber} onChange={(e) => setNewPlayerNumber(e.target.value)} />
            <ModalButtons>
              <ModalButton onClick={handleAddPlayer}>추가</ModalButton>
              <ModalButton onClick={() => setIsAddModalOpen(false)}>취소</ModalButton>
            </ModalButtons>
          </ModalContent>
        </Modal>
      )}

      {isTeamModalOpen && (
        <Modal onClick={() => setIsTeamModalOpen(false)}>
          <ModalContent role="dialog" aria-modal="true" aria-label={editingTeam ? "팀 이름 수정" : "팀 추가"} onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{editingTeam ? "팀 이름 수정" : "팀 추가"}</ModalTitle>
            <Input type="text" placeholder="팀 이름" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
            <ModalButtons>
              <ModalButton onClick={handleSubmitTeamModal}>{editingTeam ? "저장" : "추가"}</ModalButton>
              <ModalButton onClick={() => setIsTeamModalOpen(false)}>취소</ModalButton>
            </ModalButtons>
          </ModalContent>
        </Modal>
      )}

      {isPlayerActionModalOpen && longPressedPlayer && (
        <Modal onClick={() => setIsPlayerActionModalOpen(false)}>
          <ModalContent role="dialog" aria-modal="true" aria-label="선수 정보" onClick={(e) => e.stopPropagation()}>
            <ModalTitle>선수 정보</ModalTitle>
            <div>
              <label><strong>이름:</strong></label>
              <Input
                type="text"
                value={editingPlayerName}
                onChange={(e) => setEditingPlayerName(e.target.value)}
              />
            </div>
            <div>
              <label><strong>등번호:</strong></label>
              <Input
                type="number"
                value={editingPlayerNumber}
                onChange={(e) => setEditingPlayerNumber(e.target.value)}
              />
            </div>
            <ModalButtons>
              <ModalButton onClick={handleSavePlayer}>저장</ModalButton>
              <ModalButton onClick={handleDeletePlayer}>삭제</ModalButton>
              <ModalButton onClick={() => setIsPlayerActionModalOpen(false)}>취소</ModalButton>
            </ModalButtons>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};

export default TeamsPage;

const Container = styled.div<{ $hasSelection?: boolean }>`
  padding: 1rem;
  margin-top: calc(var(--header-height) + 4px);
  /* 하단 고정 배정 바에 콘텐츠가 가리지 않도록 여백 확보 */
  padding-bottom: ${(props) => (props.$hasSelection ? "6rem" : "1rem")};

  @media (min-width: 768px) {
    padding: 1.5rem;
    padding-bottom: ${(props) => (props.$hasSelection ? "6rem" : "1.5rem")};
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  position: relative;
  z-index: 10;
  align-items: center;

  @media (min-width: 768px) {
    flex-wrap: nowrap;
    justify-content: space-between;
    gap: 2rem;
  }
`;

const Title = styled.h1`
  font-size: 1.25rem;
  font-weight: bold;
  white-space: nowrap;

  @media (min-width: 768px) {
    font-size: 1.5rem;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 1;
  justify-content: flex-end;

  @media (min-width: 768px) {
    flex-wrap: nowrap;
  }
`;

const Button = styled.button`
  padding: 0.4rem 0.6rem;
  border-radius: 0.5rem;
  font-size: 0.813rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex: 0 0 auto;

  @media (min-width: 768px) {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LoadingText = styled.div`
  margin-top: 6rem;
  text-align: center;
  color: #6b7280;
`;

const LoginBanner = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background-color: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #1e40af;

  a {
    background-color: var(--primary-color);
    color: white;
    padding: 0.375rem 0.875rem;
    border-radius: 0.375rem;
    font-weight: 500;
    white-space: nowrap;

    &:hover {
      background-color: var(--hover-color);
    }
  }
`;

const EmptyGuide = styled.div`
  text-align: center;
  padding: 2rem 1rem;
  color: #6b7280;
  font-size: 0.9375rem;
  line-height: 1.6;
`;

const SectionHint = styled.p`
  font-size: 0.8125rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
`;

const AddPlayerButton = styled(Button)`
  background-color: #4CAF50;
  color: white;
  border: none;

  &:hover:not(:disabled) {
    background-color: #45a049;
  }
`;

const AddTeamButton = styled(Button)`
  background-color: #2196F3;
  color: white;
  border: none;

  &:hover:not(:disabled) {
    background-color: #1e88e5;
  }
`;

const ResetButton = styled(Button)`
  background-color: #f44336;
  color: white;
  border: none;

  &:hover:not(:disabled) {
    background-color: #e53935;
  }
`;

const TeamHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  gap: 0.5rem;
`;

const TeamHeaderActions = styled.div`
  display: flex;
  gap: 0.25rem;
`;

const TeamIconButton = styled.button<{ $danger?: boolean }>`
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: ${(props) => (props.$danger ? "#dc2626" : "#6b7280")};

  &:hover {
    background-color: ${(props) => (props.$danger ? "#fee2e2" : "#e5e7eb")};
  }
`;

const TeamCount = styled.span`
  font-size: 0.8125rem;
  font-weight: 500;
  color: #9ca3af;
`;

const TeamEmptyText = styled.p`
  font-size: 0.8125rem;
  color: #9ca3af;
  padding: 0.5rem 0.25rem;
`;

const SyncBadge = styled.span`
  font-size: 0.75rem;
  color: #9ca3af;
  font-weight: 500;
`;

const Content = styled.div`
  display: grid;
  gap: 1rem;

  @media (min-width: 768px) {
    gap: 1.5rem;
  }
`;

const Section = styled.section`
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  @media (min-width: 768px) {
    padding: 1.25rem;
  }
`;

const SectionTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color);
`;

const SearchInput = styled.input`
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  width: 100%;
  max-width: 220px;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const PlayerList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 0.375rem;
  padding: 0.25rem;

  @media (min-width: 640px) {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
    padding: 0.75rem;
  }
`;

const TeamContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }
`;

const Team = styled.div`
  background: #f8fafc;
  border-radius: 0.375rem;
  padding: 0.5rem;

  @media (min-width: 640px) {
    padding: 0.75rem;
  }
`;

const TeamTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
`;

const TeamPlayerList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 0.375rem;

  @media (min-width: 640px) {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
`;

const ModalContent = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 0.5rem;
  width: 100%;
  max-width: 400px;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
`;

const ModalButton = styled.button`
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;

  &.primary {
    background-color: var(--primary-color);
    color: white;
    border: none;

    &:hover {
      background-color: var(--primary-dark);
    }
  }

  &.secondary {
    background-color: transparent;
    color: var(--text-color);
    border: 1px solid var(--border-color);

    &:hover {
      background-color: var(--bg-hover);
    }
  }
`;
