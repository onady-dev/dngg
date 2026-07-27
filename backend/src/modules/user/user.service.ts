import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../../entities/User.entity';
import { CreateUserDto, UpdateUserDto } from './user.request.dto';
import { Group } from 'src/entities/Group.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '../../repository/user.repository';
import { GroupRepository } from 'src/repository/group.repository';
import { EmailVerificationService } from './email-verification.service';

// bcrypt 패키지에 타입 선언이 없어 호출부가 `any`로 추론된다 — 신규 코드에서는
// 타입을 명시해 unsafe-* 린트를 피한다. 기존 호출부는 out-of-scope로 남겨둔다.
const typedBcrypt = bcrypt as unknown as {
  hash: (data: string, saltOrRounds: number) => Promise<string>;
};

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly groupRepository: GroupRepository,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
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

    try {
      return await this.withTransaction(async (manager) => {
        const group = manager.create(Group, { name: dto.groupName });
        const savedGroup = await manager.save(Group, group);
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = manager.create(User, {
          email: dto.email,
          name: dto.name,
          groupId: savedGroup.id,
          password: hashedPassword,
        });
        const savedUser = await manager.save(User, user);
        await this.emailVerificationService.markConsumed(
          verificationId,
          manager,
        );
        return this.omitPassword(savedUser);
      });
    } catch (error) {
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
    }
  }

  // queryRunner 보일러플레이트 공통화: connect/startTransaction 실패도 release를
  // 보장하고, rollback 실패가 원래 에러를 가리지 않도록 한다.
  private async withTransaction<T>(
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const result = await fn(queryRunner.manager);
        await queryRunner.commitTransaction();
        return result;
      } catch (error) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          this.logger.error(
            '트랜잭션 롤백에 실패했습니다. 원래 에러를 그대로 전파합니다.',
            rollbackError instanceof Error
              ? rollbackError.stack
              : String(rollbackError),
          );
        }
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  // 응답에서 비밀번호 해시를 제거한다 (원본은 변형하지 않음).
  private omitPassword(user: User): Omit<User, 'password'> {
    const clone = { ...user };
    delete (clone as Partial<User>).password;
    return clone;
  }

  async updateUser(
    id: number,
    dto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    const updateData: any = { ...dto };
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }
    await this.userRepository.update(id, updateData);
    return this.omitPassword(
      await this.userRepository.findOneOrFail({ where: { id } }),
    );
  }

  async deleteUser(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }

  async loginUser(
    email: string,
    password: string,
  ): Promise<{ user: Omit<User, 'password'>; accessToken: string }> {
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
    return { user: this.omitPassword(user), accessToken };
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

    await this.withTransaction(async (manager) => {
      const hashedPassword = await typedBcrypt.hash(newPassword, 10);
      await manager.update(User, user.id, {
        password: hashedPassword,
      });
      await this.emailVerificationService.markConsumed(verificationId, manager);
    });
    return { message: '비밀번호가 변경되었습니다.' };
  }
}
