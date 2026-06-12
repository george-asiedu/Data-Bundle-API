import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A short-lived, single-use code handed to the SPA after a successful OAuth
 * callback. The SPA exchanges it (over a POST body) for the real session
 * tokens, keeping access/refresh tokens out of the redirect URL — and out of
 * browser history, server logs and Referer headers.
 */
@Entity({ name: 'oauth_exchange_codes' })
export class OAuthExchangeCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'code_hash', unique: true })
  codeHash: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'is_new', default: false })
  isNew: boolean;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamp', nullable: true })
  consumedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
