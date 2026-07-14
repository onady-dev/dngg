import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { Group } from 'src/entities/Group.entity';
import { TossBillingClient } from './toss-billing.client';
import { getFreeGameLimit, getPrice } from './subscription.config';
import { addBillingPeriod, computeGraceEnd } from './subscription.util';
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
  private readonly logger = new Logger(SubscriptionService.name);

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

  // 크론이 매일 호출. currentPeriodEnd가 지난 유효 구독을 빌링키로 갱신한다.
  async renewDueSubscriptions(now: Date): Promise<void> {
    const due = await this.subRepo.find({
      where: {
        status: In(ACTIVE_STATUSES),
        currentPeriodEnd: LessThanOrEqual(now),
      },
      relations: ['group'],
    });

    for (const sub of due) {
      try {
        // 해지 예약된 구독은 기간 만료 시 결제 없이 종료
        if (sub.cancelAtPeriodEnd) {
          await this.subRepo.update(sub.id, { status: 'canceled' });
          continue;
        }

        const amount = getPrice(sub.billingCycle);
        // (구독, 주기) 단위로 결정적인 orderId — 재시도 시 동일한 값이 재사용된다.
        // Toss의 멱등성 처리와 Payment.orderId 유니크 제약이 함께 이중 결제를 막는다.
        const orderId = `renew_${sub.id}_${sub.currentPeriodEnd.toISOString()}`;
        const orderName =
          sub.billingCycle === 'yearly'
            ? 'DNGG 연 구독 갱신'
            : 'DNGG 월 구독 갱신';

        let payment: { paymentKey: string };
        try {
          payment = await this.toss.requestBillingPayment({
            billingKey: sub.billingKey,
            customerKey: sub.group.customerKey,
            amount,
            orderId,
            orderName,
          });
        } catch (error) {
          // 실제 결제 실패 — 유예 기간 계산 후 상태 전환, 실패 이력 기록(best-effort)
          const graceEnd = computeGraceEnd(sub.currentPeriodEnd);
          const nextStatus = now > graceEnd ? 'expired' : 'past_due';
          await this.subRepo.update(sub.id, { status: nextStatus });
          // orderId는 (구독, 주기)당 결정적 — 이전 실패 기록이 있으면 갱신,
          // 없으면 새로 생성한다. 이렇게 해야 나중에 결제가 성공했을 때
          // 같은 orderId로 success 전환이 가능하다(유니크 제약 충돌 방지).
          const failReason =
            error instanceof Error ? error.message : '갱신 실패';
          const existingFailed = await this.payRepo.findOne({
            where: { orderId },
          });
          if (existingFailed) {
            await this.payRepo.update(existingFailed.id, {
              status: 'failed',
              failReason,
            });
          } else {
            await this.payRepo.save(
              this.payRepo.create({
                subscription: { id: sub.id } as Subscription,
                group: { id: sub.group.id } as Group,
                amount,
                orderId,
                status: 'failed',
                failReason,
              }),
            );
          }
          continue;
        }

        // 결제는 성공했다 — 이제 기간 연장 + 결제 기록 persist를 시도한다.
        // 여기서 실패해도 결제는 이미 완료된 것이므로 실패로 오분류하면 안 된다.
        // (트랜잭션 롤백으로 기간이 늘지 않으므로 다음 크론이 동일 orderId로 재시도한다.)
        try {
          // 드리프트 방지: 이전 종료일 기준으로 다음 주기 계산
          const nextEnd = addBillingPeriod(
            sub.currentPeriodEnd,
            sub.billingCycle,
          );
          // 기간 연장과 결제 기록은 한 트랜잭션 — 하나만 커밋되어
          // "기간은 늘었는데 결제 기록이 없음" 또는 그 반대가 생기지 않게 한다.
          // Payment는 orderId로 upsert한다 — 이전 시도(예: 거절 후 재시도)가
          // 남긴 failed 행이 있으면 success로 전환하고, 없으면 새로 삽입한다.
          // (같은 orderId로 insert하면 유니크 제약 충돌 → 영구 past_due 발생)
          await this.dataSource.transaction(async (manager) => {
            const existing = await manager.findOne(Payment, {
              where: { orderId },
            });
            if (existing) {
              await manager.update(Payment, existing.id, {
                status: 'success',
                externalPaymentId: payment.paymentKey,
                paidAt: now,
              });
            } else {
              await manager.save(Payment, {
                subscription: { id: sub.id } as Subscription,
                group: { id: sub.group.id } as Group,
                amount,
                orderId,
                externalPaymentId: payment.paymentKey,
                status: 'success',
                paidAt: now,
              });
            }
            await manager.update(Subscription, sub.id, {
              status: 'active',
              currentPeriodStart: sub.currentPeriodEnd,
              currentPeriodEnd: nextEnd,
            });
          });
        } catch (error) {
          this.logger.error(
            `구독 ${sub.id} 갱신: Toss 결제(orderId=${orderId})는 성공했지만 DB 반영에 실패했습니다. ` +
              '구독 상태는 변경하지 않으며, 다음 크론 실행 시 동일 orderId로 재시도됩니다.',
            error instanceof Error ? error.stack : String(error),
          );
        }
      } catch (error) {
        // 예상치 못한 오류 — 다른 구독 처리에 영향을 주지 않도록 격리
        this.logger.error(
          `구독 ${sub.id} 갱신 처리 중 예상치 못한 오류가 발생했습니다.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}

// Postgres 유니크 제약 위반(23505) 판별. TypeORM QueryFailedError는
// driverError.code에 SQLSTATE를 담는다.
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { driverError?: { code?: string }; code?: string })
    ?.driverError?.code ?? (error as { code?: string })?.code;
  return code === '23505';
}
