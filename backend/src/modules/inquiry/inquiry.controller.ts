import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InquiryService } from './inquiry.service';
import { CreateInquiryDto } from './inquiry.request.dto';

@Controller('inquiry')
@UseGuards(AuthGuard('jwt'))
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateInquiryDto) {
    return this.inquiryService.create(
      { userId: req.user.userId, email: req.user.email },
      dto,
    );
  }
}
