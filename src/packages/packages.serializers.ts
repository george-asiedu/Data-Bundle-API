import { Package } from './entities/package.entity';
import { ShopPackage } from './entities/shop-package.entity';
import { PackageView } from './packages.types';

/** profit and margin% derived from integer-pesewas prices. */
function priceMetrics(retailPrice: number, wholesalePrice: number) {
  const profit = retailPrice - wholesalePrice;
  const marginPercent =
    wholesalePrice > 0 ? Math.round((profit / wholesalePrice) * 100) : 0;
  return { profit, marginPercent };
}

/**
 * Merges a catalog package with the agent's override (if any). When the agent
 * has not configured a package yet, the platform-suggested retail price is used
 * and inShop defaults to false.
 */
export function toPackageView(
  pkg: Package,
  override?: ShopPackage,
): PackageView {
  const retailPrice = override?.retailPrice ?? pkg.suggestedRetailPrice;
  const inShop = override?.inShop ?? false;
  const { profit, marginPercent } = priceMetrics(
    retailPrice,
    pkg.wholesalePrice,
  );

  return {
    id: pkg.id,
    network: pkg.network,
    type: pkg.type,
    capacityGb: pkg.capacityGb,
    sizeLabel: pkg.sizeLabel,
    expiryInfo: pkg.expiryInfo,
    isAvailable: pkg.isAvailable,
    wholesalePrice: pkg.wholesalePrice,
    suggestedRetailPrice: pkg.suggestedRetailPrice,
    retailPrice,
    inShop,
    profit,
    marginPercent,
    isConfigured: override !== undefined,
  };
}
