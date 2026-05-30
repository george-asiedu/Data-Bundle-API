import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Exclude } from 'class-transformer';
import { SubscriptionStatus } from '../subscription.types';

@Entity('subscriptions')
export class Subscription {
  @PrimaryColumn()
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  status: SubscriptionStatus;

  @Column({ name: 'current_period_start', type: 'timestamp' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamp' })
  currentPeriodEnd: Date;

  @CreateDateColumn({ name: 'created_at' })
  @Exclude()
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Exclude()
  updatedAt: Date;
}
