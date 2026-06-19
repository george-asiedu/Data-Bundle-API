import { Order } from './entities/order.entity';
import {
  OrderChannel,
  OrderPaymentMethod,
  OrderStatus,
  SupplierName,
} from './orders.types';
import { PackageNetwork, PackageType } from '../packages/packages.types';

/** Plain, relation-free order shape for API responses. Money is pesewas. */
export interface OrderView {
  id: string;
  network: PackageNetwork;
  type: PackageType;
  capacityGb: number;
  sizeLabel: string;
  recipientNumber: string;
  amount: number;
  status: OrderStatus;
  channel: OrderChannel;
  paymentMethod: OrderPaymentMethod;
  supplier: SupplierName;
  supplierMessage: string | null;
  paystackReference: string | null;
  retryCount: number;
  retryable: boolean;
  createdAt: Date;
}

export function toOrderView(order: Order): OrderView {
  return {
    id: order.id,
    network: order.network,
    type: order.type,
    capacityGb: order.capacityGb,
    sizeLabel: order.sizeLabel,
    recipientNumber: order.recipientNumber,
    amount: order.amount,
    status: order.status,
    channel: order.channel,
    paymentMethod: order.paymentMethod,
    supplier: order.supplier,
    supplierMessage: order.supplierMessage ?? null,
    paystackReference: order.paystackReference ?? null,
    retryCount: order.retryCount,
    retryable:
      order.status === OrderStatus.FAILED ||
      order.status === OrderStatus.PENDING,
    createdAt: order.createdAt,
  };
}
