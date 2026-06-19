import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SupplierProvider } from './supplier.provider';
import {
  CheckStatusResult,
  OrderStatus,
  PlaceOrderInput,
  PlaceOrderResult,
  SupplierName,
} from '../orders.types';
import { PackageType } from '../../packages/packages.types';

interface VerdePlaceResponse {
  status?: number | string;
  message?: string;
}
interface VerdeStatusResponse {
  status?: number | string;
  order_status?: string;
  message?: string;
}

/**
 * Verdeaccess fulfilment integration.
 *
 * Endpoints (env-overridable):
 *   regular place  : /api/v1/regular.php
 *   regular status : /api/v1/status_regular.php
 *   bigtime place  : /api/v1/bigtime.php
 *   bigtime status : /api/v1/response_bigtime.php
 *
 * Place orders authenticate with the placing agent's `agent_api`; status checks
 * use the platform admin key (`api`).
 */
@Injectable()
export class VerdeaccessProvider implements SupplierProvider {
  public readonly name = SupplierName.VERDEACCESS;
  private readonly _logger = new Logger(VerdeaccessProvider.name);
  private readonly _http: AxiosInstance;
  private readonly _adminApiKey: string;

  private readonly _paths: {
    regular: string;
    regularStatus: string;
    bigtime: string;
    bigtimeStatus: string;
  };

  constructor(private readonly _config: ConfigService) {
    const baseURL = this._config.get<string>(
      'VERDEACCESS_BASE_URL',
      'https://api.verde.verdeaccess.com',
    );
    this._http = axios.create({
      baseURL,
      timeout: this._config.get<number>('VERDEACCESS_TIMEOUT_MS', 20000),
      headers: { 'Content-Type': 'application/json' },
    });

    this._paths = {
      regular: this._config.get<string>(
        'VERDEACCESS_REGULAR_PATH',
        '/api/v1/regular.php',
      ),
      regularStatus: this._config.get<string>(
        'VERDEACCESS_REGULAR_STATUS_PATH',
        '/api/v1/status_regular.php',
      ),
      bigtime: this._config.get<string>(
        'VERDEACCESS_BIGTIME_PATH',
        '/api/v1/bigtime.php',
      ),
      bigtimeStatus: this._config.get<string>(
        'VERDEACCESS_BIGTIME_STATUS_PATH',
        '/api/v1/response_bigtime.php',
      ),
    };

    // Distinct admin key for status checks; falls back to the vendor key.
    this._adminApiKey =
      this._config.get<string>('VERDEACCESS_ADMIN_API_KEY') ||
      this._config.get<string>('PLATFORM_DEFAULT_VENDOR_API_KEY', '');
  }

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const isBigtime = input.type === PackageType.BIGTIME;
    const path = isBigtime ? this._paths.bigtime : this._paths.regular;

    // BigTime is AT-specific and omits the network field; regular includes it.
    const payload: Record<string, string> = {
      agent_api: input.agentApiKey,
      recipient_number: input.recipientNumber,
      gig: String(input.capacityGb),
      reference_id: input.reference,
    };
    if (!isBigtime) payload.network = input.network;

    try {
      const res = await this._http.post<VerdePlaceResponse>(path, payload);
      const statusCode = this._toCode(res.data?.status, res.status);
      return {
        accepted: statusCode === 200,
        statusCode,
        message: res.data?.message ?? this._codeMessage(statusCode),
      };
    } catch (error) {
      this._logger.error(
        `Verde place order failed (ref ${input.reference}): ${(error as Error).message}`,
      );
      // Network/timeout — treat as not accepted; the order can be retried.
      return {
        accepted: false,
        statusCode: 0,
        message: 'Supplier request failed. Please retry.',
      };
    }
  }

  async checkStatus(reference: string): Promise<CheckStatusResult> {
    // We don't persist which sub-endpoint placed the order, so try the regular
    // status endpoint first and fall back to the bigtime one.
    const attempt = async (
      path: string,
    ): Promise<VerdeStatusResponse | null> => {
      try {
        const res = await this._http.post<VerdeStatusResponse>(path, {
          reference_id: reference,
          api: this._adminApiKey,
        });
        return res.data ?? null;
      } catch {
        return null;
      }
    };

    const data =
      (await attempt(this._paths.regularStatus)) ??
      (await attempt(this._paths.bigtimeStatus));

    const statusCode = this._toCode(data?.status, 0);
    const rawStatus = data?.order_status ?? null;
    return {
      statusCode,
      rawStatus,
      status: this._mapStatus(rawStatus),
    };
  }

  private _toCode(value: unknown, fallback: number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = parseInt(value, 10);
      if (!isNaN(n)) return n;
    }
    return fallback;
  }

  /** Maps Verde's free-text order_status to our lifecycle. */
  private _mapStatus(raw: string | null): OrderStatus {
    const s = (raw ?? '').toLowerCase();
    if (
      s.includes('deliver') ||
      s.includes('success') ||
      s.includes('complete')
    )
      return OrderStatus.DELIVERED;
    if (s.includes('fail') || s.includes('cancel') || s.includes('reject'))
      return OrderStatus.FAILED;
    if (s.includes('process') || s.includes('pending'))
      return OrderStatus.PROCESSING;
    return OrderStatus.PROCESSING;
  }

  private _codeMessage(code: number): string {
    const map: Record<number, string> = {
      200: 'Successful',
      201: 'Supplier wallet balance is low',
      202: 'Package is out of stock',
      203: 'Order could not be processed',
      204: 'Agent not found',
      206: 'Network not found',
      209: 'Price not found',
    };
    return map[code] ?? 'Order could not be processed';
  }
}
