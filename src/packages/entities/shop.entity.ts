import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * A reseller's (agent / sub-agent) white-label storefront identity. One shop per
 * user. `isActive` controls whether customers can see the public shop — agents
 * can take it offline (e.g. when a supplier is having issues).
 */
@Entity('shops')
export class Shop {
  @PrimaryColumn()
  id: string;

  @Index('UQ_shops_user', { unique: true })
  @Column({ name: 'user_id' })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'name' })
  name: string;

  @Index('UQ_shops_slug', { unique: true })
  @Column({ name: 'slug' })
  slug: string;

  /** Whether the public shop is visible to customers. */
  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
