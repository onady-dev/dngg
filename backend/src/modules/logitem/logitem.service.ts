import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Logitem } from 'src/entities/Logitem.entity';
import { PostLogitemRequestDto } from './logitem.request.dto';
import { LogitemRepository } from 'src/repository/config.repository';

@Injectable()
export class LogitemService {
  constructor(private readonly logitemRepository: LogitemRepository) {}

  async getLogitemByGroupId(groupId: number) {
    const result = await this.logitemRepository.findByGroupId(groupId);
    return result;
  }

  async createLogitem(logitem: PostLogitemRequestDto) {
    const logitemInstance = plainToInstance(Logitem, { ...logitem });
    return this.logitemRepository.createLogitem(logitemInstance);
  }
}
