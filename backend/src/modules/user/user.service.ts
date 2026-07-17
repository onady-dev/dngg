import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../entities/User.entity';
import { CreateUserDto, UpdateUserDto } from './user.request.dto';
import { Group } from 'src/entities/Group.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '../../repository/user.repository';
import { GroupRepository } from 'src/repository/group.repository';
import { EmailVerificationService } from './email-verification.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly groupRepository: GroupRepository,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<User> {
    // 이메일 인증을 통과한 요청만 가입 가능 — 토큰의 email과 가입 email이 일치해야 한다
    const { email: verifiedEmail, verificationId } =
      await this.emailVerificationService.assertVerified(
        dto.verificationToken,
        'signup',
      );
    if (verifiedEmail !== dto.email) {
      throw new HttpException(
        '이메일 인증이 유효하지 않습니다. 다시 인증해주세요.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const group = queryRunner.manager.create(Group, { name: dto.groupName });
      const savedGroup = await queryRunner.manager.save(Group, group);
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      const user = queryRunner.manager.create(User, {
        email: dto.email,
        name: dto.name,
        groupId: savedGroup.id,
        password: hashedPassword,
      });
      const savedUser = await queryRunner.manager.save(User, user);
      await this.emailVerificationService.markConsumed(
        verificationId,
        queryRunner.manager,
      );
      await queryRunner.commitTransaction();
      return savedUser;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error.code === '23505') {
        if (error.table === 'user') {
          throw new HttpException(
            'Email already exists',
            HttpStatus.BAD_REQUEST,
          );
        }
        throw new HttpException(
          'Group name already exists',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateUser(id: number, dto: UpdateUserDto): Promise<User> {
    const updateData: any = { ...dto };
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }
    await this.userRepository.update(id, updateData);
    return await this.userRepository.findOneOrFail({ where: { id } });
  }

  async deleteUser(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }

  async loginUser(
    email: string,
    password: string,
  ): Promise<{ user: User; accessToken: string }> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new HttpException('Invalid password', HttpStatus.UNAUTHORIZED);
    }
    const payload = {
      userId: user.id,
      email: user.email,
      groupId: user.groupId,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    return { user, accessToken };
  }

  async resetPassword(
    verificationToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const { email, verificationId } =
      await this.emailVerificationService.assertVerified(
        verificationToken,
        'password_reset',
      );
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(user.id, { password: hashedPassword });
    await this.emailVerificationService.markConsumed(verificationId);
    return { message: '비밀번호가 변경되었습니다.' };
  }
}
