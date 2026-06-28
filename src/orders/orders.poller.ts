import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

/**
 * Periodically reconciles in-flight (PENDING/PROCESSING) orders with their
 * supplier so delivery/failure transitions are reflected without the agent
 * having to manually refresh.
 *
 * Disable in environments without supplier connectivity (e.g. local dev) by
 * setting ORDERS_POLL_ENABLED=false to avoid noisy, doomed status checks.
 */
@Injectable()
export class OrdersPoller {
  private readonly _logger = new Logger(OrdersPoller.name);
  private readonly _enabled: boolean;
  private _running = false;

  constructor(
    private readonly _ordersService: OrdersService,
    config: ConfigService,
  ) {
    this._enabled =
      config.get<string>('ORDERS_POLL_ENABLED', 'true') !== 'false';
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile(): Promise<void> {
    if (!this._enabled || this._running) return;
    this._running = true;
    try {
      await this._ordersService.pollInFlightOrders();
    } catch (error) {
      this._logger.error(
        `Order reconciliation run failed: ${(error as Error).message}`,
      );
    } finally {
      this._running = false;
    }
  }
}
