import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Package } from '../entities/package.entity';

@Injectable()
export class PackageRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private get _repo() {
    return this._dataSource.getRepository(Package);
  }

  /** Generates the next sequential id, e.g. PKG1001 (prefix is 3 chars). */
  private async _getNextId(): Promise<string> {
    const result = await this._repo
      .createQueryBuilder('packages')
      .select('MAX(CAST(SUBSTRING(packages.id, 4) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `PKG${maxNum + 1}`;
  }

  private _ordered() {
    return this._repo
      .createQueryBuilder('packages')
      .orderBy('packages.network', 'ASC')
      .addOrderBy('packages.type', 'ASC')
      .addOrderBy('packages.capacityGb', 'ASC');
  }

  /** Catalog visible to agents — available packages only. */
  async findAllAvailable(): Promise<Package[]> {
    return await this._ordered()
      .where('packages.isAvailable = :available', { available: true })
      .getMany();
  }

  /** Full catalog for admin, including hidden packages. */
  async findAll(): Promise<Package[]> {
    return await this._ordered().getMany();
  }

  async findById(id: string): Promise<Package | null> {
    return await this._repo.findOne({ where: { id } });
  }

  async create(data: Partial<Package>): Promise<Package> {
    const entity = this._repo.create(data);
    entity.id = await this._getNextId();
    return await this._repo.save(entity);
  }

  async save(pkg: Package): Promise<Package> {
    return await this._repo.save(pkg);
  }
}
