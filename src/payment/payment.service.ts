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
import {
  PaystackCreateSubaccountResponse,
  PaystackVerifyResponse,
  TransactionPurpose,
  TransactionType,
} from './payment.types';
import { TransactionRepository } from './repositories/transaction.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { QueryRunner } from 'typeorm';
import { UserRepository } from '../auth/repositories/user.repository';
import { AccountStatus, Role } from '../auth/auth.types';
import { CompleteFinancialSetupDto } from './dto/financial-setup.dto';
import { SubscriptionService } from '../subscription/subscription.service';
import { PaymentFailureMailer } from './mailer/payment-failure.mailer';
import { PaymentSuccessMailer } from './mailer/payment-success.mailer';
import { EncryptionService } from '../auth/encryption.service';

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
    private _subscriptionService: SubscriptionService,
    private __paymentFailureMailer: PaymentFailureMailer,
    private _paymentSuccessMailer: PaymentSuccessMailer,
    private readonly _encryptionService: EncryptionService,
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

      const paystackPayload: {
        email: string;
        amount: number;
        callback_url: string;
        metadata: { userId: string; purpose: TransactionPurpose };
        subaccount?: string;
        bearer?: string;
      } = {
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
        paystackPayload.bearer = 'subaccount';
      }

      const response = await axios.post<{
        status: boolean;
        message: string;
        data: {
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      }>(`${this._paystackBaseUrl}/transaction/initialize`, paystackPayload, {
        headers: this.headers,
      });
      return response.data;
    } catch (error: unknown) {
      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to generate payment link');
    }
  }

  /**
   * Verifies a payment transaction using its reference via the frontend.
   * Delegates database execution to the primary success handler.
   * @param reference - The transaction reference to verify
   */
  async verifyTransaction(reference: string) {
    // Idempotency check: Don't process if the transaction log already exists
    const existingTx = await this._transactionRepo.findByPaystackRef(reference);
    if (existingTx) {
      return {
        message: 'Transaction already processed successfully.',
        accountStatus: existingTx.user.accountNumber,
      };
    }

    try {
      const response = await axios.get<PaystackVerifyResponse>(
        `${this._paystackBaseUrl}/transaction/verify/${reference}`,
        { headers: this.headers },
      );

      const paystackData = response.data.data;
      const status = paystackData.status;

      if (status !== 'success') {
        throw new BadRequestException('Transaction was not successful');
      }

      // This automatically triggers database updates, commits, and emails
      await this.handleSuccessfulPayment(reference, paystackData);

      const userId = paystackData.metadata?.userId as string;
      const user = await this._userRepo.find(userId);

      return {
        message: 'Transaction verified and processed successfully',
        accountStatus: user?.accountStatus,
      };
    } catch (error: unknown) {
      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error(
        `Verification processing failed for ref ${reference}: ${(error as Error).message}`,
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
  ): Promise<{
    status: boolean;
    message: string;
    data: {
      authorization_url: string;
      access_code: string;
      reference: string;
    };
  }> {
    try {
      const frontendUrl = this._configService.get<string>('FRONTEND_LOCAL_URL');
      const callbackUrl = `${frontendUrl}/payment-success`;

      const response = await axios.post<{
        status: boolean;
        message: string;
        data: {
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      }>(
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
    } catch (error: unknown) {
      const gatewayErrorMessage = (() => {
        if (axios.isAxiosError(error)) {
          const data = error.response?.data as unknown;
          if (
            data &&
            typeof data === 'object' &&
            'message' in data &&
            typeof data.message === 'string'
          ) {
            return (data as { message: string }).message;
          }
          return error.message;
        }
        if (error instanceof Error) {
          return error.message;
        }
        return 'Unknown error';
      })();

      this._logger.error(
        `Failed to initialize registration payment: ${gatewayErrorMessage}`,
      );
      throw new InternalServerErrorException(
        'Payment gateway link generation failed',
      );
    }
  }

  /**
   * Primary entry point for Paystack Webhook events.
   * Routes the payload to the appropriate handler based on the event type.
   */
  async processWebhookEvent(payload: {
    event: string;
    data: unknown;
  }): Promise<void> {
    const event = payload.event;
    const data = payload.data;

    if (event !== 'charge.success') {
      this._logger.log(`Received non-processable webhook event: ${event}`);
      return;
    }

    if (typeof data !== 'object' || data === null) {
      this._logger.error('Received malformed webhook payload data');
      return;
    }

    const typedData = data as PaystackVerifyResponse['data'];

    const reference =
      typeof typedData.reference === 'string' ? typedData.reference : undefined;

    if (!reference) {
      this._logger.error('Webhook payload missing reference');
      return;
    }

    try {
      // Idempotency check: Don't process duplicate hooks
      const existingTx =
        await this._transactionRepo.findByPaystackRef(reference);
      if (existingTx) {
        this._logger.log(
          `Transaction ${reference} already processed. Skipping webhook.`,
        );
        return;
      }

      await this.handleSuccessfulPayment(reference, typedData);
    } catch (error) {
      this._logger.error(
        `Webhook processing failed for ${reference}: ${(error as Error).message}`,
      );

      // Attempt to notify the user if an error occurs
      const userEmail =
        typeof typedData.customer?.email === 'string'
          ? typedData.customer.email
          : undefined;
      if (userEmail) {
        const customerName =
          typeof typedData.customer?.first_name === 'string'
            ? typedData.customer.first_name
            : 'Agent';

        await this.__paymentFailureMailer
          .sendMail({
            email: userEmail,
            name: customerName,
            reference: reference,
            errorReason:
              'Payment verified, but account update failed. Contact support.',
          })
          .catch((mailErr) =>
            this._logger.error(
              `Failed to send failure email: ${(mailErr as Error).message}`,
            ),
          );
      }
    }
  }

  private async handleSuccessfulPayment(
    paystackRef: string,
    data: {
      metadata?: { userId?: string; purpose?: TransactionPurpose };
      customer?: { email?: string; first_name?: string };
      amount?: number | string;
    },
  ): Promise<void> {
    const userId = data.metadata?.userId as string;
    const purpose = data.metadata?.purpose as TransactionPurpose;
    const amountInCedis = Number(data.amount) / 100;

    if (!userId || !purpose) {
      throw new BadRequestException('Missing required transaction metadata');
    }

    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const wallet = await this._walletRepo.findByUserId(userId);
      const user = await this._userRepo.find(userId);
      if (!wallet || !user)
        throw new ApplicationException('User or Wallet not found');

      // Route logic based on transaction purpose
      if (purpose === TransactionPurpose.REGISTRATION_FEE) {
        user.accountStatus = AccountStatus.ACTIVE;
        await queryRunner.manager.save(user);

        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.CREDIT,
            purpose: TransactionPurpose.REGISTRATION_FEE,
            amount: amountInCedis,
            balanceAfter: Number(wallet.balance),
            reference: `REG-${Date.now()}`,
            paystackRef,
          },
          user,
          wallet,
        );
      } else if (purpose === TransactionPurpose.SUBSCRIPTION_PAYMENT) {
        await this._subscriptionService.activateSubscription(queryRunner, user);

        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.CREDIT,
            purpose: TransactionPurpose.SUBSCRIPTION_PAYMENT,
            amount: amountInCedis,
            balanceAfter: Number(wallet.balance),
            reference: `SUB-${Date.now()}`,
            paystackRef,
          },
          user,
          wallet,
        );
      } else if (purpose === TransactionPurpose.TOP_UP) {
        const balanceAfter = Number(wallet.balance) + amountInCedis;

        await this._walletRepo.updateBalance(queryRunner, wallet, balanceAfter);

        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.CREDIT,
            purpose: TransactionPurpose.TOP_UP,
            amount: amountInCedis,
            balanceAfter,
            reference: `TOP-UP-${Date.now()}`,
            paystackRef,
          },
          user,
          wallet,
        );
      }

      await this._queryRunnerExec.commit(queryRunner);

      const customerEmail = data.customer?.email;
      const customerName = data.customer?.first_name || 'Agent';

      if (customerEmail) {
        await this._paymentSuccessMailer
          .sendMail({
            email: customerEmail,
            name: customerName,
            amountGhs: Number(data.amount) / 100,
            purpose,
            reference: paystackRef,
          })
          .catch((err: unknown) =>
            this._logger.error(
              `Failed to send success mail: ${(err as Error).message}`,
            ),
          );
      } else {
        this._logger.log(
          `Skipping success email for payment ${paystackRef}: missing customer email`,
        );
      }

      this._logger.log(
        `Successfully processed ${purpose} for user ${userId} via ref: ${paystackRef}`,
      );
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);
      this._logger.error(
        `Failed to handle successful payment ${paystackRef}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Verifies an account number and bank code via Paystack
   */
  async resolveAccountNumber(
    accountNumber: string,
    bankCode: string,
  ): Promise<unknown> {
    try {
      const response = await axios.get<unknown>(
        `${this._paystackBaseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: this.headers },
      );
      return response.data;
    } catch (error: unknown) {
      this._logger.error(
        `Account resolution failed: ${(error as Error).message}`,
      );
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
    platformPercentage: number,
  ): Promise<string> {
    try {
      const response = await axios.post<PaystackCreateSubaccountResponse>(
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
    } catch (error: unknown) {
      this._logger.error(
        `Subaccount creation failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to setup financial profile with the payment gateway.',
      );
    }
  }

  /**
   * Completes the financial onboarding for an Agent
   */
  async completeAgentFinancialSetup(
    userId: string,
    payload: CompleteFinancialSetupDto,
  ) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      const user = await this._userRepo.find(userId);
      if (!user) throw new ApplicationException('User not found');

      if (user.paystackSubaccountCode) {
        throw new ApplicationException('Financial profile already configured.');
      }

      // Verify the bank details first to prevent junk data
      await this.resolveAccountNumber(payload.accountNumber, payload.bankCode);

      // Create the Subaccount on Paystack (e.g., 10% platform fee)
      const platformFeePercentage = 10;
      const subaccountCode = await this.createSubaccount(
        payload.businessName,
        payload.bankCode,
        payload.accountNumber,
        platformFeePercentage,
      );

      queryRunner = await this._queryRunnerExec.getRunner();

      user.paystackSubaccountCode = subaccountCode;
      user.settlementBankAccount = payload.bankCode;
      user.accountNumber = payload.accountNumber;

      if (payload.vendorApiKey) {
        user.apiKey = this._encryptionService.encrypt(payload.vendorApiKey);
      }

      await queryRunner.manager.save(user);
      await this._queryRunnerExec.commit(queryRunner);

      this._logger.log(`Financial setup completed for Agent ${userId}`);

      return {
        message: 'Financial profile successfully created and linked.',
        data: { subaccountCode },
      };
    } catch (error: unknown) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error(
        `Financial setup failed for ${userId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'System failed to configure financial profile.',
      );
    }
  }
}
