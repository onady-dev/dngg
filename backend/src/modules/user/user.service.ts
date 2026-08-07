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
import { seedLogitemsForGroup } from '../logitem/logitem-seed';

// bcrypt 패키지에 타입 선언이 없어 호출부가 `any`로 추론된다 — 신규 코드에서는
// 타입을 명시해 unsafe-* 린트를 피한다. 기존 호출부는 out-of-scope로 남겨둔다.
const typedBcrypt = bcrypt as unknown as {
  hash: (data: string, saltOrRounds: number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
};

// 아이디 미존재와 비밀번호 불일치를 구분해서 알려주면 계정 열거가 가능해진다.
// 그룹명은 GET /group/all로 공개되어 있어 특히 위험하므로 응답을 하나로 통일한다.
export const INVALID_CREDENTIALS_MESSAGE =
  '아이디 또는 비밀번호가 올바르지 않습니다.';

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
        // 가입이 그룹을 만드는 유일한 실사용 경로다 — 프론트는 POST /group을 호출하지
        // 않는다. 여기서 시드하지 않으면 기록 화면에 버튼이 하나도 없는 그룹이 된다.
        // 같은 manager를 넘겨 그룹 생성과 원자적으로 묶는다.
        await seedLogitemsForGroup(manager, savedGroup.id);
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
    identifier: string,
    password: string,
  ): Promise<{ user: Omit<User, 'password'>; accessToken: string }> {
    const user = await this.findUserByIdentifier(identifier.trim());
    if (!user) {
      throw new HttpException(
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
    }
    const isMatch = await typedBcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new HttpException(
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
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

  // 아이디는 User.email 값(이메일 또는 레거시 아이디) 또는 그룹명이다.
  // 계정 조회가 항상 먼저이고, 일치하는 계정이 없을 때만 그룹명으로 폴백한다.
  private async findUserByIdentifier(identifier: string): Promise<User | null> {
    // 형식과 무관하게 email 컬럼을 먼저 조회한다. 이메일 형식일 때만 조회하면
    // 안 되는 이유(2026-08-07 운영 장애): 이메일 인증 도입 전에 만들어진 계정들은
    // email 컬럼을 아이디로 쓰고 있어(운영 11개 중 8개가 'onady', '스내치' 같은
    // 비이메일 값) 조회조차 되지 않고 그룹명 경로로 빠져 전부 로그인 불가가 됐다.
    // 계정 조회를 먼저 두면 그룹명 로그인 도입 전과 동일한 결과가 보장된다.
    const byEmail = await this.userRepository.findOne({
      where: { email: identifier },
    });
    if (byEmail) return byEmail;
    return this.findUserByGroupName(identifier);
  }

  // findByName이 isDeleted: false를 걸러주므로 탈퇴한 그룹명으로는 로그인되지 않는다
  // (해당 계정의 이메일 로그인은 계속 동작한다).
  private async findUserByGroupName(name: string): Promise<User | null> {
    const group = await this.groupRepository.findByName(name);
    if (!group) return null;
    // 그룹당 계정이 1개라는 전제는 실제로는 깨져 있다 — 운영의 그룹 1(스내치)에는
    // 계정이 2개다. 어느 쪽을 고를지 정할 근거가 없으므로 그룹명으로는 거부한다.
    // 해당 계정들은 각자의 User.email 값(아이디)으로 로그인하면 된다.
    const users = await this.userRepository.find({
      where: { groupId: group.id },
      order: { id: 'ASC' },
      take: 2,
    });
    if (users.length !== 1) {
      if (users.length > 1) {
        this.logger.error(
          `그룹 ${group.id}(${group.name})에 계정이 2개 이상이라 그룹명 로그인을 거부했습니다.`,
        );
      }
      return null;
    }
    return users[0];
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
