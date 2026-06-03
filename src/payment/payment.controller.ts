import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PaymentService } from './payment.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import {
  CompleteFinancialSetupDto,
  VerifyBankDto,
} from './dto/financial-setup.dto';
import { Response } from 'express';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  private readonly _logger = new Logger(PaymentController.name);
  private readonly _paystackSecretKey: string;

  constructor(
    private readonly _paymentService: PaymentService,
    private readonly _configService: ConfigService,
  ) {
    this._paystackSecretKey = this._configService.get<string>(
      'PAYSTACK_SECRET_KEY',
    ) as string;
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize a new payment transaction' })
  @HttpCode(HttpStatus.OK)
  @Post('initialize')
  async initializePayment(
    @Body() body: InitializePaymentDto,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    return this._paymentService.initializeTransaction(body, user.id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize a registration payment transaction' })
  @HttpCode(HttpStatus.OK)
  @Post('initialize/registration')
  async initializeRegistrationPayment(
    @Body() body: InitializePaymentDto,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    return this._paymentService.initializeTransactionForRegistration(
      body,
      user.id,
    );
  }

  @ApiOperation({ summary: 'Verify a payment transaction' })
  @HttpCode(HttpStatus.OK)
  @Get('verify/:reference')
  async verifyPayment(@Param('reference') reference: string) {
    if (!reference)
      throw new BadRequestException('Transaction reference is required');
    return this._paymentService.verifyTransaction(reference);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify bank account or MoMo number' })
  @HttpCode(HttpStatus.OK)
  @Get('verify-bank')
  async verifyBankAccount(
    @Query(ValidationPipe) query: VerifyBankDto,
  ): Promise<unknown> {
    return this._paymentService.resolveAccountNumber(
      query.accountNumber,
      query.bankCode,
    );
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete Agent financial onboarding and create subaccount',
  })
  @HttpCode(HttpStatus.OK)
  @Post('complete-financial-setup')
  async completeAgentFinancialSetup(
    @Body(ValidationPipe) payload: CompleteFinancialSetupDto,
    @CurrentUser() user: User,
  ) {
    return this._paymentService.completeAgentFinancialSetup(user.id, payload);
  }

  /**
   * Handles Paystack webhook events for payment notifications (live and test)
   * @param signature - The Paystack signature from the request headers
   * @param payload - The webhook event payload
   * @returns A response indicating the webhook was received
   */
  @ApiProperty({
    description: 'Handle Paystack webhook events for payment notifications',
  })
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: any,
    @Res() res: Response,
  ) {
    const hash = crypto
      .createHmac('sha512', this._paystackSecretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hash !== signature) {
      this._logger.warn('Invalid Paystack webhook signature');
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'Invalid signature' });
    }

    this._paymentService
      .processWebhookEvent(payload as { event: string; data: unknown })
      .catch((err: unknown) => {
        this._logger.error(
          `Unhandled error in background webhook processor: ${(err as Error).message}`,
        );
      });

    return res.status(HttpStatus.OK).send('Webhook received');
  }
}
