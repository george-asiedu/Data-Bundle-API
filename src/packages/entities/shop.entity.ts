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

  // ── Storefront settings (shown on the public shop) ──
  @Column({ name: 'tagline', type: 'varchar', nullable: true })
  tagline?: string | null;

  @Column({
    name: 'welcome_message',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  welcomeMessage?: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', nullable: true })
  contactPhone?: string | null;

  @Column({ name: 'whatsapp', type: 'varchar', nullable: true })
  whatsapp?: string | null;

  @Column({ name: 'facebook', type: 'varchar', nullable: true })
  facebook?: string | null;

  @Column({ name: 'instagram', type: 'varchar', nullable: true })
  instagram?: string | null;

  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
