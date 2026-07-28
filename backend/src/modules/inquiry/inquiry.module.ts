import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inquiry } from 'src/entities/Inquiry.entity';
import { MailModule } from '../mail/mail.module';
import { AdminGuard } from '../admin/admin.guard';
import { InquiryController } from './inquiry.controller';
import { InquiryAdminController } from './inquiry-admin.controller';
import { InquiryService } from './inquiry.service';

@Module({
  imports: [TypeOrmModule.forFeature([Inquiry]), MailModule],
  controllers: [InquiryController, InquiryAdminController],
  // AdminGuard는 무상태(의존성 없음)라 여기에 등록해 재사용한다.
  providers: [InquiryService, AdminGuard],
})
export class InquiryModule {}
