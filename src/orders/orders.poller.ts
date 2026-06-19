import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

/**
 * Periodically reconciles in-flight (PENDING/PROCESSING) orders with their
 * supplier so delivery/failure transitions are reflected without the agent
 * having to manually refresh.
 */
@Injectable()
export class OrdersPoller {
  private readonly _logger = new Logger(OrdersPoller.name);
  private _running = false;

  constructor(private readonly _ordersService: OrdersService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile(): Promise<void> {
    if (this._running) return; // avoid overlapping runs
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
