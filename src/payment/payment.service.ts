import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ApplicationException } from '../lib/exception/app.exception';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import {
  PaystackCreateSubaccountResponse,
  PaystackTransferRecipientResponse,
  PaystackTransferResponse,
  PaystackVerifyResponse,
  TransactionPurpose,
  TransactionType,
  WithdrawalStatus,
} from './payment.types';
import { TransactionRepository } from './repositories/transaction.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { WithdrawalRepository } from './repositories/withdrawal.repository';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { QueryRunner } from 'typeorm';
import { UserRepository } from '../auth/repositories/user.repository';
import { AccountStatus, Role } from '../auth/auth.types';
import { CompleteFinancialSetupDto } from './dto/financial-setup.dto';
import { SubscriptionService } from '../subscription/subscription.service';
import { PaymentFailureMailer } from './mailer/payment-failure.mailer';
import { PaymentSuccessMailer } from './mailer/payment-success.mailer';
import { EncryptionService } from '../auth/encryption.service';
import { AuditService } from '../audit/audit.service';
import { LogAction } from '../audit/log-action.types';

@Injectable()
export class PaymentService {
  private readonly _logger = new Logger(PaymentService.name);
  private readonly _paystackSecretKey: string;
  private readonly _paystackBaseUrl: string;
  private readonly _vendorApiKey: string;
  private readonly _http: AxiosInstance;

