import { Transaction } from './entities/transactions.entity';
import { Wallet } from './entities/wallet.entity';
import { TransactionPurpose, TransactionType } from './payment.types';

/**
 * Plain, relation-free response shapes. Returning these (instead of raw TypeORM
 * entities) keeps the global ClassSerializerInterceptor from walking entity
 * relations — which can recurse into circular references (wallet ⇄ transactions)
 * and, if the client aborts mid-serialization, crash the Node process.
 */
export interface TransactionView {
  id: string;
  type: TransactionType;
  purpose: TransactionPurpose;
  amount: number;
  balanceAfter: number;
  reference: string;
  paystackRef: string;
  createdAt: Date;
}

export interface WalletView {
  id: string;
  balance: number;
  lowBalanceAlert: number;
  isFrozen: boolean;
  transactions: TransactionView[];
}

export function toTransactionView(tx: Transaction): TransactionView {
  return {
    id: tx.id,
    type: tx.type,
    purpose: tx.purpose,
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    reference: tx.reference,
    paystackRef: tx.paystackRef,
    createdAt: tx.createdAt,
  };
}

export function toWalletView(wallet: Wallet): WalletView {
  return {
    id: wallet.id,
    balance: wallet.balance,
    lowBalanceAlert: wallet.lowBalanceAlert,
    isFrozen: wallet.isFrozen,
    transactions: (wallet.transactions ?? []).map(toTransactionView),
  };
}
