import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Inquiry } from 'src/entities/Inquiry.entity';
import { MailService } from '../mail/mail.service';
import { InquiryStatus, InquiryType } from './inquiry.constants';
import { AnswerInquiryDto, CreateInquiryDto } from './inquiry.request.dto';

// 관리자 전용 응답 — authorEmail을 포함한다.
export interface InquiryAdminRow {
  id: number;
  type: InquiryType;
  content: string;
  authorEmail: string;
  status: InquiryStatus;
  answer: string | null;
  answeredAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class InquiryService {
  private readonly logger = new Logger(InquiryService.name);

  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiryRepo: Repository<Inquiry>,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  // authorEmail·userId·status는 클라이언트 입력이 아니라 서버가 채운다.
  async create(
    author: { userId: number; email: string },
    dto: CreateInquiryDto,
  ): Promise<{ id: number; createdAt: Date }> {
    const saved = await this.inquiryRepo.save(
      this.inquiryRepo.create({
        userId: author.userId,
        authorEmail: author.email,
        type: dto.type,
        content: dto.content,
        status: 'pending',
      }),
    );
    return { id: saved.id, createdAt: saved.createdAt };
  }

  async list(status?: InquiryStatus): Promise<InquiryAdminRow[]> {
    const rows = await this.inquiryRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      authorEmail: row.authorEmail,
      status: row.status,
      answer: row.answer,
      answeredAt: row.answeredAt,
      createdAt: row.createdAt,
    }));
  }

  // 답변 저장과 회신 메일 발송을 한 트랜잭션에 묶는다.
  // 발송이 실패하면 UPDATE가 롤백되어 status는 pending으로 남는다.
  // 불변식: status === 'answered' 이면 회신 메일이 실제로 발송되었다.
  // 재답변은 허용한다 — 덮어쓰고 메일을 다시 보내는 것이 곧 재시도 경로다.
  async answer(
    id: number,
    dto: AnswerInquiryDto,
    now: Date,
  ): Promise<{ id: number; status: InquiryStatus; answeredAt: Date }> {
    return this.dataSource.transaction(async (manager) => {
      const inquiry = await manager.findOne(Inquiry, { where: { id } });
      if (!inquiry) {
        throw new NotFoundException('문의를 찾을 수 없습니다.');
      }

      await manager.update(Inquiry, id, {
        answer: dto.answer,
        answeredAt: now,
        status: 'answered',
      });

      // user relation이 아니라 작성 시점 스냅샷으로 보낸다 (탈퇴 사용자 대응).
      try {
        await this.mailService.sendInquiryAnswer(
          inquiry.authorEmail,
          inquiry.type,
          inquiry.content,
          dto.answer,
        );
      } catch (error) {
        // SES 원본 에러(수신 미검증 주소 등 인프라 정보 포함)는 응답에 싣지 않는다.
        // 서버 로그에는 원본을 남겨 운영자가 진단할 수 있게 한다.
        //
        // 원본 메시지를 두 번째 인자(trace)가 아니라 로그 메시지 본문에 넣는 이유:
        // nest-winston은 두 번째 인자를 메타의 `stack`으로 넘기는데(winston.classes.js:52)
        // app.module.ts의 winston printf는 `trace`를 읽는다. 그래서 이 프로젝트에서는
        // Logger.error(msg, stack)의 스택이 출력되지 않는다. 원본을 본문에 넣지 않으면
        // "발송 실패"만 남고 실패 이유(미검증 발신 주소·자격증명·스로틀링)를 알 수 없다.
        this.logger.error(
          `문의 ${id} 답변 메일 발송 실패: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new InternalServerErrorException(
          '회신 메일 발송에 실패했습니다.',
        );
      }

      return { id, status: 'answered' as InquiryStatus, answeredAt: now };
    });
  }
}
