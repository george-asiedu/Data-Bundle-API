import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { SupplierProvider } from '../orders/suppliers/supplier.provider';
import {
  CheckStatusResult,
  OrderStatus,
  PlaceOrderInput,
  PlaceOrderResult,
  SupplierName,
} from '../orders/orders.types';
import { PackageNetwork, PackageType } from '../packages/packages.types';
import {
  XpressAfaRegisterBody,
  XpressAfaRegisterResponse,
  XpressBalanceResponse,
  XpressBulkStatusResponse,
  XpressOffersResponse,
  XpressOrderStatusResponse,
  XpressPlaceOrderBody,
  XpressPlaceOrderResponse,
  XpressPurchaseVoucherBody,
  XpressPurchaseVoucherResponse,
  XpressVoucherTypesResponse,
} from './xpress.types';

/**
 * XpresPortal fulfilment integration — the platform's default supplier.
 *
 * Auth is via the `x-api-key` header. Every request uses either the placing
 * user's own stored key or, when they have none, the platform key
 * (`XPRESS_API_KEY`). The provider derives the `offerSlug` and order network
 * path from our package's network/type; `volume` is the package capacity (GB).
 *
 * Beyond the SupplierProvider contract (placeOrder/checkStatus) it exposes the
 * rest of the XpresPortal surface — offers, balance, bulk status, vouchers and
 * AFA registration — consumed by XpressService.
 */
@Injectable()
export class XpressProvider implements SupplierProvider {
  public readonly name = SupplierName.XPRESS;

  /**
   * Default offer slugs per `${network}_${type}`, from GET /offers. MTN is a
   * placeholder until its data offer is re-enabled upstream. Override any of
   * these with XPRESS_OFFER_<NETWORK>_<TYPE>.
   */
  private static readonly OFFER_SLUGS: Record<string, string> = {
    MTN_REGULAR: 'mtn_data_bundle',
    MTN_BIGTIME: 'mtn_data_bundle',
    AT_REGULAR: 'airteltigo_ishare_portal',
    AT_BIGTIME: 'airteltigo_bigtime_portal',
    TELECEL_REGULAR: 'telecel_group_share_portal',
    TELECEL_BIGTIME: 'telecel_group_share_portal',
  };

  /** Airtime offer slug (shared across networks; amount passed as volume). */
  public static readonly AIRTIME_SLUG = 'evd__airtime_vendor_portal';

  private readonly _logger = new Logger(XpressProvider.name);
  private readonly _http: AxiosInstance;
  private readonly _platformKey: string;
  private readonly _webhookUrl: string;

