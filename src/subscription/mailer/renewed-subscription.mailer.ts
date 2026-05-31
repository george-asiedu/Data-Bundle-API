import { Injectable } from '@nestjs/common';
import { BaseMailer } from '../../lib/mailer/base-mailer.utils';
import { RenewedSubscriptionPayload } from '../subscription.types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RenewedSubscriptionMailer extends BaseMailer<RenewedSubscriptionPayload> {
  constructor(private readonly _configService: ConfigService) {
    super('renewed-subscription');
  }

  async sendMail(payload: RenewedSubscriptionPayload): Promise<void> {
    const mailBody = await this._generateMailBody(payload);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Subscription Renewed',
      to: payload.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
