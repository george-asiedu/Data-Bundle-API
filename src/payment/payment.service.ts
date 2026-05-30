/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ApplicationException } from '../lib/exception/app.exception';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { TransactionPurpose, TransactionType } from './payment.types';
import { TransactionRepository } from './repositories/transaction.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { QueryRunner } from 'typeorm';
import { UserRepository } from '../auth/repositories/user.repository';
import { AccountStatus, Role } from '../auth/auth.types';

@Injectable()
export class PaymentService {
  private readonly _logger = new Logger(PaymentService.name);
  private readonly _paystackSecretKey: string;
  private readonly _paystackBaseUrl: string;

  constructor(
    private _configService: ConfigService,
    private _transactionRepo: TransactionRepository,
    private _walletRepo: WalletRepository,
    private _queryRunnerExec: QueryRunnerExec,
    private readonly _userRepo: UserRepository,
  ) {
    this._paystackSecretKey = this._configService.get<string>(
      'PAYSTACK_SECRET_KEY',
    ) as string;
    this._paystackBaseUrl = this._configService.get<string>(
      'PAYSTACK_BASE_URL',
      'https://paystack.co',
    );
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this._paystackSecretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Initializes a new payment transaction
   * @param payload - The payment initialization payload
   * @returns A promise resolving to the transaction initialization response
   */
  async initializeTransaction(payload: InitializePaymentDto, userId: string) {
    const user = await this._userRepo.find(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    try {
      const frontendUrl = this._configService.get<string>('FRONTEND_LOCAL_URL');
      const callbackUrl = `${frontendUrl}/payment-success`;

      const paystackPayload: any = {
        email: payload.email,
        amount: payload.amount,
        callback_url: callbackUrl,
        metadata: { userId, purpose: TransactionPurpose.TOP_UP },
      };

      // SPLIT LOGIC: If a Sub-Agent is topping up, route cash to their Parent Agent
      if (user.role === Role.SUB_AGENT && user.parentAgentId) {
        const parentAgent = await this._userRepo.find(user.parentAgentId);

        if (!parentAgent || !parentAgent.paystackSubaccountCode) {
          throw new BadRequestException(
            'Parent Agent has not completed financial setup.',
          );
        }

        // Attach the subaccount code to trigger Paystack's split feature
        paystackPayload.subaccount = parentAgent.paystackSubaccountCode;
      }

      const response = await axios.post(
        `${this._paystackBaseUrl}/transaction/initialize`,
        paystackPayload,
        { headers: this.headers },
      );
      return response.data;
    } catch (error: unknown) {
      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to generate payment link');
    }
  }

  /**
   * Verifies a payment transaction using its reference and processes account activation
   * if it is a registration fee payment.
   * @param reference - The transaction reference to verify
   */
  async verifyTransaction(reference: string) {
    // Idempotency check: Don't process if the transaction log already exists
    const existingTx = await this._transactionRepo.findByPaystackRef(reference);
    if (existingTx) {
      return { message: 'Transaction already processed successfully.' };
    }

    let queryRunner: QueryRunner | undefined = undefined;

    try {
      const response = await axios.get(
        `${this._paystackBaseUrl}/transaction/verify/${reference}`,
        { headers: this.headers },
      );

      const paystackData = response.data.data;
      const status = paystackData.status;
      const amountInGhs = paystackData.amount;
      const purpose = paystackData.metadata?.purpose;

      const userId = paystackData.metadata?.userId as string;
      if (!userId) {
        throw new BadRequestException(
          'Transaction metadata is missing user context',
        );
      }

      if (status !== 'success') {
        throw new BadRequestException('Transaction was not successful');
      }

      queryRunner = await this._queryRunnerExec.getRunner();

      const wallet = await this._walletRepo.findByUserId(userId);
      if (!wallet) throw new ApplicationException('Wallet not found');

      const user = await this._userRepo.find(userId);
      if (!user) throw new ApplicationException('User not found');

      if (purpose === TransactionPurpose.REGISTRATION_FEE) {
        user.accountStatus = AccountStatus.ACTIVE;
        await queryRunner.manager.save(user);

        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.CREDIT,
            purpose: TransactionPurpose.REGISTRATION_FEE,
            amount: amountInGhs,
            balanceAfter: Number(wallet.balance),
            reference: `REG-${Date.now()}`,
            paystackRef: reference,
          },
          user,
          wallet,
        );

        this._logger.log(
          `Account successfully activated for user ${userId} via registration payment.`,
        );
      } else {
        const balanceAfter = Number(wallet.balance) + amountInGhs;

        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.CREDIT,
            purpose: TransactionPurpose.TOP_UP,
            amount: amountInGhs,
            balanceAfter: balanceAfter,
            reference: `TOP-UP-${Date.now()}`,
            paystackRef: reference,
          },
          user,
          wallet,
        );

        await this._walletRepo.updateBalance(queryRunner, wallet, balanceAfter);
      }

      await this._queryRunnerExec.commit(queryRunner);

