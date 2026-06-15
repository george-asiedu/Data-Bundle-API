import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PackageRepository } from './repositories/package.repository';
import { ShopPackageRepository } from './repositories/shop-package.repository';
import { ShopRepository } from './repositories/shop.repository';
import { toPackageView } from './packages.serializers';
import { PackageView } from './packages.types';
import { Package } from './entities/package.entity';
import { Shop } from './entities/shop.entity';
import { User } from '../auth/entities/user.entity';
import { DataMessage } from '../lib/utils/types.utils';
import { AuditService } from '../audit/audit.service';
import { LogAction } from '../audit/log-action.types';
import {
  ApplyMarginDto,
  CreatePackageDto,
  UpdatePackageDto,
  UpdateShopDto,
} from './dto/packages.dto';

@Injectable()
export class PackagesService {
  private readonly _logger = new Logger(PackagesService.name);

  constructor(
    private readonly _packageRepo: PackageRepository,
    private readonly _shopPackageRepo: ShopPackageRepository,
    private readonly _shopRepo: ShopRepository,
    private readonly _auditService: AuditService,
  ) {}

  /** Rounds a pesewas amount up to the nearest 10 pesewas (GHS 0.10). */
  private _roundRetail(pesewas: number): number {
    return Math.ceil(pesewas / 10) * 10;
  }

  // ── Shop identity ────────────────────────────────────────────

  /** Returns the user's shop, provisioning a default one on first access. */
  async getMyShop(user: User): Promise<DataMessage<Shop>> {
    try {
      const shop = await this._getOrCreateShop(user);
      return { message: 'Shop retrieved successfully', data: shop };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load shop');
    }
  }

  async updateMyShop(
    user: User,
    dto: UpdateShopDto,
  ): Promise<DataMessage<Shop>> {
    const shop = await this._getOrCreateShop(user);

    if (dto.slug && dto.slug !== shop.slug) {
      const taken = await this._shopRepo.slugExists(dto.slug, user.id);
      if (taken) {
        throw new BadRequestException('That shop link is already taken.');
      }
      shop.slug = dto.slug;
    }
    if (dto.name !== undefined) shop.name = dto.name.trim();
    if (dto.isActive !== undefined) shop.isActive = dto.isActive;

    try {
      const saved = await this._shopRepo.save(shop);
      return { message: 'Shop updated successfully', data: saved };
    } catch (error) {
      if (this._isUniqueViolation(error)) {
        throw new BadRequestException('That shop link is already taken.');
      }
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to update shop');
    }
  }

  private async _getOrCreateShop(user: User): Promise<Shop> {
    const existing = await this._shopRepo.findByUserId(user.id);
    if (existing) return existing;

    const baseName =
      user.businessName?.trim() || user.fullName?.trim() || 'My Shop';
    const slug = await this._generateUniqueSlug(baseName, user.id);
    return await this._shopRepo.create({
      userId: user.id,
      name: baseName,
      slug,
    });
  }

  private async _generateUniqueSlug(
    base: string,
    userId: string,
  ): Promise<string> {
    const root =
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30) || 'shop';

