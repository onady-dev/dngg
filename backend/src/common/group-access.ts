import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';

// JWT payload의 groupId와 대상 리소스의 groupId가 일치하는지 검증한다.
// 쓰기 엔드포인트는 반드시 이 검증을 거쳐야 한다 (읽기는 공개).
export function assertSameGroup(
  userGroupId: number | string | undefined,
  resourceGroupId: number | string | undefined,
  message = '다른 그룹의 데이터는 수정할 수 없습니다.',
): void {
  if (
    userGroupId === undefined ||
    userGroupId === null ||
    resourceGroupId === undefined ||
    resourceGroupId === null ||
    Number(userGroupId) !== Number(resourceGroupId)
  ) {
    throw new ForbiddenException(message);
  }
}

// 게임을 조회해 요청자 소속 그룹 소유인지 검증하고 반환한다.
export async function findOwnedGame<T extends { groupId: number }>(
  gameRepository: {
    findOne(options: { where: { id: number } }): Promise<T | null>;
  },
  gameId: number,
  userGroupId: number | string | undefined,
): Promise<T> {
  const game = await gameRepository.findOne({ where: { id: gameId } });
  if (!game) {
    throw new NotFoundException('게임을 찾을 수 없습니다.');
  }
  assertSameGroup(userGroupId, game.groupId);
  return game;
}

// id 목록이 모두 해당 그룹 소속 리소스인지 검증한다.
// 존재하지 않는 id나 다른 그룹의 id가 섞여 있으면 거부한다.
export async function assertIdsInGroup(
  repository: { count(options: { where: object }): Promise<number> },
  ids: Array<number | null | undefined>,
  groupId: number | string,
  message: string,
): Promise<void> {
  const uniqueIds = Array.from(
    new Set(ids.filter((id): id is number => id !== null && id !== undefined)),
  );
  if (uniqueIds.length === 0) return;

  const count = await repository.count({
    where: { id: In(uniqueIds), groupId: Number(groupId) },
  });
  if (count !== uniqueIds.length) {
    throw new ForbiddenException(message);
  }
}
