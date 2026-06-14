import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { WithdrawalStatus } from '../payment.types';
import { Wallet } from './wallet.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('withdrawals')
export class Withdrawal {
  @PrimaryColumn()
  id: string;

  @Index('IDX_withdrawals_user')
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'amount', type: 'integer' })
  amount: number;

  @Index('IDX_withdrawals_status')
  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING,
  })
  status: WithdrawalStatus;

  /** Internal reference, also used as the ledger transaction reference. */
  @Column({ unique: true })
  reference: string;

  @Column({ name: 'recipient_code', type: 'varchar', nullable: true })
  recipientCode?: string | null;

  @Column({ name: 'transfer_code', type: 'varchar', nullable: true })
  transferCode?: string | null;

  @Column({ name: 'transfer_ref', type: 'varchar', nullable: true })
  transferRef?: string | null;

  /** Id of the admin who approved/rejected the request. */
  @Column({ name: 'reviewed_by', type: 'varchar', nullable: true })
  reviewedBy?: string | null;

  @Column({ name: 'review_note', type: 'varchar', nullable: true })
  reviewNote?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Exclude()
  updatedAt: Date;
}
