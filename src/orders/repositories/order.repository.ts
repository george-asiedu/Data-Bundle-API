import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderChannel, OrderStatus } from '../orders.types';
import { Paginator } from '../../shared/services/paginator.provider';

export interface ShopSummaryRow {
  orders: number;
  revenue: number; // pesewas
  cost: number; // pesewas (wholesale)
  customers: number;
}
export interface TopCustomerRow {
  recipientNumber: string;
  orders: number;
  spent: number; // pesewas
}
export interface TopPackageRow {
  sizeLabel: string;
  network: string;
  orders: number;
  revenue: number; // pesewas
}

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

  /**
   * Atomically claim a PENDING order for fulfilment (PENDING -> PROCESSING).
   * Returns true only for the caller that won the claim, so concurrent confirm
   * and webhook paths can't both fulfil the same order.
   */
  async claimForFulfilment(orderId: string): Promise<boolean> {
    const res = await this._repo.update(
      { id: orderId, status: OrderStatus.PENDING },
      { status: OrderStatus.PROCESSING },
    );
    return res.affected === 1;
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

  /** Platform-wide order list for super admins. */
  async paginateAll(paginator: Paginator): Promise<Order[]> {
    return await this._getQueryBuilder()
      .leftJoinAndSelect('orders.user', 'user')
      .orderBy('orders.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage)
      .getMany();
  }

  async paginateByUserAndChannel(
    userId: string,
    channel: OrderChannel,
    paginator: Paginator,
  ): Promise<Order[]> {
    return await this._getQueryBuilder()
      .where('orders.user = :userId AND orders.channel = :channel', {
        userId,
        channel,
      })
      .orderBy('orders.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage)
      .getMany();
  }

  /** Aggregate revenue/cost/customers for a user's shop orders. */
  async shopSummary(userId: string, since?: Date): Promise<ShopSummaryRow> {
    const qb = this._getQueryBuilder()
      .select('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(orders.amount), 0)', 'revenue')
      .addSelect('COALESCE(SUM(orders.wholesale_amount), 0)', 'cost')
      .addSelect('COUNT(DISTINCT orders.recipient_number)', 'customers')
      .where('orders.user = :userId AND orders.channel = :channel', {
        userId,
        channel: OrderChannel.SHOP,
      });
    if (since) qb.andWhere('orders.created_at >= :since', { since });

    const row = await qb.getRawOne<{
      orders: string;
      revenue: string;
      cost: string;
      customers: string;
    }>();
    return {
      orders: Number(row?.orders ?? 0),
      revenue: Number(row?.revenue ?? 0),
      cost: Number(row?.cost ?? 0),
      customers: Number(row?.customers ?? 0),
    };
  }

  /** Top customers for a shop, keyed by recipient phone number. */
  async topCustomers(userId: string, limit = 5): Promise<TopCustomerRow[]> {
    const rows = await this._getQueryBuilder()
      .select('orders.recipient_number', 'recipientNumber')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(orders.amount), 0)', 'spent')
      .where('orders.user = :userId AND orders.channel = :channel', {
        userId,
        channel: OrderChannel.SHOP,
      })
      .groupBy('orders.recipient_number')
      .orderBy('"orders"', 'DESC')
      .limit(limit)
      .getRawMany<{ recipientNumber: string; orders: string; spent: string }>();
    return rows.map((r) => ({
      recipientNumber: r.recipientNumber,
      orders: Number(r.orders),
      spent: Number(r.spent),
    }));
  }

  /** Top selling packages for a shop. */
  async topPackages(userId: string, limit = 5): Promise<TopPackageRow[]> {
    const rows = await this._getQueryBuilder()
      .select('orders.size_label', 'sizeLabel')
      .addSelect('orders.network', 'network')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(orders.amount), 0)', 'revenue')
      .where('orders.user = :userId AND orders.channel = :channel', {
        userId,
        channel: OrderChannel.SHOP,
      })
      .groupBy('orders.size_label')
      .addGroupBy('orders.network')
      .orderBy('"orders"', 'DESC')
      .limit(limit)
      .getRawMany<{
        sizeLabel: string;
        network: string;
        orders: string;
        revenue: string;
      }>();
    return rows.map((r) => ({
      sizeLabel: r.sizeLabel,
      network: r.network,
      orders: Number(r.orders),
      revenue: Number(r.revenue),
    }));
  }

  /** Daily revenue + profit for the last N days of shop orders. */
  async dailyShopSeries(
    userId: string,
    days = 7,
  ): Promise<{ day: string; revenue: number; profit: number }[]> {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const rows = await this._getQueryBuilder()
      .select(
        "to_char(date_trunc('day', orders.created_at), 'YYYY-MM-DD')",
        'day',
      )
      .addSelect('COALESCE(SUM(orders.amount), 0)', 'revenue')
      .addSelect(
        'COALESCE(SUM(orders.amount - orders.wholesale_amount), 0)',
        'profit',
      )
      .where('orders.user = :userId AND orders.channel = :channel', {
        userId,
        channel: OrderChannel.SHOP,
      })
      .andWhere('orders.created_at >= :since', { since })
      .groupBy("date_trunc('day', orders.created_at)")
      .orderBy("date_trunc('day', orders.created_at)", 'ASC')
      .getRawMany<{ day: string; revenue: string; profit: string }>();

    // Fill missing days with zeros so the chart has a continuous axis.
    const byDay = new Map(
      rows.map((r) => [
        r.day,
        { revenue: Number(r.revenue), profit: Number(r.profit) },
      ]),
    );
    const series: { day: string; revenue: number; profit: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const v = byDay.get(key) ?? { revenue: 0, profit: 0 };
      series.push({ day: key, revenue: v.revenue, profit: v.profit });
    }
    return series;
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
