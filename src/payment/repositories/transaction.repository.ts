import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Transaction } from '../entities/transactions.entity';
import { User } from '../../auth/entities/user.entity';
import { Wallet } from '../entities/wallet.entity';

@Injectable()
export class TransactionRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private _getQueryBuilder() {
    return this._dataSource
      .getRepository(Transaction)
      .createQueryBuilder('transactions');
  }

  private async _getNextId(queryRunner: QueryRunner): Promise<string> {
    const result = await queryRunner.manager
      .createQueryBuilder(Transaction, 'transactions')
      .select('MAX(CAST(SUBSTRING(transactions.id, 3) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `TR${maxNum + 1}`;
  }

  async findByPaystackRef(paystackRef: string): Promise<Transaction | null> {
    return await this._getQueryBuilder()
      .where('transactions.paystackRef = :paystackRef', { paystackRef })
      .getOne();
  }

  async add(
    queryRunner: QueryRunner,
    data: Partial<Transaction>,
    user: User,
    wallet: Wallet,
  ): Promise<Transaction> {
    const transaction = new Transaction();
    transaction.id = await this._getNextId(queryRunner);
    transaction.amount = data.amount!;
    transaction.balanceAfter = data.balanceAfter!;
    transaction.purpose = data.purpose!;
    transaction.reference = data.reference!;
    transaction.paystackRef = data.paystackRef!;
    transaction.type = data.type!;
    transaction.user = user;
    transaction.wallet = wallet;

    return await queryRunner.manager.save(transaction);
  }
}
