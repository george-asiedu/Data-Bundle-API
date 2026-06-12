import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A persisted, rotatable refresh token. The raw token is never stored — only
 * its SHA-256 hash — so a database leak cannot be replayed against the API.
 */
@Entity({ name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'token_hash', unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  // The hash of the token that superseded this one during rotation. Used to
  // trace a stolen-token reuse back through the chain.
  @Column({ name: 'replaced_by_hash', nullable: true })
  replacedByHash?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
