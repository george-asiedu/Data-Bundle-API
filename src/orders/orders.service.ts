import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { OrderRepository } from './repositories/order.repository';
import { Order } from './entities/order.entity';
import { OrderView, toOrderView } from './orders.serializers';
import {
  OrderChannel,
  OrderPaymentMethod,
  OrderStatus,
  PlaceOrderResult,
  SupplierName,
} from './orders.types';
import { SupplierRegistry } from './suppliers/supplier.registry';
import { CreateOrderDto } from './dto/orders.dto';
import { PackageRepository } from '../packages/repositories/package.repository';
import { Package } from '../packages/entities/package.entity';
import { WalletRepository } from '../payment/repositories/wallet.repository';
import { TransactionRepository } from '../payment/repositories/transaction.repository';
import { PaymentService } from '../payment/payment.service';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { EncryptionService } from '../auth/encryption.service';
import { User } from '../auth/entities/user.entity';
import { UserRepository } from '../auth/repositories/user.repository';
import { Role } from '../auth/auth.types';
import { PackageNetwork, PackageType } from '../packages/packages.types';
import { ApplicationException } from '../lib/exception/app.exception';
import { TransactionPurpose, TransactionType } from '../payment/payment.types';
import { DataMessage } from '../lib/utils/types.utils';
import { Paginator } from '../shared/services/paginator.provider';
import { AuditService } from '../audit/audit.service';
import { LogAction } from '../audit/log-action.types';

@Injectable()
export class OrdersService {
  private readonly _logger = new Logger(OrdersService.name);
  private readonly _platformVendorKey: string;

  constructor(
    private readonly _orderRepo: OrderRepository,
    private readonly _packageRepo: PackageRepository,
    private readonly _walletRepo: WalletRepository,
    private readonly _transactionRepo: TransactionRepository,
    private readonly _queryRunnerExec: QueryRunnerExec,
    private readonly _encryptionService: EncryptionService,
    private readonly _suppliers: SupplierRegistry,
    private readonly _auditService: AuditService,
    private readonly _userRepo: UserRepository,
    private readonly _paymentService: PaymentService,
    private readonly _config: ConfigService,
  ) {
    this._platformVendorKey = this._config.get<string>(
      'PLATFORM_DEFAULT_VENDOR_API_KEY',
      '',
    );
  }

  // ── Agent dashboard order (wallet-paid) ──────────────────────

