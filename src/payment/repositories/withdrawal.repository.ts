import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Withdrawal } from '../entities/withdrawal.entity';
import { User } from '../../auth/entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { WithdrawalStatus } from '../payment.types';
import { Paginator } from '../../shared/services/paginator.provider';

@Injectable()
export class WithdrawalRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private _getQueryBuilder() {
    return this._dataSource
      .getRepository(Withdrawal)
      .createQueryBuilder('withdrawals');
  }

  private async _getNextId(queryRunner: QueryRunner): Promise<string> {
    const result = await queryRunner.manager
      .createQueryBuilder(Withdrawal, 'withdrawals')
      .select('MAX(CAST(SUBSTRING(withdrawals.id, 3) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `WD${maxNum + 1}`;
  }

  async add(
    queryRunner: QueryRunner,
    data: Pick<Withdrawal, 'amount' | 'reference' | 'status'>,
    user: User,
    wallet: Wallet,
  ): Promise<Withdrawal> {
    const withdrawal = new Withdrawal();
    withdrawal.id = await this._getNextId(queryRunner);
    withdrawal.amount = data.amount;
    withdrawal.reference = data.reference;
    withdrawal.status = data.status;
    withdrawal.user = user;
    withdrawal.wallet = wallet;

    return await queryRunner.manager.save(withdrawal);
  }

  /** Saves a (possibly mutated) withdrawal within the caller's transaction. */
  async save(
    queryRunner: QueryRunner,
    withdrawal: Withdrawal,
  ): Promise<Withdrawal> {
    return await queryRunner.manager.save(withdrawal);
  }

  async find(id: string): Promise<Withdrawal | null> {
    return await this._getQueryBuilder()
      .leftJoinAndSelect('withdrawals.user', 'user')
      .leftJoinAndSelect('withdrawals.wallet', 'wallet')
      .where('withdrawals.id = :id', { id })
      .getOne();
  }

  async findByTransferCode(transferCode: string): Promise<Withdrawal | null> {
    return await this._getQueryBuilder()
      .leftJoinAndSelect('withdrawals.user', 'user')
      .leftJoinAndSelect('withdrawals.wallet', 'wallet')
      .where('withdrawals.transferCode = :transferCode', { transferCode })
      .getOne();
  }

  async paginateByUser(
    userId: string,
    paginator: Paginator,
  ): Promise<Withdrawal[]> {
    return await this._getQueryBuilder()
      .where('withdrawals.user = :userId', { userId })
      .orderBy('withdrawals.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage)
      .getMany();
  }

  async paginateAll(
    paginator: Paginator,
    status?: WithdrawalStatus,
  ): Promise<Withdrawal[]> {
    const qb = this._getQueryBuilder()
      .leftJoinAndSelect('withdrawals.user', 'user')
      .orderBy('withdrawals.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage);

    if (status) {
      qb.where('withdrawals.status = :status', { status });
    }

    return await qb.getMany();
  }
}
