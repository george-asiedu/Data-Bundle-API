import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BaseMailer } from 'src/lib/mailer/base-mailer.utils';
import { RequestEmailResetType } from '../auth.types';

@Injectable()
export class RequestEmailResetMailer extends BaseMailer<RequestEmailResetType> {
  constructor(private readonly _configService: ConfigService) {
    super('request-email-reset');
  }

  async sendMail(body: RequestEmailResetType): Promise<void> {
    const mailBody = await this._generateMailBody(body);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Request Email Reset',
      to: body.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
