import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShopPackage } from '../entities/shop-package.entity';

@Injectable()
export class ShopPackageRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private get _repo() {
    return this._dataSource.getRepository(ShopPackage);
  }

  /** Current highest numeric id suffix (prefix SPK is 3 chars), or 1000. */
  private async _currentMaxId(): Promise<number> {
    const result = await this._repo
      .createQueryBuilder('shop_packages')
      .select('MAX(CAST(SUBSTRING(shop_packages.id, 4) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    return result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
  }

  /** All of a user's overrides, keyed by packageId for quick merge. */
  async findByUserMap(userId: string): Promise<Map<string, ShopPackage>> {
    const rows = await this._repo.find({ where: { userId } });
    return new Map(rows.map((row) => [row.packageId, row]));
  }

  async findOne(
    userId: string,
    packageId: string,
  ): Promise<ShopPackage | null> {
    return await this._repo.findOne({ where: { userId, packageId } });
  }

  /**
   * Creates or updates a user's override for a package. Only the provided fields
   * are changed; defaults are applied when the row is first created.
   */
  async upsert(
    userId: string,
    packageId: string,
    data: { retailPrice?: number; inShop?: boolean },
    defaults: { retailPrice: number },
  ): Promise<ShopPackage> {
    const existing = await this.findOne(userId, packageId);

    let row = existing;
    if (!row) {
      row = this._repo.create({ userId, packageId, inShop: false });
      row.id = `SPK${(await this._currentMaxId()) + 1}`;
    }

    row.retailPrice =
      data.retailPrice ?? row.retailPrice ?? defaults.retailPrice;
    if (data.inShop !== undefined) row.inShop = data.inShop;

    return await this._repo.save(row);
  }

  /**
   * Applies retail prices to many packages for a user in one go (used by
   * apply-margin). Existing overrides are updated; missing ones are created with
   * sequential ids. Returns the resulting override map.
   */
  async applyRetailPrices(
    userId: string,
    entries: { packageId: string; retailPrice: number }[],
  ): Promise<Map<string, ShopPackage>> {
    const overrides = await this.findByUserMap(userId);
    let nextNum = await this._currentMaxId();

    const rows = entries.map(({ packageId, retailPrice }) => {
      let row = overrides.get(packageId);
      if (!row) {
        row = this._repo.create({ userId, packageId, inShop: false });
        row.id = `SPK${++nextNum}`;
        overrides.set(packageId, row);
      }
      row.retailPrice = retailPrice;
      return row;
    });

    await this._repo.save(rows);
    return overrides;
  }
}
