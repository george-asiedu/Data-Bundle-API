import { forwardRef, Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { AuthModule } from '../auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transactions.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { WithdrawalRepository } from './repositories/withdrawal.repository';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PaymentFailureMailer } from './mailer/payment-failure.mailer';
import { PaymentSuccessMailer } from './mailer/payment-success.mailer';
import { AuditModule } from '../audit/audit.module';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, Withdrawal]),
    forwardRef(() => AuthModule),
    SubscriptionModule,
    forwardRef(() => AuditModule),
  ],
  providers: [
    PaymentService,
    WalletRepository,
    TransactionRepository,
    WithdrawalRepository,
    PaymentFailureMailer,
    PaymentSuccessMailer,
    TransactionsService,
  ],
  controllers: [PaymentController, TransactionsController],
  exports: [
    PaymentService,
    WalletRepository,
    TransactionRepository,
    TransactionsService,
  ],
})
export class PaymentModule {}
