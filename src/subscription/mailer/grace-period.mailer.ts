import { Injectable } from '@nestjs/common';
import { BaseMailer } from '../../lib/mailer/base-mailer.utils';
import { GracePeriodPayload } from '../subscription.types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GracePeriodMailer extends BaseMailer<GracePeriodPayload> {
  constructor(private readonly _configService: ConfigService) {
    super('grace-period');
  }

  async sendMail(payload: GracePeriodPayload): Promise<void> {
    const mailBody = await this._generateMailBody(payload);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Subscription Renewal Notice',
      to: payload.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
