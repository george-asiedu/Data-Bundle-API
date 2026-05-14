import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { renderFile } from 'ejs';
import * as sendGrid from '@sendgrid/mail';

import { Data } from './types.mailer';

export abstract class BaseMailer<T extends Data> {
  private _mailerTemplate: string;

  constructor(template: string) {
    this._mailerTemplate = template;
  }

  protected __createTransport(configService: ConfigService) {
    sendGrid.setApiKey(configService.get('SENDGRID_API_KEY') as string);
    return sendGrid;
  }

  protected _generateMailBody(body: T): Promise<string> {
    const templatePath = join(
      process.cwd(),
      'templates',
      `${this._mailerTemplate}.ejs`,
    );
    return renderFile(templatePath, body);
  }

  abstract sendMail(body: T): Promise<void>;
}
