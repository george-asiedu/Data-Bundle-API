/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ApplicationException } from '../lib/exception/app.exception';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

@Injectable()
export class PaymentService {
  private readonly _logger = new Logger(PaymentService.name);
  private readonly _paystackSecretKey: string;
  private readonly _paystackBaseUrl: string;

  constructor(private _configService: ConfigService) {
    this._paystackSecretKey = this._configService.get<string>(
      'PAYSTACK_SECRET_KEY',
    ) as string;
    this._paystackBaseUrl = this._configService.get<string>(
      'PAYSTACK_BASE_URL',
    ) as string;
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
  async initializeTransaction(payload: InitializePaymentDto) {
    try {
      const response = await axios.post(
        `${this._paystackBaseUrl}/transaction/initialize`,
        {
          email: payload.email,
          amount: payload.amount * 100,
        },
        { headers: this.headers },
      );
      return response.data;
    } catch (error: unknown) {
      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
    }
  }

  /**
   * Verifies a payment transaction using its reference
   * @param reference - The transaction reference to verify
   * @returns A promise resolving to the transaction verification response
   */
  async verifyTransaction(reference: string) {
    try {
      const response = await axios.get(
        `${this._paystackBaseUrl}/transaction/verify/${reference}`,
        { headers: this.headers },
      );

      const { status } = response.data.data;

      if (status !== 'success') {
        throw new BadRequestException('Transaction was not successful');
      }

      return response.data;
    } catch (error: unknown) {
      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
    }
  }
}
