import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { Group } from 'src/entities/Group.entity';
import { TossBillingClient } from './toss-billing.client';
import { getFreeGameLimit, getPrice } from './subscription.config';
import { addBillingPeriod } from './subscription.util';
import {
  ACTIVE_STATUSES,
  BillingCycle,
  SubscriptionStatus,
} from './subscription.constants';
import { BillingKeyRequestDto } from './subscription.request.dto';

export interface SubscriptionStatusResponse {
  subscribed: boolean;
  status: SubscriptionStatus | 'none';
  billingCycle: BillingCycle | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  freeGamesUsed: number;
  freeGameLimit: number;
  remainingFreeGames: number;
  customerKey: string;
  prices: { monthly: number; yearly: number };
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly payRepo: Repository<Payment>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    private readonly toss: TossBillingClient,
    private readonly dataSource: DataSource,
  ) {}

  private async findActiveSubscription(
    groupId: number,
  ): Promise<Subscription | null> {
    return this.subRepo.findOne({
      where: { group: { id: groupId }, status: In(ACTIVE_STATUSES) },
      order: { id: 'DESC' },
    });
  }

  // Group에 저장된 customerKey를 재사용하거나 없으면 생성해 저장한다.
  private async ensureCustomerKey(group: Group): Promise<string> {
    if (group.customerKey) return group.customerKey;
    const customerKey = randomUUID();
    await this.groupRepo.update(group.id, { customerKey });
    return customerKey;
  }

  async getStatus(groupId: number): Promise<SubscriptionStatusResponse> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    const freeGamesUsed = group?.freeGamesUsed ?? 0;
    const freeGameLimit = getFreeGameLimit();
    const customerKey = group ? await this.ensureCustomerKey(group) : '';
    const active = await this.findActiveSubscription(groupId);

    return {
      subscribed: !!active,
      status: active ? active.status : 'none',
      billingCycle: active ? active.billingCycle : null,
      currentPeriodEnd: active ? active.currentPeriodEnd : null,
      cancelAtPeriodEnd: active ? active.cancelAtPeriodEnd : false,
      freeGamesUsed,
      freeGameLimit,
      remainingFreeGames: Math.max(0, freeGameLimit - freeGamesUsed),
      customerKey,
      prices: { monthly: getPrice('monthly'), yearly: getPrice('yearly') },
    };
  }

  async subscribe(
    groupId: number,
    userId: number,
    dto: BillingKeyRequestDto,
  ): Promise<{ status: 'active'; currentPeriodEnd: Date }> {
    // 그룹당 유효 구독은 1개 — 중복/동시 호출 방지
    const activeCount = await this.subRepo.count({
      where: { group: { id: groupId }, status: In(ACTIVE_STATUSES) },
    });
    if (activeCount > 0) {
      throw new ConflictException('이미 진행 중인 구독이 있습니다.');
    }

    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new HttpException('그룹을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }

    const customerKey = await this.ensureCustomerKey(group);
    const amount = getPrice(dto.billingCycle);
    const orderId = randomUUID();
    const orderName =
      dto.billingCycle === 'yearly' ? 'DNGG 연 구독' : 'DNGG 월 구독';

    // 발급 + 첫 결제는 하나의 단위. 결제 실패 시 빌링키를 저장하지 않는다.
    const { billingKey } = await this.toss.issueBillingKey(
      dto.authKey,
      customerKey,
    );

    let payment;
    try {
      payment = await this.toss.requestBillingPayment({
        billingKey,
        customerKey,
        amount,
        orderId,
        orderName,
      });
    } catch (error) {
      // 실패 이력만 기록 (subscription 미생성, billingKey 미저장)
      await this.payRepo.save(
        this.payRepo.create({
          group: { id: groupId } as Group,
          user: { id: userId } as any,
          amount,
          orderId,
          status: 'failed',
          failReason: error instanceof Error ? error.message : '결제 실패',
        }),
      );
      throw new HttpException(
        error instanceof Error ? error.message : '결제에 실패했습니다.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const now = new Date();
    const currentPeriodEnd = addBillingPeriod(now, dto.billingCycle);

    try {
      await this.dataSource.transaction(async (manager) => {
        const subscription = await manager.save(Subscription, {
          group: { id: groupId } as Group,
          billingCycle: dto.billingCycle,
          status: 'active' as SubscriptionStatus,
          currentPeriodStart: now,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          billingKey,
        });
        await manager.save(Payment, {
          subscription,
          group: { id: groupId } as Group,
          user: { id: userId } as any,
          amount,
          orderId,
          externalPaymentId: payment.paymentKey,
          status: 'success',
          paidAt: now,
        });
      });
    } catch (error) {
      // 부분 유니크 인덱스(uq_active_subscription_per_group) 위반 —
      // 선(先) count 체크를 통과한 동시 요청이 여기서 걸린다.
      // 이미 결제는 성공한 상태이므로 성공 Payment는 남기고(위 트랜잭션 롤백으로
      // 미기록일 수 있어 별도 기록) 409로 응답, 중복분 환불은 수동 처리(스코프 제외).
      if (isUniqueViolation(error)) {
        await this.payRepo.save(
          this.payRepo.create({
            group: { id: groupId } as Group,
            user: { id: userId } as any,
            amount,
            orderId,
            externalPaymentId: payment.paymentKey,
            status: 'success',
            paidAt: now,
            failReason: '동시 구독 요청으로 중복 결제 발생 — 환불 대상',
          }),
        );
        throw new ConflictException(
          '이미 진행 중인 구독이 있습니다. 중복 결제는 확인 후 환불됩니다.',
        );
      }
      throw error;
    }

    return { status: 'active', currentPeriodEnd };
  }

  async cancel(groupId: number): Promise<{ cancelAtPeriodEnd: true }> {
    const active = await this.findActiveSubscription(groupId);
    if (!active) {
      throw new NotFoundException('해지할 구독이 없습니다.');
    }
    await this.subRepo.update(active.id, { cancelAtPeriodEnd: true });
    return { cancelAtPeriodEnd: true };
  }

  async resume(groupId: number): Promise<{ cancelAtPeriodEnd: false }> {
    const active = await this.findActiveSubscription(groupId);
    if (!active) {
      throw new NotFoundException('재활성화할 구독이 없습니다.');
    }
    await this.subRepo.update(active.id, { cancelAtPeriodEnd: false });
    return { cancelAtPeriodEnd: false };
  }

  async getPayments(
    groupId: number,
    page = 1,
  ): Promise<{ items: Payment[]; page: number; hasMore: boolean }> {
    const limit = 20;
    const items = await this.payRepo.find({
      where: { group: { id: groupId } },
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, page, hasMore };
  }
}

// Postgres 유니크 제약 위반(23505) 판별. TypeORM QueryFailedError는
// driverError.code에 SQLSTATE를 담는다.
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { driverError?: { code?: string }; code?: string })
    ?.driverError?.code ?? (error as { code?: string })?.code;
  return code === '23505';
}
