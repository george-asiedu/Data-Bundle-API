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
import { Package } from './package.entity';
import { User } from '../../auth/entities/user.entity';

/**
 * An agent's (or sub-agent's) per-package pricing and shop visibility override.
 * One row per (user, package). retailPrice is integer pesewas and is enforced
 * to be >= the package's wholesale price.
 */
@Entity('shop_packages')
@Index('UQ_shop_packages_user_package', ['userId', 'packageId'], {
  unique: true,
})
export class ShopPackage {
  @PrimaryColumn()
  id: string;

  @Index('IDX_shop_packages_user')
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'package_id' })
  packageId: string;

  @ManyToOne(() => Package)
  @JoinColumn({ name: 'package_id' })
  package?: Package;

  /** Agent's retail price for this package, in pesewas. */
  @Column({ name: 'retail_price', type: 'integer' })
  retailPrice: number;

  @Column({ name: 'in_shop', type: 'boolean', default: false })
  inShop: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
