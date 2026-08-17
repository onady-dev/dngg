import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
@Entity()
@Unique(['name'])
export class Group {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 20 })
  name: string;

  @Column('boolean', { default: false })
  isDeleted: boolean;

  // 무료 경기 생성 누적 횟수 (삭제-재생성 우회 방지 — 감소하지 않음)
  @Column('int', { default: 0 })
  freeGamesUsed: number;

  // 토스 SDK 호출용 무작위 UUID (billingKey와 달리 응답 노출 가능)
  @Column('varchar', { nullable: true })
  customerKey: string;

  // 현재 시즌. 그룹당 하나이므로 Season.isCurrent 대신 여기에 둔다(단일 진실).
  // FK를 만들지 않는다 — 시즌 삭제 시 서비스가 null로 정리한다.
  @Column('int', { nullable: true })
  currentSeasonId: number | null;
}
