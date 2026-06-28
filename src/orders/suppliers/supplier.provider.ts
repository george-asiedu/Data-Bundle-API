import {
  CheckStatusResult,
  PlaceOrderInput,
  PlaceOrderResult,
  SupplierName,
} from '../orders.types';

/**
 * Abstraction over an upstream data-bundle fulfilment supplier. Each integration
 * (Verdeaccess today, others later) implements this so OrdersService stays
 * supplier-agnostic. Providers are resolved by name through SupplierRegistry.
 */
export interface SupplierProvider {
  readonly name: SupplierName;
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  checkStatus(
    reference: string,
    isAtBigtime?: boolean,
  ): Promise<CheckStatusResult>;
  /**
   * Supplier wallet balance for the given key (optional — only suppliers that
   * expose a balance endpoint implement it). Used to block fulfilment when the
   * supplier wallet is empty.
   */
  getBalance?(apiKey?: string): Promise<number>;
}

/** DI token for the array of registered supplier providers. */
export const SUPPLIER_PROVIDERS = Symbol('SUPPLIER_PROVIDERS');
