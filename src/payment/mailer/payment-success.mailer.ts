import { Injectable } from '@nestjs/common';
import { BaseMailer } from '../../lib/mailer/base-mailer.utils';
import { ConfigService } from '@nestjs/config';
import { PaymentSuccessPayload } from '../payment.types';

@Injectable()
export class PaymentSuccessMailer extends BaseMailer<PaymentSuccessPayload> {
  constructor(private readonly _configService: ConfigService) {
    super('payment-success');
  }

  async sendMail(payload: PaymentSuccessPayload): Promise<void> {
    const mailBody = await this._generateMailBody(payload);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Payment Received Successfully',
      to: payload.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
