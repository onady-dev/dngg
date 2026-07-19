import { InjectRepository } from '@nestjs/typeorm';
import { Log } from 'src/entities/Log.entity';
import { Like, QueryRunner, Repository, Raw, Not } from 'typeorm';

export class LogRepository extends Repository<Log> {
  constructor(
    @InjectRepository(Log)
    private logRepository: Repository<Log>,
  ) {
    super(
      logRepository.target,
      logRepository.manager,
      logRepository.queryRunner,
    );
  }

  async findLogsByGameId(gameId: number): Promise<Log[] | null> {
    return this.logRepository.find({
      where: {
        gameId,
      },
      relations: ['logitem', 'player', 'game'],
    });
  }

  async findByGroupId(groupId: number): Promise<Log[] | null> {
    return this.logRepository.find({
      where: {
        groupId,
      },
      relations: ['logitem', 'player'],
    });
  }

  async findByDaily(date: string, groupId: number): Promise<Log[] | null> {
    // 날짜 경계는 DB에 저장된 값의 CAST 기준으로 판정한다.
    // (/log/daily/dates 목록 생성과 같은 표현식 — 기준 불일치 방지)
    // 삭제된 게임의 로그는 제외한다.
    return this.logRepository.find({
      where: {
        groupId: Number(groupId),
        createdAt: Raw((alias) => `CAST(${alias} AS DATE) = :date`, { date }),
        game: { status: Not('DELETED') },
      },
      relations: ['logitem', 'player'],
    });
  }

  async findDailyLogsWithGame(
    date: string,
    groupId: number,
  ): Promise<Log[] | null> {
    return this.logRepository.find({
      where: {
        groupId: Number(groupId),
        createdAt: Raw((alias) => `CAST(${alias} AS DATE) = :date`, { date }),
      },
      relations: ['logitem', 'game', 'player'],
    });
  }

  async findDailyDates(groupId: number): Promise<string[]> {
    // 로그가 실제 존재하는 날짜만, findByDaily와 같은 CAST 기준으로 뽑는다.
    // 삭제된 게임의 로그는 제외한다.
    const rows: { date: string }[] = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.game', 'game')
      .select(`DISTINCT TO_CHAR(CAST(log."createdAt" AS DATE), 'YYYY-MM-DD')`, 'date')
      .where('log.groupId = :groupId', { groupId: Number(groupId) })
      .andWhere(`game.status != 'DELETED'`)
      .orderBy('date', 'DESC')
      .getRawMany();
    return rows.map((row) => row.date);
  }

  async findByGameId(gameId: number): Promise<Log | null> {
    return this.logRepository.findOne({
      where: {
        gameId,
      },
    });
  }

  async findByPlayerId(playerId: number): Promise<Log[] | null> {
    return this.logRepository.find({
      where: {
        playerId,
      },
      relations: ['logitem', 'player', 'game'],
    });
  }

  async findByLogitemId(logitemId: number): Promise<Log | null> {
    return this.logRepository.findOne({
      where: {
        logitemId,
      },
    });
  }

  async findLastLogByGameId(gameId: number): Promise<Log | null> {
    return this.logRepository.findOne({
      where: {
        gameId,
      },
      order: {
        sequence: 'DESC',
      },
    });
  }

  async findLogByGameIdAndSequence(gameId: number, sequence: number): Promise<Log | null> {
    return this.logRepository.findOne({
      where: {
        gameId,
        sequence,
      },
      relations: ['logitem', 'player', 'game'],
    });
  }

  async removeLog(id: number): Promise<void> {
    await this.logRepository.delete(id);
  }

  async emptyLog(
    groupId: number,
    gameId: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.manager.delete(Log, { groupId, gameId });
  }

  async saveLog(log: Log, queryRunner: QueryRunner): Promise<Log> {
    return queryRunner.manager.save(Log, log);
  }

  async findByLogItemIdAndGroupId(
    logitemId: number,
    groupId: number,
  ): Promise<Log[] | null> {
    return this.logRepository.find({
      where: {
        logitemId,
        groupId,
      },
      relations: ['logitem', 'player', 'game'],
    });
  }

  async createLog(log: Log) {
    return this.logRepository.save(log);
  }
}
