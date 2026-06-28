import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/** Payload emitted when a customer shop order's Paystack charge succeeds. */
export interface ShopOrderPaidEvent {
  reference: string;
}

export const APP_EVENTS = {
  SHOP_ORDER_PAID: 'shop-order.paid',
} as const;

/**
 * Lightweight in-process event bus used to decouple modules that would
 * otherwise form a dependency cycle (e.g. Payment emitting an event that Orders
 * reacts to, without Payment importing Orders).
 */
@Injectable()
export class AppEvents {
  private readonly _emitter = new EventEmitter();

  constructor() {
    // Many listeners across modules are expected; lift the default cap.
    this._emitter.setMaxListeners(50);
  }

  emitShopOrderPaid(payload: ShopOrderPaidEvent): void {
    this._emitter.emit(APP_EVENTS.SHOP_ORDER_PAID, payload);
  }

  onShopOrderPaid(handler: (payload: ShopOrderPaidEvent) => void): void {
    this._emitter.on(APP_EVENTS.SHOP_ORDER_PAID, handler);
  }
}
