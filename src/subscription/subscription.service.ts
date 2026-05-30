import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WalletRepository } from '../payment/repositories/wallet.repository';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { SubscriptionsRepository } from './repository/subscription.repository';
import { ApplicationException } from '../lib/exception/app.exception';
import { SubscriptionStatus } from './subscription.types';

@Injectable()
export class SubscriptionService {
  private readonly _logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly _subRepo: SubscriptionsRepository,
    private readonly _walletRepo: WalletRepository,
    private readonly _queryRunnerExec: QueryRunnerExec,
  ) {}

  /**
   * Validates if a user has access.
   * Access is granted if: Date < currentPeriodEnd OR Date < (currentPeriodEnd + 3 days)
   */
  async hasAccess(userId: string): Promise<boolean> {
    const sub = await this._subRepo.findActiveByUserId(userId);
    if (!sub) return false;

    const gracePeriodEnd = new Date(sub.currentPeriodEnd);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);

    return new Date() <= gracePeriodEnd;
  }

  /**
   * Scheduled job logic: Auto-deducts subscription from wallet
   */
  async processAutoRenewal(userId: string, amount: number) {
    const queryRunner = await this._queryRunnerExec.getRunner();
    try {
      const wallet = await this._walletRepo.findByUserId(userId);
      if (wallet && wallet.user && wallet.balance >= amount) {
        // Deduct from wallet
        await this._walletRepo.updateBalance(
          queryRunner,
          wallet,
          wallet.balance - amount,
        );

        const newEndDate = new Date();
        newEndDate.setMonth(newEndDate.getMonth() + 1);

        await this._subRepo.add(
          queryRunner,
          {
            currentPeriodEnd: newEndDate,
            status: SubscriptionStatus.ACTIVE,
          },
          wallet.user,
        );

        await this._queryRunnerExec.commit(queryRunner);
      } else {
        // Trigger 3-day notice logic (e.g., Email/Notification)
        this._logger.warn(`Insufficient funds for auto-renewal: ${userId}`);
      }
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);
      this._logger.error((error as Error).message);
    }
  }
}
