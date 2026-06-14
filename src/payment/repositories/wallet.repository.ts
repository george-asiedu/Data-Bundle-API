import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Wallet } from '../entities/wallet.entity';
import { User } from '../../auth/entities/user.entity';
import { CreateWalletDto } from '../dto/wallet.dto';

@Injectable()
export class WalletRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private _getQueryBuilder() {
    return this._dataSource.getRepository(Wallet).createQueryBuilder('wallets');
  }

  private async _getNextId(queryRunner: QueryRunner): Promise<string> {
    const result = await queryRunner.manager
      .createQueryBuilder(Wallet, 'wallets')
      .select('MAX(CAST(SUBSTRING(wallets.id, 3) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `WL${maxNum + 1}`;
  }

  async add(
    queryRunner: QueryRunner,
    data: CreateWalletDto,
    user: User,
  ): Promise<Wallet> {
    const wallet = new Wallet();
    wallet.id = await this._getNextId(queryRunner);
    wallet.balance = data.balance;
    wallet.user = user;

    return await queryRunner.manager.save(wallet);
  }

  async find(id: string): Promise<Wallet | null> {
    return await this._getQueryBuilder()
      .leftJoinAndSelect('wallets.transactions', 'transactions')
      .where('wallets.id = :id', { id })
      .getOne();
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    return await this._getQueryBuilder()
      .where('wallets.user = :userId', { userId })
      .getOne();
  }

  /**
   * Fetches a wallet for a user while taking a row-level write lock
   * (SELECT ... FOR UPDATE). Used to serialise balance mutations so concurrent
   * debits (withdrawals/purchases) can't double-spend. Must run inside the
   * caller's active transaction. Transactions are intentionally NOT joined: an
   * outer-joined nullable side cannot be locked in Postgres.
   */
  async findByUserIdForUpdate(
    queryRunner: QueryRunner,
    userId: string,
  ): Promise<Wallet | null> {
    return await queryRunner.manager
      .createQueryBuilder(Wallet, 'wallets')
      .setLock('pessimistic_write')
      .where('wallets.user = :userId', { userId })
      .getOne();
  }

  async updateBalance(
    queryRunner: QueryRunner,
    wallet: Wallet,
    newBalance: number,
  ): Promise<Wallet> {
    const merge = queryRunner.manager.merge(Wallet, wallet, {
      balance: newBalance,
    });
    return await queryRunner.manager.save(Wallet, merge);
  }
}
