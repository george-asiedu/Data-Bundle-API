import { Shop } from '../packages/entities/shop.entity';
import { Package } from '../packages/entities/package.entity';
import {
  PackageExpiry,
  PackageNetwork,
  PackageType,
} from '../packages/packages.types';

/** Public storefront profile — safe to expose to unauthenticated customers. */
export interface PublicShopProfile {
  name: string;
  slug: string;
  isActive: boolean;
  tagline: string | null;
  welcomeMessage: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  logoUrl: string | null;
}

/** A package as shown to customers — retail price only, no wholesale/margin. */
export interface PublicPackage {
  id: string;
  network: PackageNetwork;
  type: PackageType;
  capacityGb: number;
  sizeLabel: string;
  expiryInfo: PackageExpiry;
  price: number; // retail, pesewas
}

export function toPublicShopProfile(shop: Shop): PublicShopProfile {
  return {
    name: shop.name,
    slug: shop.slug,
    isActive: shop.isActive,
    tagline: shop.tagline ?? null,
    welcomeMessage: shop.welcomeMessage ?? null,
    contactPhone: shop.contactPhone ?? null,
    whatsapp: shop.whatsapp ?? null,
    facebook: shop.facebook ?? null,
    instagram: shop.instagram ?? null,
    logoUrl: shop.logoUrl ?? null,
  };
}

export function toPublicPackage(pkg: Package, price: number): PublicPackage {
  return {
    id: pkg.id,
    network: pkg.network,
    type: pkg.type,
    capacityGb: pkg.capacityGb,
    sizeLabel: pkg.sizeLabel,
    expiryInfo: pkg.expiryInfo,
    price,
  };
}