  async placeAgentOrder(
    user: User,
    dto: CreateOrderDto,
  ): Promise<DataMessage<OrderView>> {
    const pkg = await this._getAvailablePackage(dto.packageId);

    // Agents pay the wholesale cost from their wallet. Wallet balances are whole
    // cedis, so the wholesale price must resolve to a whole number of cedis.
    const amountPesewas = pkg.wholesalePrice;
    if (amountPesewas % 100 !== 0) {
      throw new BadRequestException(
        'This package cannot be purchased from the wallet right now.',
      );
    }
    const debitGhs = amountPesewas / 100;

    const reference = this._reference();
    const queryRunner = await this._queryRunnerExec.getRunner();
    let order: Order;

    try {
      const wallet = await this._walletRepo.findByUserIdForUpdate(
        queryRunner,
        user.id,
      );
      if (!wallet) throw new ApplicationException('Wallet not found');
      if (wallet.isFrozen)
        throw new ForbiddenException('This wallet is frozen');
      if (Number(wallet.balance) < debitGhs) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const balanceAfter = Number(wallet.balance) - debitGhs;
      await this._walletRepo.updateBalance(queryRunner, wallet, balanceAfter);

      const txn = await this._transactionRepo.add(
        queryRunner,
        {
          type: TransactionType.DEBIT,
          purpose: TransactionPurpose.BUNDLE_PURCHASE,
          amount: debitGhs,
          balanceAfter,
          reference,
          paystackRef: reference,
        },
        user,
        wallet,
      );

      order = this._buildOrder({
        id: await this._orderRepo.getNextId(queryRunner),
        user,
        pkg,
        recipientNumber: dto.recipientNumber,
        amount: amountPesewas,
        channel: OrderChannel.AGENT_DASHBOARD,
        paymentMethod: OrderPaymentMethod.WALLET,
        reference,
        transactionId: txn.id,
      });
      await this._orderRepo.add(queryRunner, order);

      await this._queryRunnerExec.commit(queryRunner);
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      )
        throw error;
      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error(
        `Order placement failed for ${user.id}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to place order');
    }

    void this._auditService.logAction(LogAction.ORDER_PLACED, user.id, {
      resourceType: 'order',
      resourceId: order.id,
      metadata: {
        network: order.network,
        size: order.sizeLabel,
        amount: order.amount,
        channel: order.channel,
      },
    });

    // Fulfil with the supplier (outside the DB transaction — money is already
    // captured; a fulfilment hiccup leaves a retryable order, never a lost one).
    const fulfilled = await this._fulfil(order, user);

    return {
      message: this._placementMessage(fulfilled.status),
      data: toOrderView(fulfilled),
    };
  }

  // ── Retry a failed/pending order (no re-charge) ──────────────

  async retryOrder(
    user: User,
    orderId: string,
  ): Promise<DataMessage<OrderView>> {
    const order = await this._orderRepo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot retry this order');
    }
    if (
      order.status !== OrderStatus.FAILED &&
      order.status !== OrderStatus.PENDING
    ) {
      throw new BadRequestException(
        `Only failed or pending orders can be retried (current: ${order.status})`,
      );
    }

    order.retryCount += 1;
    const fulfilled = await this._fulfil(order, user, true);

    void this._auditService.logAction(LogAction.ORDER_RETRIED, user.id, {
      resourceType: 'order',
      resourceId: order.id,
      metadata: { attempt: order.retryCount, status: fulfilled.status },
    });

    return {
      message: this._placementMessage(fulfilled.status),
      data: toOrderView(fulfilled),
    };
  }

  // ── Status sync (manual + background poll) ───────────────────

  async syncOrder(
    user: User,
    orderId: string,
  ): Promise<DataMessage<OrderView>> {
    const order = await this._orderRepo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot access this order');
    }

    const updated = await this._sync(order);
    return { message: 'Order status refreshed', data: toOrderView(updated) };
  }

  /** Polls in-flight orders and reconciles their status with the supplier. */
  async pollInFlightOrders(): Promise<void> {
    const orders = await this._orderRepo.findInFlight();
    for (const order of orders) {
      try {
        await this._sync(order);
      } catch (error) {
        this._logger.warn(
          `Status sync failed for ${order.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  // ── Reads ────────────────────────────────────────────────────

  async getOrder(user: User, orderId: string): Promise<DataMessage<OrderView>> {
    const order = await this._orderRepo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot access this order');
    }
    return { message: 'Order retrieved', data: toOrderView(order) };
  }

  async listMyOrders(
    userId: string,
    paginator: Paginator,
  ): Promise<DataMessage<OrderView[]>> {
    try {
      const orders = await this._orderRepo.paginateByUser(userId, paginator);
      return {
        message: 'Orders retrieved successfully',
        data: orders.map(toOrderView),
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load orders');
    }
  }

  // ── Admin: platform-wide order tracking ─────────────────────

  async listAllOrders(paginator: Paginator): Promise<DataMessage<OrderView[]>> {
    try {
      const orders = await this._orderRepo.paginateAll(paginator);
      return {
        message: 'Orders retrieved successfully',
        data: orders.map(toOrderView),
      };
    } catch (error) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Failed to load orders');
    }
  }

  // ── Shop (customer) order: checkout → confirm → fulfil ───────

  /**
   * Starts a customer checkout: creates a PENDING shop order and a Paystack
   * charge for the retail price. The customer pays via the returned access code;
   * fulfilment happens on confirm.
   */
  async createShopCheckout(input: {
    shopUserId: string;
    shopSlug: string;
    pkg: Package;
    recipientNumber: string;
    customerEmail: string;
    retailPrice: number;
    customerName?: string | null;
  }): Promise<
    DataMessage<{ orderId: string; accessCode: string; reference: string }>
  > {
    const owner = await this._userRepo.find(input.shopUserId);
    if (!owner) throw new NotFoundException('Shop owner not found');

    const supplierReference = this._reference();
    const order = this._buildOrder({
      id: await this._orderRepo.getNextId(),
      user: owner,
      pkg: input.pkg,
      recipientNumber: input.recipientNumber,
      amount: input.retailPrice,
      channel: OrderChannel.SHOP,
      paymentMethod: OrderPaymentMethod.PAYSTACK,
      reference: supplierReference,
      customerEmail: input.customerEmail,
      customerName: input.customerName ?? null,
    });

    let saved = await this._orderRepo.save(order);

    const session = await this._paymentService.initializeShopOrderPayment({
      email: input.customerEmail,
      amount: input.retailPrice,
      orderId: saved.id,
      shopSlug: input.shopSlug,
    });

    saved.paystackReference = session.reference;
    saved = await this._orderRepo.save(saved);

    return {
      message: 'Checkout started',
      data: {
        orderId: saved.id,
        accessCode: session.access_code,
        reference: session.reference,
      },
    };
  }

  /**
   * Confirms a shop order after the customer pays: verifies the Paystack charge
   * (no wallet side effects) and fulfils the order with the supplier.
   */
  async confirmShopOrder(
    paystackReference: string,
  ): Promise<DataMessage<OrderView>> {
    const order =
      await this._orderRepo.findByPaystackReference(paystackReference);
    if (!order) throw new NotFoundException('Order not found');

    // Already fulfilled/in-flight — return current state (idempotent).
    if (order.status !== OrderStatus.PENDING) {
      return { message: 'Order already processed', data: toOrderView(order) };
    }

    const charge =
      await this._paymentService.verifyChargeSucceeded(paystackReference);
    if (!charge.success) {
      throw new BadRequestException('Payment not completed.');
    }

    const owner = await this._userRepo.find(order.userId);
    if (!owner) throw new NotFoundException('Shop owner not found');

    const fulfilled = await this._fulfil(order, owner);
    void this._auditService.logAction(LogAction.ORDER_PLACED, order.userId, {
      resourceType: 'order',
      resourceId: order.id,
      metadata: { channel: order.channel, amount: order.amount },
    });

    return {
      message: this._placementMessage(fulfilled.status),
      data: toOrderView(fulfilled),
    };
  }

  /**
   * Customer retry of a failed shop order using their Paystack reference — the
   * money is already taken, so we re-attempt fulfilment without re-charging.
   */
  async retryShopOrderByReference(
    paystackReference: string,
  ): Promise<DataMessage<OrderView>> {
    const order =
      await this._orderRepo.findByPaystackReference(paystackReference);
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status !== OrderStatus.FAILED &&
      order.status !== OrderStatus.PENDING
    ) {
      throw new BadRequestException(
        `This order cannot be retried (status: ${order.status})`,
      );
    }

    const owner = await this._userRepo.find(order.userId);
    if (!owner) throw new NotFoundException('Shop owner not found');

    order.retryCount += 1;
    const fulfilled = await this._fulfil(order, owner, true);
    void this._auditService.logAction(LogAction.ORDER_RETRIED, order.userId, {
      resourceType: 'order',
      resourceId: order.id,
      metadata: { attempt: order.retryCount, channel: order.channel },
    });

    return {
      message: this._placementMessage(fulfilled.status),
      data: toOrderView(fulfilled),
    };
  }

  // ── Internals ────────────────────────────────────────────────

  /** Platform rule: only AT BigTime uses the bigtime supplier endpoint. */
  private _isAtBigtime(order: {
    network: PackageNetwork;
    type: PackageType;
  }): boolean {
    return (
      order.network === PackageNetwork.AT && order.type === PackageType.BIGTIME
    );
  }

  /** Sends the order to its supplier and persists the resulting status. */
  private async _fulfil(
    order: Order,
    user: User,
    isRetry = false,
  ): Promise<Order> {
    const provider = this._suppliers.get(order.supplier);
    const agentApiKey = this._resolveAgentKey(user);

    let result: PlaceOrderResult;
    try {
      result = await provider.placeOrder({
        agentApiKey,
        recipientNumber: order.recipientNumber,
        network: order.network,
        type: order.type,
        capacityGb: order.capacityGb,
        reference: order.supplierReference,
      });
    } catch (error) {
      this._logger.error(
        `Supplier fulfilment threw for ${order.id}: ${(error as Error).message}`,
      );
      result = { accepted: false, statusCode: 0, message: 'Supplier error' };
    }

    order.supplierStatusCode = result.statusCode;
    order.supplierMessage = result.message;

    if (result.accepted) {
      order.status = OrderStatus.PROCESSING;
    } else if (result.statusCode === 0) {
      // Transport/unknown error — leave PENDING so the poll can reconcile.
      order.status = OrderStatus.PENDING;
    } else {
      order.status = OrderStatus.FAILED;
    }

    const saved = await this._orderRepo.save(order);

    if (saved.status === OrderStatus.FAILED && !isRetry) {
      void this._auditService.logAction(LogAction.ORDER_FAILED, order.userId, {
        resourceType: 'order',
        resourceId: order.id,
        metadata: { code: result.statusCode, message: result.message },
      });
    }
    return saved;
  }

  private async _sync(order: Order): Promise<Order> {
    const provider = this._suppliers.get(order.supplier);
    const result = await provider.checkStatus(
      order.supplierReference,
      this._isAtBigtime(order),
    );

    const previous = order.status;
    order.supplierStatusCode = result.statusCode;
    order.status = result.status;
    const saved = await this._orderRepo.save(order);

    if (saved.status !== previous) {
      const action =
        saved.status === OrderStatus.DELIVERED
          ? LogAction.ORDER_DELIVERED
          : saved.status === OrderStatus.FAILED
            ? LogAction.ORDER_FAILED
            : LogAction.ORDER_STATUS_SYNCED;
      void this._auditService.logAction(action, order.userId, {
        resourceType: 'order',
        resourceId: order.id,
        metadata: { from: previous, to: saved.status, raw: result.rawStatus },
      });
    }
    return saved;
  }

  private _buildOrder(input: {
    id: string;
    user: User;
    pkg: Package;
    recipientNumber: string;
    amount: number;
    channel: OrderChannel;
    paymentMethod: OrderPaymentMethod;
    reference: string;
    transactionId?: string | null;
    paystackReference?: string | null;
    customerEmail?: string | null;
    customerName?: string | null;
  }): Order {
    const order = new Order();
    order.id = input.id;
    order.userId = input.user.id;
    order.packageId = input.pkg.id;
    order.network = input.pkg.network;
    order.type = input.pkg.type;
    order.capacityGb = input.pkg.capacityGb;
    order.sizeLabel = input.pkg.sizeLabel;
    order.recipientNumber = input.recipientNumber;
    order.amount = input.amount;
    order.wholesaleAmount = input.pkg.wholesalePrice;
    order.channel = input.channel;
    order.paymentMethod = input.paymentMethod;
    order.status = OrderStatus.PENDING;
    order.supplier = SupplierName.VERDEACCESS;
    order.supplierReference = input.reference;
    order.transactionId = input.transactionId ?? null;
    order.paystackReference = input.paystackReference ?? null;
    order.customerEmail = input.customerEmail ?? null;
    order.customerName = input.customerName ?? null;
    order.retryCount = 0;
    return order;
  }

  private async _getAvailablePackage(packageId: string): Promise<Package> {
    const pkg = await this._packageRepo.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    if (!pkg.isAvailable) {
      throw new BadRequestException('This package is not currently available.');
    }
    return pkg;
  }

  /** The agent's own supplier key if set, else the platform default. */
  private _resolveAgentKey(user: User): string {
    if (user.apiKey) {
      try {
        return this._encryptionService.decrypt(user.apiKey);
      } catch {
        this._logger.warn(
          `Failed to decrypt apiKey for ${user.id}; using platform key`,
        );
      }
    }
    return this._platformVendorKey;
  }

  private _reference(): string {
    const block = () => randomBytes(3).toString('hex').toUpperCase();
    return `IDM-${block()}-${block()}-${block()}`;
  }

  private _placementMessage(status: OrderStatus): string {
    if (status === OrderStatus.PROCESSING)
      return 'Order placed — bundle is being dispatched.';
    if (status === OrderStatus.DELIVERED)
      return 'Order delivered successfully.';
    if (status === OrderStatus.PENDING)
      return 'Order received — awaiting supplier confirmation.';
    return 'Order could not be completed. You can retry it.';
  }
}
