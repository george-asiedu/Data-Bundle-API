import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { AccountStatus, AuthProvider, Role } from '../auth.types';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'email', length: 50, unique: true })
  email: string;

  @Column({ nullable: true })
  @Exclude()
  password?: string;

  @Column({ name: 'phone_number', unique: true, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ name: 'full_name', length: 100, nullable: true })
  fullName?: string;

  @Column({
    name: 'account_status',
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING_VERIFICATION,
  })
  accountStatus?: AccountStatus;

  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Column({ name: 'provider_id', nullable: true })
  providerId?: string;

  @Column({ name: 'image_short_url', nullable: true })
  imageShortUrl?: string;

  @Column({ name: 'image_long_url', nullable: true })
  imageLongUrl?: string;

  @Column({ name: 'parent_agent_id', type: 'uuid', nullable: true })
  parentAgentId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'parent_agent_id' })
  parentAgent?: User;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret', nullable: true })
  @Exclude()
  mfaSecret?: string;

  @Column({ name: 'api_key_hash', nullable: true })
  @Exclude()
  apiKeyHash?: string;

  @Column({ name: 'webhook_url', nullable: true })
  webhookUrl?: string;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  @Exclude()
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Exclude()
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  @Exclude()
  deletedAt: Date;
}
