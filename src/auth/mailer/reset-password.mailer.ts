import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Data } from '../../lib/mailer/types.mailer';
import { BaseMailer } from '../../lib/mailer/base-mailer.utils';

@Injectable()
export class ResetPasswordMailer extends BaseMailer<Data> {
  constructor(private readonly _configService: ConfigService) {
    super('reset-password');
  }

  async sendMail(body: Data): Promise<void> {
    const mailBody = await this._generateMailBody(body);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Password Reset Confirmation',
      to: body.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
