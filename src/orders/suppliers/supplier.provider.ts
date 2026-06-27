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
}

/** DI token for the array of registered supplier providers. */
export const SUPPLIER_PROVIDERS = Symbol('SUPPLIER_PROVIDERS');
