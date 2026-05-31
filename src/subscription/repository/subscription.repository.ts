import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../../auth/entities/user.entity';
import { SubscriptionStatus } from '../subscription.types';

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private _getQueryBuilder() {
    return this._dataSource
      .getRepository(Subscription)
      .createQueryBuilder('subscriptions');
  }

  private async _getNextId(queryRunner: QueryRunner): Promise<string> {
    const result = await queryRunner.manager
      .createQueryBuilder(Subscription, 'subscriptions')
      .select('MAX(CAST(SUBSTRING(subscriptions.id, 3) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `SUB${maxNum + 1}`;
  }

  async add(
    queryRunner: QueryRunner,
    data: Partial<Subscription>,
    user: User,
  ): Promise<Subscription> {
    const subscriptions = new Subscription();
    subscriptions.id = await this._getNextId(queryRunner);
    subscriptions.status = data.status || SubscriptionStatus.ACTIVE;
    subscriptions.currentPeriodStart = data.currentPeriodStart || new Date();
    subscriptions.currentPeriodEnd = data.currentPeriodEnd!;
    subscriptions.user = user;

    return await queryRunner.manager.save(subscriptions);
  }

  async findActiveByUserId(userId: string): Promise<Subscription | null> {
    return await this._getQueryBuilder()
      .leftJoinAndSelect('subscriptions.user', 'user')
      .where('user.id = :userId AND subscriptions.status = :status', {
        userId,
        status: SubscriptionStatus.ACTIVE,
      })
      .getOne();
  }

  async update(
    queryRunner: QueryRunner,
    subscription: Subscription,
  ): Promise<Subscription> {
    return await queryRunner.manager.save(subscription);
  }

  /**
   * Finds all active subscriptions expiring on a specific date
   */
  async findExpiringSubscriptions(targetDate: Date): Promise<Subscription[]> {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return await this._getQueryBuilder()
      .leftJoinAndSelect('subscriptions.user', 'user')
      .where('subscriptions.currentPeriodEnd >= :startOfDay', { startOfDay })
      .andWhere('subscriptions.currentPeriodEnd <= :endOfDay', { endOfDay })
      .andWhere('subscriptions.status = :status', {
        status: SubscriptionStatus.ACTIVE,
      })
      .getMany();
  }
}
