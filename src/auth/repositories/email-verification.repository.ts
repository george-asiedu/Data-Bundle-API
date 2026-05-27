import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

import { VerificationType } from '../auth.types';
import { EmailVerification } from '../entities/email-verification.entity';

@Injectable()
export class EmailVerificationRepository {
  constructor(private readonly _dataSource: DataSource) {}

  async add(
    queryRunner: QueryRunner,
    data: Omit<VerificationType, 'name'>,
  ): Promise<EmailVerification> {
    const verification = new EmailVerification();
    verification.email = data.email;
    verification.token = data.token;
    return await queryRunner.manager.save(verification);
  }

  async destroy(
    queryRunner: QueryRunner,
    emailVerification: EmailVerification,
  ): Promise<void> {
    await queryRunner.manager.remove(emailVerification);
  }

  async find(email: string, token: string): Promise<EmailVerification | null> {
    return this._dataSource
      .getRepository(EmailVerification)
      .createQueryBuilder('email_verification')
      .where('email=:email')
      .andWhere('token=:token')
      .setParameters({ email, token })
      .getOne();
  }

  async findByEmail(email: string): Promise<EmailVerification | null> {
    return this._dataSource
      .getRepository(EmailVerification)
      .createQueryBuilder('email_verification')
      .where('email=:email', { email })
      .getOne();
  }
}