  constructor(
    private _configService: ConfigService,
    private _transactionRepo: TransactionRepository,
    private _walletRepo: WalletRepository,
    private readonly _withdrawalRepo: WithdrawalRepository,
    private _queryRunnerExec: QueryRunnerExec,
    private readonly _userRepo: UserRepository,
    private _subscriptionService: SubscriptionService,
    private __paymentFailureMailer: PaymentFailureMailer,
    private _paymentSuccessMailer: PaymentSuccessMailer,
    private readonly _encryptionService: EncryptionService,
    private readonly _auditService: AuditService,
  ) {
    this._paystackSecretKey = this._configService.get<string>(
      'PAYSTACK_SECRET_KEY',
    ) as string;
    this._paystackBaseUrl = this._configService.get<string>(
      'PAYSTACK_BASE_URL',
      'https://paystack.co',
    );
    this._vendorApiKey = this._configService.get<string>(
      'PLATFORM_DEFAULT_VENDOR_API_KEY',
    ) as string;

    // A single pre-configured client for every Paystack call. The explicit
    // timeout is critical: without it a slow/hanging gateway request keeps the
    // HTTP handler open until Render's edge proxy aborts it with a 503.
    this._http = axios.create({
      baseURL: this._paystackBaseUrl,
      timeout: this._configService.get<number>('PAYSTACK_TIMEOUT_MS', 15000),
      headers: {
        Authorization: `Bearer ${this._paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
    });
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
      const frontendUrl =
        this._configService.get<string>('FRONTEND_LOCAL_URL') ||
        this._configService.get<string>('FRONTEND_SERVER_URL');
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

      const response = await this._http.post<{
        status: boolean;
        message: string;
        data: {
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      }>('/transaction/initialize', paystackPayload);
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
    try {
      // Idempotency check: the webhook may have already processed this payment.
      const existingTx =
        await this._transactionRepo.findByPaystackRef(reference);
      if (existingTx) {
        return {
          message: 'Transaction already processed successfully.',
          accountStatus: existingTx.user?.accountStatus,
        };
      }

      const response = await this._http.get<PaystackVerifyResponse>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
      );

      const paystackData = response.data.data;

      if (paystackData.status !== 'success') {
        throw new BadRequestException('Transaction was not successful');
      }

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
      if (error instanceof HttpException) throw error;

      // A concurrent webhook may have inserted the transaction between our
      // idempotency check and our own insert. Treat the duplicate as success
      // rather than surfacing a 500 to the user.
      if (this._isDuplicateTransaction(error)) {
        const settled =
          await this._transactionRepo.findByPaystackRef(reference);
        return {
          message: 'Transaction already processed successfully.',
          accountStatus: settled?.user?.accountStatus,
        };
      }

      this._logger.error(
        `Verification processing failed for ref ${reference}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Something went wrong during payment verification',
      );
    }
  }

  /**
   * Initializes a Paystack charge for a public shop order (customer checkout).
   * No wallet/user is involved — the customer pays the retail price and receives
   * a Paystack receipt at their email. The order id is carried in metadata.
   * @param amount - retail price in pesewas (Paystack's smallest unit)
   */
  async initializeShopOrderPayment(input: {
    email: string;
    amount: number;
    orderId: string;
    shopSlug: string;
  }): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }> {
    try {
      const frontendUrl =
        this._configService.get<string>('FRONTEND_LOCAL_URL') ||
        this._configService.get<string>('FRONTEND_SERVER_URL');
      const callbackUrl = `${frontendUrl}/shop/${input.shopSlug}`;

      const response = await this._http.post<{
        status: boolean;
        message: string;
        data: {
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      }>('/transaction/initialize', {
        email: input.email,
        amount: input.amount,
        callback_url: callbackUrl,
        metadata: { orderId: input.orderId, purpose: 'SHOP_ORDER' },
      });
      return response.data.data;
    } catch (error: unknown) {
      this._logger.error(
        `Shop order payment init failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to start payment. Please try again.',
      );
    }
  }

  /**
   * Verifies a Paystack charge succeeded, with NO side effects (no wallet
   * credit). Used to confirm a customer shop payment before fulfilment.
   */
  async verifyChargeSucceeded(
    reference: string,
  ): Promise<{ success: boolean; amount: number }> {
    try {
      const response = await this._http.get<PaystackVerifyResponse>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
      );
      const data = response.data.data;
      return {
        success: data.status === 'success',
        amount: Number(data.amount) || 0,
      };
    } catch (error: unknown) {
      this._logger.error(
        `Charge verify failed for ${reference}: ${(error as Error).message}`,
      );
      return { success: false, amount: 0 };
    }
  }

  /** Detects a Postgres unique-constraint violation (duplicate paystackRef). */
  private _isDuplicateTransaction(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
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
      const frontendUrl =
        this._configService.get<string>('FRONTEND_LOCAL_URL') ||
        this._configService.get<string>('FRONTEND_SERVER_URL');
      const callbackUrl = `${frontendUrl}/payment-success`;

      const response = await this._http.post<{
        status: boolean;
        message: string;
        data: {
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      }>('/transaction/initialize', {
        email: payload.email,
        amount: payload.amount * 100,
        callback_url: callbackUrl,
        metadata: {
          userId,
          purpose: TransactionPurpose.REGISTRATION_FEE,
        },
      });
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

    // Payout settlement events are handled on their own path.
    if (
      event === 'transfer.success' ||
      event === 'transfer.failed' ||
      event === 'transfer.reversed'
    ) {
      await this._handleTransferEvent(event, data);
      return;
    }

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

    // Shop-order charges are customer payments (no wallet). They're fulfilled by
    // the shop confirm flow / order poller, not the wallet pipeline here.
    if ((purpose as string) === 'SHOP_ORDER') {
      this._logger.log(
        `Skipping wallet handling for shop-order charge ${paystackRef}`,
      );
      return;
    }

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

      if (purpose === TransactionPurpose.REGISTRATION_FEE) {
        user.accountStatus = AccountStatus.ACTIVE;
        await queryRunner.manager.save(user);

        await this._transactionRepo.add(
          queryRunner,
          {
            type: TransactionType.DEBIT,
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
            type: TransactionType.DEBIT,
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

      // Audit the confirmed money movement. The webhook has no req.user, so the
      // global interceptor can't capture this — log it explicitly here.
      void this._auditService.logAction(LogAction.PAYMENT_CONFIRMED, userId, {
        resourceType: 'transaction',
        resourceId: paystackRef,
        metadata: { purpose, amount: amountInCedis },
      });

      const customerEmail = data.customer?.email;
      const customerName = user.fullName || 'Agent';

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
   * Settles a withdrawal payout from a Paystack transfer webhook.
   * On success the request is marked PAID; on failure/reversal the held funds
   * are credited back to the wallet and the request is marked FAILED. Idempotent:
   * only acts on requests still in a non-terminal (APPROVED/PROCESSING) state.
   */
  private async _handleTransferEvent(
    event: string,
    data: unknown,
  ): Promise<void> {
    if (typeof data !== 'object' || data === null) {
      this._logger.error('Received malformed transfer webhook payload');
      return;
    }

    const transferCode = (data as { transfer_code?: unknown }).transfer_code;
    if (typeof transferCode !== 'string') {
      this._logger.error('Transfer webhook missing transfer_code');
      return;
    }

    const withdrawal =
      await this._withdrawalRepo.findByTransferCode(transferCode);
    if (!withdrawal) {
      this._logger.warn(
        `Transfer webhook for unknown transfer_code ${transferCode}`,
      );
      return;
    }

    const isTerminal =
      withdrawal.status === WithdrawalStatus.PAID ||
      withdrawal.status === WithdrawalStatus.FAILED;
    if (isTerminal) {
      this._logger.log(
        `Withdrawal ${withdrawal.id} already settled (${withdrawal.status}). Skipping.`,
      );
      return;
    }

    let queryRunner: QueryRunner | undefined = undefined;
    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      if (event === 'transfer.success') {
        withdrawal.status = WithdrawalStatus.PAID;
        await this._withdrawalRepo.save(queryRunner, withdrawal);
        await this._queryRunnerExec.commit(queryRunner);

        void this._auditService.logAction(
          LogAction.WITHDRAWAL_PAID,
          withdrawal.user?.id,
          {
            resourceType: 'withdrawal',
            resourceId: withdrawal.id,
            metadata: { amount: withdrawal.amount },
          },
        );
        return;
      }

      // transfer.failed | transfer.reversed → refund the held funds.
      const wallet = await this._walletRepo.findByUserIdForUpdate(
        queryRunner,
        withdrawal.user.id,
      );
      if (!wallet)
        throw new ApplicationException('Wallet not found for refund');

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

      withdrawal.status = WithdrawalStatus.FAILED;
      await this._withdrawalRepo.save(queryRunner, withdrawal);
      await this._queryRunnerExec.commit(queryRunner);

      void this._auditService.logAction(
        LogAction.WITHDRAWAL_FAILED,
        withdrawal.user?.id,
        {
          resourceType: 'withdrawal',
          resourceId: withdrawal.id,
          metadata: { amount: withdrawal.amount, event, refunded: true },
        },
      );
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);
      this._logger.error(
        `Failed to settle transfer for withdrawal ${withdrawal.id}: ${(error as Error).message}`,
      );
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
      const response = await this._http.get<unknown>('/bank/resolve', {
        params: { account_number: accountNumber, bank_code: bankCode },
      });
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
    platformPercentage: number = 10,
  ): Promise<string> {
    try {
      const response = await this._http.post<PaystackCreateSubaccountResponse>(
        '/subaccount',
        {
          business_name: businessName,
          settlement_bank: settlementBank,
          account_number: accountNumber,
          percentage_charge: platformPercentage,
        },
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
   * Creates (or re-fetches) a Paystack transfer recipient for an agent's
   * settlement account. Required before any payout can be initiated.
   * @returns the recipient_code to attach to the transfer
   */
  async createTransferRecipient(
    name: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<string> {
    try {
      const response = await this._http.post<PaystackTransferRecipientResponse>(
        '/transferrecipient',
        {
          type: 'ghipss', // Ghana bank/MoMo settlement
          name,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'GHS',
        },
      );

      return response.data.data.recipient_code;
    } catch (error: unknown) {
      this._logger.error(
        `Transfer recipient creation failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Could not register the settlement account with the payment gateway.',
      );
    }
  }

  /**
   * Initiates a payout to a previously-created recipient.
   * @param amountGhs - amount in whole GHS; converted to pesewas for Paystack
   * @returns the transfer code, gateway reference and current status
   */
  async initiateTransfer(
    amountGhs: number,
    recipientCode: string,
    reason: string,
    reference: string,
  ): Promise<{ transferCode: string; reference: string; status: string }> {
    try {
      const response = await this._http.post<PaystackTransferResponse>(
        '/transfer',
        {
          source: 'balance',
          amount: amountGhs * 100,
          recipient: recipientCode,
          reason,
          reference,
          currency: 'GHS',
        },
      );

      return {
        transferCode: response.data.data.transfer_code,
        reference: response.data.data.reference,
        status: response.data.data.status,
      };
    } catch (error: unknown) {
      this._logger.error(
        `Transfer initiation failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to initiate the payout with the payment gateway.',
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
      if (!user) throw new ApplicationException('User account not found');

      if (user.paystackSubaccountCode) {
        throw new ApplicationException('Financial profile already configured.');
      }

      // Create the Subaccount on Paystack (e.g., 10% platform fee)
      const subaccountCode = await this.createSubaccount(
        payload.businessName,
        payload.bankCode,
        payload.accountNumber,
      );

      queryRunner = await this._queryRunnerExec.getRunner();

      if (payload.vendorApiKey) {
        user.apiKey = this._encryptionService.encrypt(payload.vendorApiKey);
      } else {
        user.apiKey = this._encryptionService.encrypt(this._vendorApiKey);
      }

      await this._userRepo.update(queryRunner, user, {
        paystackSubaccountCode: subaccountCode,
        settlementBankAccount: payload.bankCode,
        accountNumber: payload.accountNumber,
        businessName: payload.businessName,
        apiKey: user.apiKey,
      });
      await this._queryRunnerExec.commit(queryRunner);

      this._logger.log(`Financial setup completed for Agent ${userId}`);

      return {
        message: 'Financial profile successfully created and linked.',
        data: { user },
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

  /**
   * Fetches the complete list of supported banks and mobile money providers in Ghana
   */
  async getGhanaBanks(): Promise<any> {
    try {
      const response = await this._http.get('/bank', {
        params: { country: 'ghana' },
      });
      return response.data;
    } catch (error: unknown) {
      this._logger.error(
        `Failed to fetch bank list: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve settlement providers.',
      );
    }
  }

  /**
   * Updates an existing Agent's financial subaccount details both on Paystack and locally
   */
  async updateAgentFinancialSetup(
    userId: string,
    payload: CompleteFinancialSetupDto,
  ) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      const user = await this._userRepo.find(userId);
      if (!user) throw new ApplicationException('User account not found');
      if (!user.paystackSubaccountCode) {
        throw new ApplicationException(
          'No existing financial subaccount profile found to update.',
        );
      }

      await this.resolveAccountNumber(payload.accountNumber, payload.bankCode);

      await this._http.put(`/subaccount/${user.paystackSubaccountCode}`, {
        business_name: payload.businessName,
        settlement_bank: payload.bankCode,
        account_number: payload.accountNumber,
        percentage_charge: 10,
      });

      queryRunner = await this._queryRunnerExec.getRunner();

      await this._userRepo.update(queryRunner, user, {
        settlementBankAccount: payload.bankCode,
        accountNumber: payload.accountNumber,
        businessName: payload.businessName,
      });
      await this._queryRunnerExec.commit(queryRunner);

      this._logger.log(
        `Financial profile configuration updated for Agent ${userId}`,
      );

      return {
        message: 'Financial profile details successfully updated.',
      };
    } catch (error: unknown) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error(
        `Failed to update financial profile for ${userId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update financial configuration details.',
      );
    }
  }

  /**
   * Fetches all registration accounts managed on the platform's Paystack account (Admin only)
   */
  async getAllPlatformSubaccounts(): Promise<any> {
    try {
      const response = await this._http.get('/subaccount');
      return response.data;
    } catch (error: unknown) {
      this._logger.error(
        `Admin subaccounts retrieval failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch platform subaccounts from payment gateway.',
      );
    }
  }
}
