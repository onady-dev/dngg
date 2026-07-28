import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { InquiryService } from './inquiry.service';
import {
  AnswerInquiryDto,
  ListInquiryQueryDto,
} from './inquiry.request.dto';

// URL은 기존 /admin/* 규칙에 맞추고, 코드는 inquiry 모듈에 응집시킨다.
// AdminController는 클래스 전체에 AdminGuard가 걸려 있어 사용자 작성 경로를
// 넣을 수 없고, 문의 로직을 AdminService로 옮기면 응집도가 깨진다.
@Controller('admin/inquiries')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class InquiryAdminController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Get()
  list(@Query() query: ListInquiryQueryDto) {
    return this.inquiryService.list(query);
  }

  @Post(':id/answer')
  answer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnswerInquiryDto,
  ) {
    return this.inquiryService.answer(id, dto, new Date());
  }
}
