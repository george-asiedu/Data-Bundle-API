import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Transaction } from './transactions.entity';
import { Exclude } from 'class-transformer';

@Entity('wallets')
export class Wallet {
  @PrimaryColumn()
  id: string;

  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Array<Transaction>;

  @Column({ name: 'balance', type: 'integer', default: 0 })
  balance: number;

  @Column({ name: 'low_balance_alert', type: 'integer', default: 0 })
  lowBalanceAlert: number; // Agent can set a threshold for low balance alerts

  @Column({ name: 'is_frozen', type: 'boolean', default: false })
  isFrozen: boolean; // Admin can freeze a wallet to prevent transactions

  @CreateDateColumn({ name: 'created_at' })
  @Exclude()
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Exclude()
  updatedAt: Date;
}
