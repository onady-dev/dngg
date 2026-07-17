import {
  Controller,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import {
  ConfirmEmailVerificationDto,
  CreateUserDto,
  RequestEmailVerificationDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './user.request.dto';
import { EmailVerificationService } from './email-verification.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('email-verification/request')
  async requestEmailVerification(
    @Body(ValidationPipe) dto: RequestEmailVerificationDto,
  ) {
    return this.emailVerificationService.requestCode(dto.email, dto.purpose);
  }

  @Post('email-verification/confirm')
  async confirmEmailVerification(
    @Body(ValidationPipe) dto: ConfirmEmailVerificationDto,
  ) {
    return this.emailVerificationService.confirmCode(
      dto.email,
      dto.code,
      dto.purpose,
    );
  }

  @Post()
  async createUser(@Body(ValidationPipe) dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateUser(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(Number(id), dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteUser(@Param('id') id: number) {
    await this.userService.deleteUser(Number(id));
    return { message: 'User deleted successfully' };
  }

  @Post('login')
  async loginUser(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.userService.loginUser(email, password);
  }

  @Post('password-reset')
  async resetPassword(@Body(ValidationPipe) dto: ResetPasswordDto) {
    return this.userService.resetPassword(
      dto.verificationToken,
      dto.newPassword,
    );
  }
}
