import { PackageNetwork, PackageType } from '../packages/packages.types';

/** Internal lifecycle of an order on our platform. */
export enum OrderStatus {
  PENDING = 'PENDING', // created + paid, not yet accepted by supplier
  PROCESSING = 'PROCESSING', // accepted by supplier, awaiting delivery
  DELIVERED = 'DELIVERED', // supplier confirmed delivery (terminal-success)
  FAILED = 'FAILED', // supplier rejected / delivery failed (retryable)
}

/** Where the order originated. */
export enum OrderChannel {
  AGENT_DASHBOARD = 'AGENT_DASHBOARD',
  SHOP = 'SHOP',
}

export enum OrderPaymentMethod {
  WALLET = 'WALLET',
  PAYSTACK = 'PAYSTACK',
}

/** Upstream fulfilment suppliers. Add new ones here as we integrate them. */
export enum SupplierName {
  VERDEACCESS = 'VERDEACCESS',
}

/** Input the supplier abstraction needs to place a bundle order. */
export interface PlaceOrderInput {
  agentApiKey: string;
  recipientNumber: string;
  network: PackageNetwork;
  type: PackageType;
  capacityGb: number;
  reference: string;
}

/** Normalised result of a place-order call across suppliers. */
export interface PlaceOrderResult {
  accepted: boolean;
  statusCode: number;
  message: string;
}

/** Normalised result of a status-check call across suppliers. */
export interface CheckStatusResult {
  statusCode: number;
  rawStatus: string | null;
  status: OrderStatus;
}
