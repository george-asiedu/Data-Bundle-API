import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PackageExpiry, PackageNetwork, PackageType } from '../packages.types';

/**
 * Platform package catalog, owned by the Admin. Prices are integer pesewas.
 * Agents read these and layer their own retail price/visibility on top
 * (see ShopPackage).
 */
@Entity('packages')
@Index('UQ_packages_network_type_capacity', ['network', 'type', 'capacityGb'], {
  unique: true,
})
export class Package {
  @PrimaryColumn()
  id: string;

  @Column({
    type: 'enum',
    enum: PackageNetwork,
    enumName: 'packages_network_enum',
  })
  network: PackageNetwork;

  @Column({ type: 'enum', enum: PackageType, enumName: 'packages_type_enum' })
  type: PackageType;

  @Column({ name: 'capacity_gb', type: 'integer' })
  capacityGb: number;

  @Column({ name: 'size_label' })
  sizeLabel: string;

  /** Wholesale cost to the agent, in pesewas. */
  @Column({ name: 'wholesale_price', type: 'integer' })
  wholesalePrice: number;

  /** Platform-suggested retail price agents may auto-apply, in pesewas. */
  @Column({ name: 'suggested_retail_price', type: 'integer' })
  suggestedRetailPrice: number;

  @Column({
    name: 'expiry_info',
    type: 'enum',
    enum: PackageExpiry,
    enumName: 'packages_expiry_info_enum',
  })
  expiryInfo: PackageExpiry;

  /** Reserved for upstream (Verdeaccess) fulfilment mapping. */
  @Column({ name: 'provider_code', type: 'varchar', nullable: true })
  providerCode?: string | null;

  /** Admin platform-wide availability toggle. */
  @Column({ name: 'is_available', type: 'boolean', default: true })
  isAvailable: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
