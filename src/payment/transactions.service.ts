import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WalletRepository } from './repositories/wallet.repository';
import { ApplicationException } from 'src/lib/exception/app.exception';
import { TransactionRepository } from './repositories/transaction.repository';
import { Paginator } from 'src/shared/services/paginator.provider';
import { DataMessage } from 'src/lib/utils/types.utils';
import { Transaction } from './entities/transactions.entity';

@Injectable()
export class TransactionsService {
  private readonly _logger = new Logger(TransactionsService.name);

  constructor(
    private readonly _walletRepo: WalletRepository,
    private readonly _transactionRepo: TransactionRepository,
  ) {}

  async getWallet(userId: string) {
    try {
      const wallet = await this._walletRepo.findByUserId(userId);
      if (!wallet) throw new NotFoundException('Wallet not found');

      return { wallet };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async getTransaction(id: string): Promise<DataMessage<Transaction>> {
    try {
      const transaction = await this._transactionRepo.find(id);
      if (!transaction) throw new NotFoundException('Transaction not found');

      return {
        message: 'Transaction successfully fetched',
        data: transaction,
      };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async getTransactionByReference(
    ref: string,
  ): Promise<DataMessage<Transaction>> {
    try {
      const transaction = await this._transactionRepo.findByPaystackRef(ref);
      if (!transaction) throw new NotFoundException('Transaction not found');

      return {
        message: 'Transaction found',
        data: transaction,
      };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async paginateTransactions(
    paginator: Paginator,
    userId: string,
  ): Promise<DataMessage<Transaction[]>> {
    try {
      const transactions = await this._transactionRepo.paginate(
        paginator,
        userId,
      );
      if (!transactions) throw new NotFoundException('No transactions found');

      return {
        message: 'Transactions successfully fetched',
        data: transactions,
      };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new NotFoundException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }
}
