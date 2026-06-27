import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Shop } from '../entities/shop.entity';

@Injectable()
export class ShopRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private get _repo() {
    return this._dataSource.getRepository(Shop);
  }

  /** Next sequential id, e.g. SHP1001 (prefix is 3 chars). */
  private async _getNextId(): Promise<string> {
    const result = await this._repo
      .createQueryBuilder('shops')
      .select('MAX(CAST(SUBSTRING(shops.id, 4) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `SHP${maxNum + 1}`;
  }

  async findBySlug(slug: string): Promise<Shop | null> {
    return await this._repo.findOne({ where: { slug } });
  }

  async findByUserId(userId: string): Promise<Shop | null> {
    return await this._repo.findOne({ where: { userId } });
  }

  async slugExists(slug: string, exceptUserId?: string): Promise<boolean> {
    const found = await this._repo.findOne({ where: { slug } });
    return !!found && found.userId !== exceptUserId;
  }

  async create(data: {
    userId: string;
    name: string;
    slug: string;
  }): Promise<Shop> {
    const shop = this._repo.create({ ...data, isActive: false });
    shop.id = await this._getNextId();
    return await this._repo.save(shop);
  }

  async save(shop: Shop): Promise<Shop> {
    return await this._repo.save(shop);
  }
}
