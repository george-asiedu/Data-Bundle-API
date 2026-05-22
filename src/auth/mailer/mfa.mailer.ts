import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationType } from '../auth.types';
import { BaseMailer } from '../../lib/mailer/base-mailer.utils';

@Injectable()
export class MfaMailer extends BaseMailer<VerificationType> {
  constructor(private readonly _configService: ConfigService) {
    super('mfa-verification');
  }

  async sendMail(body: VerificationType): Promise<void> {
    const mailBody = await this._generateMailBody(body);
    const transporter = this.__createTransport(this._configService);

    await transporter.send({
      subject: 'Your Login Verification Code',
      to: body.email,
      from: {
        email: this._configService.get<string>('SENDER_EMAIL') as string,
        name: this._configService.get<string>('SENDGRID_NAME') as string,
      },
      html: mailBody,
    });
  }
}