      return {
        message: 'Transaction verified and processed successfully',
        accountStatus: user.accountStatus,
      };
    } catch (error: unknown) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error(
        `Verification processing failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Something went wrong during payment verification',
      );
    }
  }

  /**
   * Initializes a payment transaction specifically for user registration fees
   * @param email - The email of the user making the payment
   * @param amount - The amount to be paid
   * @param userId - The ID of the user making the payment
   * @returns A promise resolving to the transaction initialization response
   */
  async initializeTransactionForRegistration(
    payload: InitializePaymentDto,
    userId: string,
  ) {
    try {
      const frontendUrl = this._configService.get<string>('FRONTEND_LOCAL_URL');
      const callbackUrl = `${frontendUrl}/payment-success`;

      const response = await axios.post(
        `${this._paystackBaseUrl}/transaction/initialize`,
        {
          email: payload.email,
          amount: payload.amount * 100,
          callback_url: callbackUrl,
          metadata: {
            userId,
            purpose: TransactionPurpose.REGISTRATION_FEE,
          },
        },
        { headers: this.headers },
      );
      return response.data;
    } catch (error: any) {
      const gatewayErrorMessage =
        error.response?.data?.message || error.message;
      this._logger.error(
        `Failed to initialize registration payment: ${gatewayErrorMessage}`,
      );
      throw new InternalServerErrorException(
        'Payment gateway link generation failed',
      );
    }
  }

  async processWebhookEvent(payload: any) {
    if (payload.event !== 'charge.success') return;

    const data = payload.data;
    const paystackRef = data.reference;
    const amountInGhs = data.amount;
    const userId = data.metadata?.userId as string;
    const purpose = data.metadata?.purpose;

    if (!userId || !purpose) return;

    // IIdempotency check: Don't process duplicate hooks
    const existingTx = await this._transactionRepo.findByPaystackRef(
      paystackRef as string,
    );
    if (existingTx) {
      this._logger.log(
        `Transaction ${paystackRef} already processed. Skipping.`,
      );
      return;
    }

    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const wallet = await this._walletRepo.findByUserId(userId);
      if (!wallet) throw new ApplicationException('Wallet not found');

      const user = await this._userRepo.find(userId);
      if (!user) throw new ApplicationException('User not found');

      if (purpose === TransactionPurpose.REGISTRATION_FEE) {
        user.accountStatus = AccountStatus.ACTIVE;
        await queryRunner.manager.save(user);

        // Log payment as a non-wallet transaction (balanceAfter stays the same)
        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.CREDIT,
            purpose: TransactionPurpose.REGISTRATION_FEE,
            amount: amountInGhs,
            balanceAfter: Number(wallet.balance),
            reference: `REG-${Date.now()}`,
            paystackRef: paystackRef,
          },
          user,
          wallet,
        );

        this._logger.log(
          `Account successfully activated for user ${userId} via registration payment.`,
        );
      } else if (purpose === TransactionPurpose.TOP_UP) {
        const balanceAfter = Number(wallet.balance) + amountInGhs;

        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.CREDIT,
            purpose: TransactionPurpose.TOP_UP,
            amount: amountInGhs,
            balanceAfter: balanceAfter,
            reference: `TOP-UP-${Date.now()}`,
            paystackRef: paystackRef,
          },
          user,
          wallet,
        );

        await this._walletRepo.updateBalance(queryRunner, wallet, balanceAfter);
      }

      await this._queryRunnerExec.commit(queryRunner);
      this._logger.log(
        `Successfully credited wallet for user ${userId} via ${paystackRef}`,
      );
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);
      this._logger.error(
        `Failed to process webhook for ${paystackRef}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Webhook processing failed');
    }
  }

  /**
   * Verifies an account number and bank code via Paystack
   */
  async resolveAccountNumber(accountNumber: string, bankCode: string) {
    try {
      const response = await axios.get(
        `${this._paystackBaseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: this.headers },
      );
      return response.data;
    } catch (error: any) {
      this._logger.error(`Account resolution failed: ${error.message}`);
      throw new BadRequestException(
        'Could not verify bank account details. Please check the number and bank.',
      );
    }
  }

  /**
   * Creates a Paystack Subaccount for an Agent during onboarding
   */
  async createSubaccount(
    businessName: string,
    settlementBank: string,
    accountNumber: string,
    platformPercentage: number = 0, // Set default platform cut here
  ) {
    try {
      const response = await axios.post(
        `${this._paystackBaseUrl}/subaccount`,
        {
          business_name: businessName,
          settlement_bank: settlementBank,
          account_number: accountNumber,
          percentage_charge: platformPercentage,
        },
        { headers: this.headers },
      );

      // Return the subaccount_code to be saved in the users table
      return response.data.data.subaccount_code;
    } catch (error: any) {
      this._logger.error(
        `Subaccount creation failed: ${error.response?.data?.message || error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to setup financial profile with the payment gateway.',
      );
    }
  }
}
