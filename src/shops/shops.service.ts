import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderRepository } from '../orders/repositories/order.repository';
import { toOrderView, OrderView } from '../orders/orders.serializers';
import { OrdersService } from '../orders/orders.service';
import { ShopRepository } from '../packages/repositories/shop.repository';
import { ShopPackageRepository } from '../packages/repositories/shop-package.repository';
import { PackageRepository } from '../packages/repositories/package.repository';
import { ShopCheckoutDto } from './dto/shop-checkout.dto';
import {
  PublicPackage,
  PublicShopProfile,
  toPublicPackage,
  toPublicShopProfile,
} from './shops.serializers';
import { DataMessage } from '../lib/utils/types.utils';
import { Paginator } from '../shared/services/paginator.provider';
import { OrderChannel } from '../orders/orders.types';

export interface ShopOverview {
  thisMonth: {
    orders: number;
    revenue: number;
    profit: number;
    customers: number;
  };
  allTime: {
    orders: number;
    revenue: number;
    profit: number;
    customers: number;
  };
  topPackages: {
    sizeLabel: string;
    network: string;
    orders: number;
    revenue: number;
  }[];
  topCustomers: { recipientNumber: string; orders: number; spent: number }[];
  recentOrders: OrderView[];
  dailySeries: { day: string; revenue: number; profit: number }[];
}

@Injectable()
export class ShopsService {
  private readonly _logger = new Logger(ShopsService.name);

  constructor(
    private readonly _orderRepo: OrderRepository,
    private readonly _ordersService: OrdersService,
    private readonly _shopRepo: ShopRepository,
    private readonly _shopPackageRepo: ShopPackageRepository,
    private readonly _packageRepo: PackageRepository,
  ) {}

  // ── Agent My Shop dashboard ──────────────────────────────────

  async overview(userId: string): Promise<DataMessage<ShopOverview>> {
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [allTime, thisMonth, topPackages, topCustomers, recent, series] =
        await Promise.all([
          this._orderRepo.shopSummary(userId),
          this._orderRepo.shopSummary(userId, monthStart),
          this._orderRepo.topPackages(userId, 5),
          this._orderRepo.topCustomers(userId, 5),
          this._orderRepo.paginateByUserAndChannel(userId, OrderChannel.SHOP, {
            page: 0,
            perPage: 5,
            query: '',
          }),
          this._orderRepo.dailyShopSeries(userId, 7),
        ]);

      const data: ShopOverview = {
        thisMonth: {
          orders: thisMonth.orders,
          revenue: thisMonth.revenue,
          profit: thisMonth.revenue - thisMonth.cost,
          customers: thisMonth.customers,
        },
        allTime: {
          orders: allTime.orders,
          revenue: allTime.revenue,
          profit: allTime.revenue - allTime.cost,
          customers: allTime.customers,
        },
        topPackages,
        topCustomers,
        recentOrders: recent.map(toOrderView),
        dailySeries: series,
      };

      return { message: 'Shop overview retrieved', data };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load shop overview');
    }
  }

  async listShopOrders(
    userId: string,
    paginator: Paginator,
  ): Promise<DataMessage<OrderView[]>> {
    try {
      const orders = await this._orderRepo.paginateByUserAndChannel(
        userId,
        OrderChannel.SHOP,
        paginator,
      );
      return {
        message: 'Shop orders retrieved',
        data: orders.map(toOrderView),
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load shop orders');
    }
  }

  // ── Public storefront (no auth) ──────────────────────────────

  async publicShop(
    slug: string,
  ): Promise<
    DataMessage<{ shop: PublicShopProfile; packages: PublicPackage[] }>
  > {
    const shop = await this._shopRepo.findBySlug(slug);
    if (!shop || !shop.isActive) {
      throw new NotFoundException('Shop not found or currently offline');
    }

    try {
      const [packages, overrides] = await Promise.all([
        this._packageRepo.findAllAvailable(),
        this._shopPackageRepo.findByUserMap(shop.userId),
      ]);

      const inShop: PublicPackage[] = [];
      for (const pkg of packages) {
        const override = overrides.get(pkg.id);
        if (override?.inShop) {
          inShop.push(toPublicPackage(pkg, override.retailPrice));
        }
      }

      return {
        message: 'Shop retrieved',
        data: { shop: toPublicShopProfile(shop), packages: inShop },
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load shop');
    }
  }

  /** Customer checkout: validates the shop/package, starts the Paystack charge. */
  async checkout(slug: string, dto: ShopCheckoutDto) {
    const shop = await this._shopRepo.findBySlug(slug);
    if (!shop || !shop.isActive) {
      throw new NotFoundException('Shop not found or currently offline');
    }

    const pkg = await this._packageRepo.findById(dto.packageId);
    if (!pkg || !pkg.isAvailable) {
      throw new BadRequestException('This package is not available.');
    }

    const override = await this._shopPackageRepo.findOne(shop.userId, pkg.id);
    if (!override || !override.inShop) {
      throw new BadRequestException('This package is not sold in this shop.');
    }

    return this._ordersService.createShopCheckout({
      shopUserId: shop.userId,
      shopSlug: shop.slug,
      pkg,
      recipientNumber: dto.recipientNumber,
      customerEmail: dto.email,
      retailPrice: override.retailPrice,
      customerName: dto.customerName ?? null,
    });
  }

  confirm(reference: string): Promise<DataMessage<OrderView>> {
    return this._ordersService.confirmShopOrder(reference);
  }

  retry(reference: string): Promise<DataMessage<OrderView>> {
    return this._ordersService.retryShopOrderByReference(reference);
  }
}
