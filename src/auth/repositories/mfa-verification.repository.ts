import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { MfaVerification } from '../entities/mfa-verification.entity';

@Injectable()
export class MfaVerificationRepository {
  constructor(private readonly _dataSource: DataSource) {}

  async add(
    queryRunner: QueryRunner,
    data: { email: string; code: string },
  ): Promise<MfaVerification> {
    const verification = new MfaVerification();
    verification.email = data.email;
    verification.code = data.code;
    return await queryRunner.manager.save(verification);
  }

  async destroy(
    queryRunner: QueryRunner,
    verification: MfaVerification,
  ): Promise<void> {
    await queryRunner.manager.remove(verification);
  }

  async destroyMany(
    queryRunner: QueryRunner,
    verifications: Array<MfaVerification>,
  ): Promise<void> {
    for (const verification of verifications) {
      await queryRunner.manager.remove(verification);
    }
  }

  async find(email: string, code: string): Promise<MfaVerification | null> {
    return this._dataSource
      .getRepository(MfaVerification)
      .createQueryBuilder('mfa_verification')
      .where('email=:email')
      .andWhere('code=:code')
      .setParameters({ email, code })
      .getOne();
  }

  async findMany(email: string): Promise<Array<MfaVerification>> {
    return this._dataSource
      .getRepository(MfaVerification)
      .createQueryBuilder('mfa_verification')
      .where('email=:email', { email })
      .getMany();
  }
}
