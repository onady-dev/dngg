import {
  Controller,
  Post,
  Body,
  Put,
  Param,
  Delete,
  ValidationPipe,
  UseGuards,
  Request,
  ForbiddenException,
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

// AuthGuard('jwt') 통과 후 req.user는 jwt.strategy.ts validate()의 반환값
interface RequestWithUser {
  user?: { userId?: number };
}

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
    @Request() req: RequestWithUser,
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdateUserDto,
  ) {
    this.assertOwnUser(req, Number(id));
    return this.userService.updateUser(Number(id), dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteUser(@Request() req: RequestWithUser, @Param('id') id: number) {
    this.assertOwnUser(req, Number(id));
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

  // 본인 계정만 수정/삭제할 수 있다 (JWT payload의 userId 기준)
  private assertOwnUser(req: RequestWithUser, id: number) {
    if (Number(req.user?.userId) !== Number(id)) {
      throw new ForbiddenException('Cannot manage another user account');
    }
  }
}
