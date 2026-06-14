import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WalletRepository } from './repositories/wallet.repository';
import { ApplicationException } from 'src/lib/exception/app.exception';
import { TransactionRepository } from './repositories/transaction.repository';
import { WithdrawalRepository } from './repositories/withdrawal.repository';
import { Paginator } from 'src/shared/services/paginator.provider';
import { DataMessage } from 'src/lib/utils/types.utils';
import { Transaction } from './entities/transactions.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { PaymentService } from './payment.service';
import { AuditService } from '../audit/audit.service';
import { LogAction } from '../audit/log-action.types';
import {
  TransactionPurpose,
  TransactionType,
  WithdrawalStatus,
} from './payment.types';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/auth.types';

@Injectable()
export class TransactionsService {
  private readonly _logger = new Logger(TransactionsService.name);

  constructor(
    private readonly _walletRepo: WalletRepository,
    private readonly _transactionRepo: TransactionRepository,
    private readonly _withdrawalRepo: WithdrawalRepository,
    private readonly _queryRunnerExec: QueryRunnerExec,
    private readonly _paymentService: PaymentService,
    private readonly _auditService: AuditService,
  ) {}

  /**
   * Guards user-scoped reads against IDOR: a caller may only access their own
   * resources unless they are a platform admin.
   */
  private _assertOwnership(requester: User, targetUserId: string): void {
    if (requester.id !== targetUserId && requester.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot access this resource');
    }
  }

