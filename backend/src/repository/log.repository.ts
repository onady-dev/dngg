import { InjectRepository } from '@nestjs/typeorm';
import { Log } from 'src/entities/Log.entity';
import { Like, QueryRunner, Repository, Between } from 'typeorm';

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

  async findByDaily(date: Date): Promise<Log[] | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return this.logRepository.find({
      where: {
        createdAt: Between(startOfDay, endOfDay),
      },
      relations: ['logitem', 'player'],
    });
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
