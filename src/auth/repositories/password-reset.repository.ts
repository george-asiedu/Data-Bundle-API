import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

import { PasswordReset } from '../entities/password-reset.entity';
import { VerificationType } from '../auth.types';

@Injectable()
export class PasswordResetRepository {
  constructor(private readonly _dataSource: DataSource) {}

  async add(
    queryRunner: QueryRunner,
    data: Omit<VerificationType, 'name'>,
  ): Promise<PasswordReset> {
    const passwordReset = new PasswordReset();
    passwordReset.email = data.email;
    passwordReset.token = data.token;
    return queryRunner.manager.save(passwordReset);
  }

  async destroy(
    queryRunner: QueryRunner,
    passwordReset: PasswordReset,
  ): Promise<void> {
    await queryRunner.manager.remove(passwordReset);
  }

  async destroyMany(
    queryRunner: QueryRunner,
    passwordResets: Array<PasswordReset>,
  ) {
    for (const passwordReset of passwordResets) {
      await queryRunner.manager.remove(passwordReset);
    }
  }

  find(email: string): Promise<PasswordReset | null> {
    return this._dataSource
      .getRepository(PasswordReset)
      .createQueryBuilder('password_reset')
      .where('email=:email', { email })
      .getOne();
  }

  findMany(email: string): Promise<Array<PasswordReset>> {
    return this._dataSource
      .getRepository(PasswordReset)
      .createQueryBuilder('password_reset')
      .where('email=:email', { email })
      .getMany();
  }
}
