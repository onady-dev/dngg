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
import {
  INQUIRY_PAGE_SIZE_DEFAULT,
  InquiryStatus,
  InquiryType,
} from './inquiry.constants';
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

export interface InquiryListPage {
  rows: InquiryAdminRow[];
  total: number;
  page: number;
  limit: number;
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

  // 전체를 한 번에 내려주면 본문(최대 2000자)까지 통째로 실려 나간다.
  // total을 함께 주어 프론트가 더 불러올 게 남았는지 판단할 수 있게 한다.
  async list(
    params: { status?: InquiryStatus; page?: number; limit?: number } = {},
  ): Promise<InquiryListPage> {
    const page = params.page ?? 1;
    const limit = params.limit ?? INQUIRY_PAGE_SIZE_DEFAULT;

    const [rows, total] = await this.inquiryRepo.findAndCount({
      where: params.status ? { status: params.status } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        type: row.type,
        content: row.content,
        authorEmail: row.authorEmail,
        status: row.status,
        answer: row.answer,
        answeredAt: row.answeredAt,
        createdAt: row.createdAt,
      })),
      total,
      page,
      limit,
    };
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
      // 행을 잠그고 읽는다. 잠그지 않으면 이 SELECT와 아래 UPDATE 사이가 벌어져
      // 그 틈에 삭제된 문의에 회신 메일이 나갈 수 있다(문의 삭제 기능이 생기는 순간).
      // 어차피 UPDATE가 커밋까지 행 잠금을 쥐므로 추가 비용은 사실상 없다.
      const inquiry = await manager.findOne(Inquiry, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inquiry) {
        throw new NotFoundException('문의를 찾을 수 없습니다.');
      }

      // affected를 확인하지 않으면 갱신된 행이 없어도 메일을 보내고 성공을
      // 반환한다 — 존재하지 않는 문의에 회신이 나가고 관리자는 답변됐다고 믿는다.
      const updated = await manager.update(Inquiry, id, {
        answer: dto.answer,
        answeredAt: now,
        status: 'answered',
      });
      if (updated.affected === 0) {
        throw new NotFoundException('문의를 찾을 수 없습니다.');
      }

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
        // 원본 메시지는 두 번째 인자(스택)와 별개로 로그 본문에도 넣는다. 실패 이유
        // (미검증 발신 주소·자격증명·스로틀링)가 스택이 아니라 메시지에 담기기 때문이다.
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
