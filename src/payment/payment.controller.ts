/* eslint-disable @typescript-eslint/no-unsafe-return */
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
  UseGuards,
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
  ) {
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
  ) {
    return this._paymentService.initializeTransactionForRegistration(
      body,
      user.id,
    );
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a payment transaction' })
  @HttpCode(HttpStatus.OK)
  @Get('verify/:reference')
  async verifyPayment(@Param('reference') reference: string) {
    if (!reference)
      throw new BadRequestException('Transaction reference is required');
    return this._paymentService.verifyTransaction(reference);
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
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: any,
  ) {
    // Verify the webhook is genuinely from Paystack
    const hash = crypto
      .createHmac('sha512', this._paystackSecretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hash !== signature) {
      this._logger.warn('Invalid Paystack webhook signature');
      return { message: 'Invalid signature' };
    }

    await this._paymentService.processWebhookEvent(payload);

    return { message: 'Webhook received' };
  }
}
