/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
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

@ApiTags('Payment')
@UseGuards(AuthGuard)
@ApiBearerAuth()
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

  @ApiOperation({ summary: 'Initialize a new payment transaction' })
  @HttpCode(HttpStatus.OK)
  @Post('initialize')
  async initializePayment(@Body() body: InitializePaymentDto) {
    return this._paymentService.initializeTransaction(body);
  }

  @ApiOperation({ summary: 'Verify a payment transaction' })
  @HttpCode(HttpStatus.OK)
  @Get('verify/:reference')
  async verifyPayment(@Param('reference') reference: string) {
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
  handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: any,
  ) {
    // Verify the webhook is genuinely from Paystack
    const hash = crypto
      .createHmac('sha512', this._paystackSecretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hash !== signature) {
      return { message: 'Invalid signature' };
    }

    // Handle specific events
    switch (payload.event) {
      case 'charge.success':
        this._logger.log('Payment successful:', payload.data);
        break;
      case 'transfer.success':
        this._logger.log('Transfer successful:', payload.data);
        break;
    }

    return { message: 'Webhook received' };
  }
}
