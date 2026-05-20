import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConfirmationType } from '../auth.types';
import { BaseMailer } from '../../lib/mailer/base-mailer.utils';

@Injectable()
export class ConfirmationMailer extends BaseMailer<ConfirmationType> {
  constructor(private readonly _configService: ConfigService) {
    super('confirmation');
  }

  async sendMail(body: ConfirmationType): Promise<void> {
    const mailBody = await this._generateMailBody(body);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Account Confirmation',
      to: body.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
