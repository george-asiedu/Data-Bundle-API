import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SUPPLIER_PROVIDERS, SupplierProvider } from './supplier.provider';
import { SupplierName } from '../orders.types';

/**
 * Resolves a SupplierProvider by name. Adding a new supplier is just providing
 * another SupplierProvider in the module — no changes needed here or in the
 * service beyond choosing which supplier an order uses.
 */
@Injectable()
export class SupplierRegistry {
  private readonly _byName = new Map<SupplierName, SupplierProvider>();

  constructor(@Inject(SUPPLIER_PROVIDERS) providers: SupplierProvider[]) {
    for (const provider of providers) {
      this._byName.set(provider.name, provider);
    }
  }

  get(name: SupplierName): SupplierProvider {
    const provider = this._byName.get(name);
    if (!provider) {
      throw new NotFoundException(`No supplier integration for ${name}`);
    }
    return provider;
  }
}
