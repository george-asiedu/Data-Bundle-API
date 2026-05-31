import { Injectable, Logger } from '@nestjs/common';
import { WalletRepository } from '../payment/repositories/wallet.repository';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { SubscriptionsRepository } from './repository/subscription.repository';
import { SubscriptionStatus } from './subscription.types';
import { QueryRunner } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GracePeriodMailer } from './mailer/grace-period.mailer';
import { RenewedSubscriptionMailer } from './mailer/renewed-subscription.mailer';

@Injectable()
export class SubscriptionService {
  private readonly _logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly _subRepo: SubscriptionsRepository,
    private readonly _walletRepo: WalletRepository,
    private readonly _queryRunnerExec: QueryRunnerExec,
    private readonly _gracePeriodMailer: GracePeriodMailer,
    private readonly _renewedSubscriptionMailer: RenewedSubscriptionMailer,
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
   * Activates or extends a subscription after a direct gateway payment.
   * Does NOT deduct from the virtual wallet.
   */
  async activateSubscription(queryRunner: QueryRunner, user: User) {
    const newEndDate = new Date();
    newEndDate.setMonth(newEndDate.getMonth() + 1);

    await this._subRepo.add(
      queryRunner,
      {
        currentPeriodEnd: newEndDate,
        status: SubscriptionStatus.ACTIVE,
      },
      user,
    );

    this._renewedSubscriptionMailer
      .sendMail({
        email: user.email,
        name: user.fullName || 'Agent',
      })
      .catch(() =>
        this._logger.error(`Failed to send renewal email to ${user.email}`),
      );
  }

  /**
   * Scheduled batch job: Runs every day at midnight.
   * Finds all subscriptions expiring today and attempts to auto-deduct from wallets.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processAutoRenewal() {
    this._logger.log('Starting daily auto-renewal batch process...');

    const today = new Date();
    const expiringSubscriptions =
      await this._subRepo.findExpiringSubscriptions(today);

    if (expiringSubscriptions.length === 0) {
      this._logger.log('No subscriptions expiring today.');
      return;
    }

    const SUBSCRIPTION_AMOUNT = 10000;

    for (const sub of expiringSubscriptions) {
      const userId = sub.user.id;
      const queryRunner = await this._queryRunnerExec.getRunner();

      try {
        const wallet = await this._walletRepo.findByUserId(userId);

        if (wallet && wallet.user && wallet.balance >= SUBSCRIPTION_AMOUNT) {
          // Deduct from wallet
          await this._walletRepo.updateBalance(
            queryRunner,
            wallet,
            wallet.balance - SUBSCRIPTION_AMOUNT,
          );

          // Extend subscription by 1 month from its current end date
          const newEndDate = new Date(sub.currentPeriodEnd);
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
          this._logger.log(
            `Successfully auto-renewed subscription for user ${userId}`,
          );

          this._renewedSubscriptionMailer
            .sendMail({
              email: wallet.user.email,
              name: wallet.user.fullName || 'Agent',
            })
            .catch(() =>
              this._logger.error(
                `Failed to send renewal email to ${wallet.user.email}`,
              ),
            );
        } else if (wallet && wallet.user) {
          this._logger.warn(
            `Insufficient funds for auto-renewal: ${userId}. Triggering Grace Period notice.`,
          );

          this._gracePeriodMailer
            .sendMail({
              email: wallet.user.email,
              name: wallet.user.fullName || 'Agent',
              amountDueGhs: SUBSCRIPTION_AMOUNT / 100,
            })
            .catch(() =>
              this._logger.error(
                `Failed to send grace period email to ${wallet.user.email}`,
              ),
            );
        }
      } catch (error) {
        await this._queryRunnerExec.rollback(queryRunner);
        this._logger.error(
          `Failed to process auto-renewal for user ${userId}: ${(error as Error).message}`,
        );
      }
    }

    this._logger.log('Daily auto-renewal batch process completed.');
  }
}
