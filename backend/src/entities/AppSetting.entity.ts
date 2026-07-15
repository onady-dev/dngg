import { Column, Entity, PrimaryColumn } from 'typeorm';

// 전역 운영 설정 key-value 저장소.
// 유료화 시작 여부는 'monetizationStartedAt' 행의 존재로 판정한다 (단방향 — 삭제 API 없음).
@Entity()
export class AppSetting {
  @PrimaryColumn('varchar')
  key: string;

  @Column('varchar')
  value: string;
}
