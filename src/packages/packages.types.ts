export enum PackageNetwork {
  MTN = 'MTN',
  AT = 'AT',
  TELECEL = 'TELECEL',
}

export enum PackageType {
  REGULAR = 'REGULAR',
  BIGTIME = 'BIGTIME',
}

export enum PackageExpiry {
  NON_EXPIRY = 'NON_EXPIRY',
  ROLLOVER_60_DAY = 'ROLLOVER_60_DAY',
  STANDARD = 'STANDARD',
}

/**
 * An agent-facing package row: the platform catalog package merged with the
 * requesting agent's own pricing/visibility override. All monetary values are
 * integer pesewas (1 GHS = 100 pesewas) to keep arithmetic exact.
 */
export interface PackageView {
  id: string;
  network: PackageNetwork;
  type: PackageType;
  capacityGb: number;
  sizeLabel: string;
  expiryInfo: PackageExpiry;
  isAvailable: boolean;
  wholesalePrice: number;
  suggestedRetailPrice: number;
  retailPrice: number;
  inShop: boolean;
  profit: number;
  marginPercent: number;
  /** True once the agent has set their own price/visibility for this package. */
  isConfigured: boolean;
}