  constructor(private readonly _config: ConfigService) {
    const baseURL = this._config.get<string>(
      'XPRESS_BASE_URL',
      'https://www.xpresportal.app/api/v1',
    );
    this._http = axios.create({
      baseURL,
      timeout: this._config.get<number>('XPRESS_TIMEOUT_MS', 20000),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    this._platformKey = this._config.get<string>('XPRESS_API_KEY', '');

    // XpresPortal requires a webhookUrl on every order/voucher request. Falls
    // back to our public server URL so deliveries can be reconciled.
    const base = this._config.get<string>('LIVE_SERVER_URL', '');
    this._webhookUrl = this._config.get<string>(
      'XPRESS_WEBHOOK_URL',
      base ? `${base.replace(/\/$/, '')}/orders/webhook/xpress` : '',
    );
  }

  // ── SupplierProvider contract ────────────────────────────────

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const apiKey = input.agentApiKey || this._platformKey;
    const body: XpressPlaceOrderBody = {
      type: 'single',
      volume: input.capacityGb,
      phone: input.recipientNumber,
      offerSlug: this._offerSlug(input.network, input.type),
      webhookUrl: this._webhookUrl,
      metadata: { idempotencyKey: input.reference },
    };

    try {
      const res = await this._http.post<XpressPlaceOrderResponse>(
        `/order/${this._networkPath(input.network)}`,
        body,
        this._auth(apiKey),
      );
      const data = res.data;
      const accepted = data?.success === true;
      return {
        accepted,
        statusCode: res.status,
        message:
          data?.message ??
          data?.error ??
          (accepted ? 'Order accepted' : 'Order could not be placed'),
      };
    } catch (error) {
      return this._placeError(error, input.reference);
    }
  }

  async checkStatus(reference: string): Promise<CheckStatusResult> {
    // Status checks use the platform key; per-user keys can only see their own
    // orders, but the platform key reconciles platform-placed orders.
    try {
      const res = await this._http.get<XpressOrderStatusResponse>(
        `/order/status/${encodeURIComponent(reference)}`,
        this._auth(this._platformKey),
      );
      const raw = res.data?.order?.status ?? null;
      return {
        statusCode: res.status,
        rawStatus: raw,
        status: this.mapStatus(raw),
      };
    } catch (error) {
      this._logger.debug(
        `Xpress status check failed (ref ${reference}): ${(error as Error).message}`,
      );
      return { statusCode: 0, rawStatus: null, status: OrderStatus.PROCESSING };
    }
  }

  /** Supplier wallet balance for the given key (defaults to the platform key). */
  async getBalance(apiKey?: string): Promise<number> {
    const res = await this._http.get<XpressBalanceResponse>(
      '/balance',
      this._auth(apiKey || this._platformKey),
    );
    return Number(res.data?.balance ?? 0);
  }

  // ── Extended XpresPortal surface (used by XpressService) ─────

  async getOffers(apiKey?: string): Promise<XpressOffersResponse> {
    const res = await this._http.get<XpressOffersResponse>(
      '/offers',
      this._auth(apiKey || this._platformKey),
    );
    return res.data;
  }

  async getBalanceInfo(apiKey?: string): Promise<XpressBalanceResponse> {
    const res = await this._http.get<XpressBalanceResponse>(
      '/balance',
      this._auth(apiKey || this._platformKey),
    );
    return res.data;
  }

  async bulkCheckStatus(
    identifiers: string[],
    apiKey?: string,
  ): Promise<XpressBulkStatusResponse> {
    const res = await this._http.post<XpressBulkStatusResponse>(
      '/order/status/bulk',
      { identifiers },
      this._auth(apiKey || this._platformKey),
    );
    return res.data;
  }

  async listVoucherTypes(apiKey?: string): Promise<XpressVoucherTypesResponse> {
    const res = await this._http.get<XpressVoucherTypesResponse>(
      '/vouchers',
      this._auth(apiKey || this._platformKey),
    );
    return res.data;
  }

  async purchaseVouchers(
    body: Omit<XpressPurchaseVoucherBody, 'webhookUrl'>,
    apiKey?: string,
  ): Promise<XpressPurchaseVoucherResponse> {
    const res = await this._http.post<XpressPurchaseVoucherResponse>(
      '/vouchers/purchase',
      { ...body, webhookUrl: this._webhookUrl },
      this._auth(apiKey || this._platformKey),
    );
    return res.data;
  }

  async registerAfa(
    body: XpressAfaRegisterBody,
    apiKey?: string,
  ): Promise<XpressAfaRegisterResponse> {
    const res = await this._http.post<XpressAfaRegisterResponse>(
      '/afa/register',
      body,
      this._auth(apiKey || this._platformKey),
    );
    return res.data;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private _auth(apiKey: string) {
    return { headers: { 'x-api-key': apiKey } };
  }

  /** XpresPortal order network path segment (mtn | telecel | tigo). */
  private _networkPath(network: PackageNetwork): string {
    switch (network) {
      case PackageNetwork.MTN:
        return 'mtn';
      case PackageNetwork.TELECEL:
        return 'telecel';
      case PackageNetwork.AT:
        return 'at';
    }
  }

  /**
   * Resolves the XpresPortal offer slug for a network/type. Defaults are the
   * real slugs from GET /offers and are env-overridable (e.g.
   * XPRESS_OFFER_AT_BIGTIME) so they can be retargeted without code changes.
   * MTN data has no live slug yet (offer currently unavailable upstream).
   */
  private _offerSlug(network: PackageNetwork, type: PackageType): string {
    const envKey = `XPRESS_OFFER_${network}_${type}`;
    return this._config.get<string>(
      envKey,
      XpressProvider.OFFER_SLUGS[`${network}_${type}`] ?? '',
    );
  }

  /** Maps XpresPortal order status to our internal lifecycle. */
  mapStatus(raw: string | null): OrderStatus {
    switch ((raw ?? '').toLowerCase()) {
      case 'delivered':
      case 'resolved':
        return OrderStatus.DELIVERED;
      case 'failed':
      case 'cancelled':
      case 'refunded':
        return OrderStatus.FAILED;
      case 'processing':
        return OrderStatus.PROCESSING;
      case 'pending':
        return OrderStatus.PENDING;
      default:
        return OrderStatus.PROCESSING;
    }
  }

  private _placeError(error: unknown, reference: string): PlaceOrderResult {
    if (isAxiosError(error) && error.response) {
      const data = error.response.data as XpressPlaceOrderResponse | undefined;
      // 4xx with a body is a definitive rejection (bad input, insufficient
      // balance, etc.) — surface it as failed rather than retryable.
      return {
        accepted: false,
        statusCode: error.response.status,
        message: data?.error ?? data?.message ?? 'Order rejected by supplier',
      };
    }
    // Transport/timeout — retryable.
    this._logger.error(
      `Xpress place order failed (ref ${reference}): ${(error as Error).message}`,
    );
    return {
      accepted: false,
      statusCode: 0,
      message: 'Supplier request failed. Please retry.',
    };
  }
}
