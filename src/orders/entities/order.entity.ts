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
import { User } from '../../auth/entities/user.entity';
import { Package } from '../../packages/entities/package.entity';
import { PackageNetwork, PackageType } from '../../packages/packages.types';
import {
  OrderChannel,
  OrderPaymentMethod,
  OrderStatus,
  SupplierName,
} from '../orders.types';

/**
 * A data-bundle order placed on the platform — from an agent dashboard (wallet)
 * or a shop (customer, Paystack). Package details and prices are snapshotted so
 * history is stable even if the catalog changes. Money is integer pesewas.
 * `id` (e.g. ORD1001) is the customer-facing reference.
 */
@Entity('orders')
export class Order {
  @PrimaryColumn()
  id: string;

  @Index('IDX_orders_user')
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

  // ── Snapshot of the package at order time ──
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

  @Column({ name: 'recipient_number' })
  recipientNumber: string;

  /** Amount charged for this order, in pesewas (wholesale for agent, retail for shop). */
  @Column({ name: 'amount', type: 'integer' })
  amount: number;

  @Column({ name: 'wholesale_amount', type: 'integer' })
  wholesaleAmount: number;

  @Column({ name: 'channel', type: 'enum', enum: OrderChannel })
  channel: OrderChannel;

  @Column({ name: 'payment_method', type: 'enum', enum: OrderPaymentMethod })
  paymentMethod: OrderPaymentMethod;

  @Index('IDX_orders_status')
  @Column({
    name: 'status',
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({
    name: 'supplier',
    type: 'enum',
    enum: SupplierName,
    default: SupplierName.VERDEACCESS,
  })
  supplier: SupplierName;

  /** reference_id sent to the supplier; also used for status checks. */
  @Index('IDX_orders_supplier_reference', { unique: true })
  @Column({ name: 'supplier_reference' })
  supplierReference: string;

  @Column({ name: 'supplier_status_code', type: 'integer', nullable: true })
  supplierStatusCode?: number | null;

  @Column({ name: 'supplier_message', type: 'varchar', nullable: true })
  supplierMessage?: string | null;

  // ── Shop / customer context (null for agent orders) ──
  @Index('IDX_orders_paystack_reference')
  @Column({ name: 'paystack_reference', type: 'varchar', nullable: true })
  paystackReference?: string | null;

  @Column({ name: 'customer_email', type: 'varchar', nullable: true })
  customerEmail?: string | null;

  @Column({ name: 'customer_name', type: 'varchar', nullable: true })
  customerName?: string | null;

  /** Wallet transaction that funded an agent order (null for shop orders). */
  @Column({ name: 'transaction_id', type: 'varchar', nullable: true })
  transactionId?: string | null;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
