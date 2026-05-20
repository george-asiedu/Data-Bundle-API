import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TransactionPurpose, TransactionType } from '../payment.types';
import { Wallet } from './wallet.entity';
import { User } from '../../auth/entities/user.entity';
import { Exclude } from 'class-transformer';

@Entity('transactions')
export class Transaction {
  @PrimaryColumn()
  id: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'enum', enum: TransactionPurpose })
  purpose: TransactionPurpose;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 2 })
  balanceAfter: number;

  @Column({ unique: true })
  reference: string;

  @Column({ name: 'paystack_ref', nullable: true })
  paystackRef: string;

  @CreateDateColumn({ name: 'created_at' })
  @Exclude()
  createdAt: Date;
}
