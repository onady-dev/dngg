import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSequenceToLog1709123456789 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 기존 로그 데이터에 대해 sequence 값을 설정
        await queryRunner.query(`
            WITH ranked_logs AS (
                SELECT id, 
                       ROW_NUMBER() OVER (PARTITION BY "gameId" ORDER BY "createdAt") as seq
                FROM log
            )
            UPDATE log
            SET sequence = ranked_logs.seq
            FROM ranked_logs
            WHERE log.id = ranked_logs.id
        `);

        // sequence 컬럼을 NOT NULL로 변경
        await queryRunner.query(`
            ALTER TABLE log ALTER COLUMN sequence SET NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // sequence 컬럼을 nullable로 변경
        await queryRunner.query(`
            ALTER TABLE log ALTER COLUMN sequence DROP NOT NULL
        `);
    }
} 