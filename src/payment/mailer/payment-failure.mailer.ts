import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMailer } from '../../lib/mailer/base-mailer.utils';
import { PaymentFailurePayload } from '../payment.types';

@Injectable()
export class PaymentFailureMailer extends BaseMailer<PaymentFailurePayload> {
  constructor(private readonly _configService: ConfigService) {
    super('payment-failure');
  }

  async sendMail(payload: PaymentFailurePayload): Promise<void> {
    const mailBody = await this._generateMailBody(payload);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Payment Processing Issue',
      to: payload.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