    let slug = root;
    let attempt = 0;
    while (await this._shopRepo.slugExists(slug, userId)) {
      attempt += 1;
      const suffix = userId
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-4)
        .toLowerCase();
      slug = `${root}-${suffix}${attempt > 1 ? attempt : ''}`;
    }
    return slug;
  }

  // ── Agent-facing ─────────────────────────────────────────────

  async listForUser(userId: string): Promise<DataMessage<PackageView[]>> {
    try {
      const [packages, overrides] = await Promise.all([
        this._packageRepo.findAllAvailable(),
        this._shopPackageRepo.findByUserMap(userId),
      ]);

      const data = packages.map((pkg) =>
        toPackageView(pkg, overrides.get(pkg.id)),
      );

      return { message: 'Packages retrieved successfully', data };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load packages');
    }
  }

  async setRetailPrice(
    userId: string,
    packageId: string,
    retailPrice: number,
  ): Promise<DataMessage<PackageView>> {
    const pkg = await this._getAvailablePackage(packageId);

    if (retailPrice < pkg.wholesalePrice) {
      throw new BadRequestException(
        'Retail price cannot be below the wholesale cost.',
      );
    }

    try {
      const override = await this._shopPackageRepo.upsert(
        userId,
        packageId,
        { retailPrice },
        { retailPrice: pkg.suggestedRetailPrice },
      );

      void this._auditService.logAction(
        LogAction.PACKAGE_PRICE_UPDATED,
        userId,
        {
          resourceType: 'package',
          resourceId: packageId,
          metadata: { retailPrice, wholesalePrice: pkg.wholesalePrice },
        },
      );

      return {
        message: 'Retail price updated',
        data: toPackageView(pkg, override),
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to update retail price');
    }
  }

  async setVisibility(
    userId: string,
    packageId: string,
    inShop: boolean,
  ): Promise<DataMessage<PackageView>> {
    const pkg = await this._getAvailablePackage(packageId);

    try {
      const override = await this._shopPackageRepo.upsert(
        userId,
        packageId,
        { inShop },
        { retailPrice: pkg.suggestedRetailPrice },
      );

      void this._auditService.logAction(
        LogAction.PACKAGE_VISIBILITY_TOGGLED,
        userId,
        {
          resourceType: 'package',
          resourceId: packageId,
          metadata: { inShop },
        },
      );

      return {
        message: inShop ? 'Package added to shop' : 'Package removed from shop',
        data: toPackageView(pkg, override),
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException(
        'Failed to update shop visibility',
      );
    }
  }

  async applyMargin(
    userId: string,
    dto: ApplyMarginDto,
  ): Promise<DataMessage<PackageView[]>> {
    try {
      const packages = await this._packageRepo.findAllAvailable();

      const targets = dto.network
        ? packages.filter((p) => p.network === dto.network)
        : packages;

      const entries = targets.map((pkg) => ({
        packageId: pkg.id,
        retailPrice: this._roundRetail(
          pkg.wholesalePrice * (1 + dto.marginPercent / 100),
        ),
      }));

      const overrides = await this._shopPackageRepo.applyRetailPrices(
        userId,
        entries,
      );

      void this._auditService.logAction(
        LogAction.PACKAGE_MARGIN_APPLIED,
        userId,
        {
          resourceType: 'shop_packages',
          resourceId: userId,
          metadata: {
            marginPercent: dto.marginPercent,
            network: dto.network ?? 'all',
            affected: entries.length,
          },
        },
      );

      const data = packages.map((pkg) =>
        toPackageView(pkg, overrides.get(pkg.id)),
      );

      return {
        message: `${dto.marginPercent}% margin applied to ${entries.length} packages`,
        data,
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to apply margin');
    }
  }

  /**
   * Persists many retail prices at once (the "Save all" action). Each price is
   * validated against its package's wholesale floor; the whole batch is rejected
   * if any item is invalid.
   */
  async bulkSetRetailPrices(
    userId: string,
    items: { packageId: string; retailPrice: number }[],
  ): Promise<DataMessage<PackageView[]>> {
    try {
      const packages = await this._packageRepo.findAllAvailable();
      const byId = new Map(packages.map((p) => [p.id, p]));

      const entries: { packageId: string; retailPrice: number }[] = [];
      for (const item of items) {
        const pkg = byId.get(item.packageId);
        if (!pkg) {
          throw new BadRequestException(`Unknown package: ${item.packageId}`);
        }
        if (item.retailPrice < pkg.wholesalePrice) {
          throw new BadRequestException(
            `Retail price for ${pkg.sizeLabel} ${pkg.network} cannot be below its wholesale cost.`,
          );
        }
        entries.push({ packageId: pkg.id, retailPrice: item.retailPrice });
      }

      const overrides = await this._shopPackageRepo.applyRetailPrices(
        userId,
        entries,
      );

      void this._auditService.logAction(
        LogAction.PACKAGE_PRICE_UPDATED,
        userId,
        {
          resourceType: 'shop_packages',
          resourceId: userId,
          metadata: { bulk: true, affected: entries.length },
        },
      );

      const data = packages.map((pkg) =>
        toPackageView(pkg, overrides.get(pkg.id)),
      );

      return { message: 'All prices saved successfully', data };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to save prices');
    }
  }

  /**
   * Persists shop visibility for many packages at once (staged toggles saved in
   * one request instead of one call per toggle).
   */
  async bulkSetVisibility(
    userId: string,
    items: { packageId: string; inShop: boolean }[],
  ): Promise<DataMessage<PackageView[]>> {
    try {
      const packages = await this._packageRepo.findAllAvailable();
      const byId = new Map(packages.map((p) => [p.id, p]));
      const suggested = new Map(
        packages.map((p) => [p.id, p.suggestedRetailPrice]),
      );

      const entries: { packageId: string; inShop: boolean }[] = [];
      for (const item of items) {
        if (!byId.has(item.packageId)) {
          throw new BadRequestException(`Unknown package: ${item.packageId}`);
        }
        entries.push({ packageId: item.packageId, inShop: item.inShop });
      }

      const overrides = await this._shopPackageRepo.applyVisibility(
        userId,
        entries,
        suggested,
      );

      void this._auditService.logAction(
        LogAction.PACKAGE_VISIBILITY_TOGGLED,
        userId,
        {
          resourceType: 'shop_packages',
          resourceId: userId,
          metadata: { bulk: true, affected: entries.length },
        },
      );

      const data = packages.map((pkg) =>
        toPackageView(pkg, overrides.get(pkg.id)),
      );

      return { message: 'Shop updated successfully', data };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to update shop');
    }
  }

  // ── Admin-facing ─────────────────────────────────────────────

  async listAll(): Promise<DataMessage<Package[]>> {
    try {
      const data = await this._packageRepo.findAll();
      return { message: 'Catalog retrieved successfully', data };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load catalog');
    }
  }

  async createPackage(
    adminId: string,
    dto: CreatePackageDto,
  ): Promise<DataMessage<Package>> {
    if (
      dto.suggestedRetailPrice !== undefined &&
      dto.suggestedRetailPrice < dto.wholesalePrice
    ) {
      throw new BadRequestException(
        'Suggested retail price cannot be below the wholesale cost.',
      );
    }

    try {
      const suggested =
        dto.suggestedRetailPrice ?? this._roundRetail(dto.wholesalePrice * 1.2);

      const pkg = await this._packageRepo.create({
        network: dto.network,
        type: dto.type,
        capacityGb: dto.capacityGb,
        sizeLabel: dto.sizeLabel ?? `${dto.capacityGb} GB`,
        wholesalePrice: dto.wholesalePrice,
        suggestedRetailPrice: suggested,
        expiryInfo: dto.expiryInfo,
        providerCode: dto.providerCode ?? null,
        isAvailable: true,
      });

      void this._auditService.logAction(LogAction.PACKAGE_CREATED, adminId, {
        resourceType: 'package',
        resourceId: pkg.id,
        metadata: { network: pkg.network, type: pkg.type, size: pkg.sizeLabel },
      });

      return { message: 'Package created', data: pkg };
    } catch (error) {
      if (this._isUniqueViolation(error)) {
        throw new BadRequestException(
          'A package with this network, type and size already exists.',
        );
      }
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to create package');
    }
  }

  async updatePackage(
    adminId: string,
    packageId: string,
    dto: UpdatePackageDto,
  ): Promise<DataMessage<Package>> {
    const pkg = await this._packageRepo.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');

    const nextWholesale = dto.wholesalePrice ?? pkg.wholesalePrice;
    const nextSuggested = dto.suggestedRetailPrice ?? pkg.suggestedRetailPrice;
    if (nextSuggested < nextWholesale) {
      throw new BadRequestException(
        'Suggested retail price cannot be below the wholesale cost.',
      );
    }

    try {
      pkg.sizeLabel = dto.sizeLabel ?? pkg.sizeLabel;
      pkg.wholesalePrice = nextWholesale;
      pkg.suggestedRetailPrice = nextSuggested;
      pkg.expiryInfo = dto.expiryInfo ?? pkg.expiryInfo;
      pkg.providerCode = dto.providerCode ?? pkg.providerCode;
      if (dto.isAvailable !== undefined) pkg.isAvailable = dto.isAvailable;

      const saved = await this._packageRepo.save(pkg);

      void this._auditService.logAction(LogAction.PACKAGE_UPDATED, adminId, {
        resourceType: 'package',
        resourceId: packageId,
        metadata: { ...dto },
      });

      return { message: 'Package updated', data: saved };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to update package');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async _getAvailablePackage(packageId: string): Promise<Package> {
    const pkg = await this._packageRepo.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    if (!pkg.isAvailable) {
      throw new BadRequestException('This package is not currently available.');
    }
    return pkg;
  }

  private _isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
