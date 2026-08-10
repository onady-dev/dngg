import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // 프로세스 생존만 본다. DB가 죽어도 앱이 살아 있으면 200이다.
  @Get()
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  // 실제로 트래픽을 받을 수 있는 상태인지 본다 — DB 연결까지 확인한다.
  @Get('ready')
  async readiness(): Promise<{ status: string; db: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
