import { EntityManager } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Logitem } from 'src/entities/Logitem.entity';

// 새 그룹 생성 시 로그 항목(득점/파울 등)을 복제해올 템플릿 그룹.
// 실제 그룹이 아닌 예약 id로, 부팅 시 GroupService.onModuleInit이 기본 항목을 시드한다.
export const TEMPLATE_GROUP_ID = 0;

export const DEFAULT_LOGITEMS: Pick<Logitem, 'name' | 'value'>[] = [
  { name: '어시', value: 0 },
  { name: '리바', value: 0 },
  { name: '스틸', value: 0 },
  { name: '블록', value: 0 },
  { name: '턴오버', value: 0 },
  { name: '파울', value: 0 },
  { name: '3점', value: 3 },
  { name: '2점', value: 2 },
  { name: '자유투1점', value: 1 },
  { name: '자유투2점', value: 2 },
];

// 새 그룹에 로그 항목을 시드한다.
//
// 그룹이 생기는 경로가 두 개(가입 `POST /user`, `POST /group`)라 양쪽에서 부른다.
// EntityManager를 인자로 받는 평범한 함수인 이유가 이것이다 — 가입은 트랜잭션
// 안에서 그룹을 만들므로, 같은 manager를 넘겨 그룹 생성과 원자적으로 묶어야
// "그룹은 생겼는데 항목이 없는" 상태가 생기지 않는다.
//
// 템플릿 그룹(0)을 복제하되 템플릿이 비어 있으면 DEFAULT_LOGITEMS로 폴백한다.
// 부팅 시드는 실패해도 부팅을 막지 않는 설계라(GroupService.onModuleInit), 폴백이
// 없으면 시드가 실패한 인스턴스에서 가입한 그룹이 조용히 빈 채로 남는다.
export async function seedLogitemsForGroup(
  manager: EntityManager,
  groupId: number,
): Promise<void> {
  const templates = await manager.find(Logitem, {
    where: { groupId: TEMPLATE_GROUP_ID },
  });
  const source = templates.length ? templates : DEFAULT_LOGITEMS;
  // 템플릿 행의 id를 그대로 복사하면 save가 UPDATE로 동작해 템플릿 원본을 덮어쓴다.
  const copies = source.map(({ name, value }) =>
    plainToInstance(Logitem, { groupId, name, value }),
  );
  await manager.save(Logitem, copies);
}
