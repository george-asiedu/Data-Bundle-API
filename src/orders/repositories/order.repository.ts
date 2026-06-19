import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../orders.types';
import { Paginator } from '../../shared/services/paginator.provider';

@Injectable()
export class OrderRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private get _repo() {
    return this._dataSource.getRepository(Order);
  }

  private _getQueryBuilder() {
    return this._repo.createQueryBuilder('orders');
  }

  /** Next sequential id, e.g. ORD1001 (prefix is 3 chars). */
  async getNextId(queryRunner?: QueryRunner): Promise<string> {
    const qb = queryRunner
      ? queryRunner.manager.createQueryBuilder(Order, 'orders')
      : this._getQueryBuilder();
    const result = await qb
      .select('MAX(CAST(SUBSTRING(orders.id, 4) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `ORD${maxNum + 1}`;
  }

  /** Persist a new order inside the caller's transaction. */
  async add(queryRunner: QueryRunner, order: Order): Promise<Order> {
    return await queryRunner.manager.save(order);
  }

  /** Save a (possibly mutated) order outside a transaction. */
  async save(order: Order): Promise<Order> {
    return await this._repo.save(order);
  }

  async findById(id: string): Promise<Order | null> {
    return await this._getQueryBuilder()
      .where('orders.id = :id', { id })
      .getOne();
  }

  async findByPaystackReference(reference: string): Promise<Order | null> {
    return await this._getQueryBuilder()
      .where('orders.paystackReference = :reference', { reference })
      .getOne();
  }

  async paginateByUser(userId: string, paginator: Paginator): Promise<Order[]> {
    return await this._getQueryBuilder()
      .where('orders.user = :userId', { userId })
      .orderBy('orders.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage)
      .getMany();
  }

  /** Orders still in flight, for the background status poll. */
  async findInFlight(limit = 100): Promise<Order[]> {
    return await this._getQueryBuilder()
      .where('orders.status IN (:...statuses)', {
        statuses: [OrderStatus.PENDING, OrderStatus.PROCESSING],
      })
      .orderBy('orders.createdAt', 'ASC')
      .take(limit)
      .getMany();
  }
}