  async getWallet(userId: string, requester: User) {
    try {
      this._assertOwnership(requester, userId);

      const wallet = await this._walletRepo.findByUserId(userId);
      if (!wallet) throw new NotFoundException('Wallet not found');

      return { wallet };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        throw error;

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async getTransaction(id: string): Promise<DataMessage<Transaction>> {
    try {
      const transaction = await this._transactionRepo.find(id);
      if (!transaction) throw new NotFoundException('Transaction not found');

      return {
        message: 'Transaction successfully fetched',
        data: transaction,
      };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);
      if (error instanceof NotFoundException) throw error;

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async getTransactionByReference(
    ref: string,
  ): Promise<DataMessage<Transaction>> {
    try {
      const transaction = await this._transactionRepo.findByPaystackRef(ref);
      if (!transaction) throw new NotFoundException('Transaction not found');

      return {
        message: 'Transaction found',
        data: transaction,
      };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);
      if (error instanceof NotFoundException) throw error;

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async paginateTransactions(
    paginator: Paginator,
    userId: string,
    requester: User,
  ): Promise<DataMessage<Transaction[]>> {
    try {
      this._assertOwnership(requester, userId);

      const transactions = await this._transactionRepo.paginate(
        paginator,
        userId,
      );

      return {
        message: 'Transactions successfully fetched',
        data: transactions ?? [],
      };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);
      if (error instanceof ForbiddenException) throw error;

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  /**
   * Starts a wallet top-up. Real funds enter only through Paystack, so this
   * delegates to the existing gateway initialisation; the wallet is credited by
   * the verify/webhook flow once payment settles.
   * @param amount - amount in whole GHS
   */
  async topUp(user: User, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive whole number');
    }

    // Paystack expects the smallest currency unit (pesewas).
    const result = await this._paymentService.initializeTransaction(
      { email: user.email, amount: amount * 100 },
      user.id,
    );

    void this._auditService.logAction(
      LogAction.WALLET_TOP_UP_INITIATED,
      user.id,
      {
        resourceType: 'wallet',
        resourceId: user.id,
        metadata: { amount },
      },
    );

    return {
      message: 'Top-up initialized successfully',
      data: result.data,
    };
  }

  /**
   * Requests a withdrawal. Funds are held on the wallet immediately (debited)
   * and a PENDING request is created for admin review. The actual payout is
   * fired by an admin via approveWithdrawal.
   * @param amount - amount in whole GHS
   */
  async requestWithdrawal(
    user: User,
    amount: number,
  ): Promise<DataMessage<Withdrawal>> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive whole number');
    }

    if (!user.settlementBankAccount || !user.accountNumber) {
      throw new BadRequestException(
        'Add a settlement account before requesting a withdrawal.',
      );
    }

    const queryRunner = await this._queryRunnerExec.getRunner();
    try {
      const wallet = await this._walletRepo.findByUserIdForUpdate(
        queryRunner,
        user.id,
      );
      if (!wallet) throw new ApplicationException('Wallet not found');
      if (wallet.isFrozen) {
        throw new ForbiddenException('This wallet is frozen');
      }
      if (Number(wallet.balance) < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const reference = `WD-${Date.now()}`;
      const balanceAfter = Number(wallet.balance) - amount;

      await this._walletRepo.updateBalance(queryRunner, wallet, balanceAfter);

      // Ledger entry for the held funds.
      await this._transactionRepo.add(
        queryRunner,
        {
          type: TransactionType.DEBIT,
          purpose: TransactionPurpose.WITHDRAWAL,
          amount,
          balanceAfter,
          reference,
          paystackRef: reference,
        },
        user,
        wallet,
      );

      const withdrawal = await this._withdrawalRepo.add(
        queryRunner,
        { amount, reference, status: WithdrawalStatus.PENDING },
        user,
        wallet,
      );

      await this._queryRunnerExec.commit(queryRunner);

      void this._auditService.logAction(
        LogAction.WITHDRAWAL_REQUESTED,
        user.id,
        {
          resourceType: 'withdrawal',
          resourceId: withdrawal.id,
          metadata: { amount, balanceAfter },
        },
      );

      return {
        message: 'Withdrawal request submitted and is pending approval',
        data: withdrawal,
      };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      )
        throw error;

      this._logger.error(
        `Withdrawal request failed for ${user.id}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to request withdrawal');
    }
  }

  async getMyWithdrawals(
    userId: string,
    paginator: Paginator,
  ): Promise<DataMessage<Withdrawal[]>> {
    try {
      const withdrawals = await this._withdrawalRepo.paginateByUser(
        userId,
        paginator,
      );
      return {
        message: 'Withdrawals successfully fetched',
        data: withdrawals,
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  /**
   * Admin: approves a pending withdrawal and initiates the Paystack payout.
   * The request moves to PROCESSING; the transfer webhook later settles it to
   * PAID (or FAILED with a refund).
   */
  async approveWithdrawal(
    admin: User,
    withdrawalId: string,
  ): Promise<DataMessage<Withdrawal>> {
    const withdrawal = await this._withdrawalRepo.find(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Only pending withdrawals can be approved (current: ${withdrawal.status})`,
      );
    }

    const owner = withdrawal.user;
    if (!owner?.settlementBankAccount || !owner?.accountNumber) {
      throw new BadRequestException(
        'The requesting agent has no settlement account on file.',
      );
    }

    // Gateway calls run before any DB mutation so a failure leaves the request
    // PENDING (safe to retry) rather than half-approved.
    const recipientCode = await this._paymentService.createTransferRecipient(
      owner.fullName ?? 'Agent',
      owner.accountNumber,
      owner.settlementBankAccount,
    );

    const transfer = await this._paymentService.initiateTransfer(
      withdrawal.amount,
      recipientCode,
      `Withdrawal ${withdrawal.id}`,
      withdrawal.reference,
    );

    const queryRunner = await this._queryRunnerExec.getRunner();
    try {
      withdrawal.recipientCode = recipientCode;
      withdrawal.transferCode = transfer.transferCode;
      withdrawal.transferRef = transfer.reference;
      withdrawal.reviewedBy = admin.id;
      // 'otp' means the transfer needs manual finalisation in the Paystack
      // dashboard; keep it APPROVED until the success webhook arrives.
      withdrawal.status =
        transfer.status === 'otp'
          ? WithdrawalStatus.APPROVED
          : WithdrawalStatus.PROCESSING;

      await this._withdrawalRepo.save(queryRunner, withdrawal);
      await this._queryRunnerExec.commit(queryRunner);
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);
      this._logger.error(
        `Failed to persist approval for withdrawal ${withdrawalId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to approve withdrawal');
    }

    void this._auditService.logAction(LogAction.WITHDRAWAL_APPROVED, admin.id, {
      resourceType: 'withdrawal',
      resourceId: withdrawal.id,
      metadata: {
        amount: withdrawal.amount,
        beneficiary: owner.id,
        transferRef: transfer.reference,
      },
    });

    return {
      message: 'Withdrawal approved and payout initiated',
      data: withdrawal,
    };
  }

  /**
   * Admin: rejects a pending withdrawal and refunds the held funds to the wallet.
   */
  async rejectWithdrawal(
    admin: User,
    withdrawalId: string,
    reason: string,
  ): Promise<DataMessage<Withdrawal>> {
    const withdrawal = await this._withdrawalRepo.find(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Only pending withdrawals can be rejected (current: ${withdrawal.status})`,
      );
    }

    const queryRunner = await this._queryRunnerExec.getRunner();
    try {
      const wallet = await this._walletRepo.findByUserIdForUpdate(
        queryRunner,
        withdrawal.user.id,
      );
      if (!wallet) throw new ApplicationException('Wallet not found');

      const balanceAfter = Number(wallet.balance) + withdrawal.amount;
      await this._walletRepo.updateBalance(queryRunner, wallet, balanceAfter);

      await this._transactionRepo.add(
        queryRunner,
        {
          type: TransactionType.CREDIT,
          purpose: TransactionPurpose.WITHDRAWAL_REVERSAL,
          amount: withdrawal.amount,
          balanceAfter,
          reference: `WDR-REV-${withdrawal.id}`,
          paystackRef: `WDR-REV-${withdrawal.id}`,
        },
        withdrawal.user,
        wallet,
      );

      withdrawal.status = WithdrawalStatus.REJECTED;
      withdrawal.reviewedBy = admin.id;
      withdrawal.reviewNote = reason;
      await this._withdrawalRepo.save(queryRunner, withdrawal);

      await this._queryRunnerExec.commit(queryRunner);

      void this._auditService.logAction(
        LogAction.WITHDRAWAL_REJECTED,
        admin.id,
        {
          resourceType: 'withdrawal',
          resourceId: withdrawal.id,
          metadata: { amount: withdrawal.amount, reason, refunded: true },
        },
      );

      return {
        message: 'Withdrawal rejected and funds refunded',
        data: withdrawal,
      };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);
      if (error instanceof BadRequestException) throw error;

      this._logger.error(
        `Failed to reject withdrawal ${withdrawalId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to reject withdrawal');
    }
  }
}
