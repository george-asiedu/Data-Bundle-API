import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import { XpressProvider } from './xpress.provider';
import { UserRepository } from '../auth/repositories/user.repository';
import { EncryptionService } from '../auth/encryption.service';
import { User } from '../auth/entities/user.entity';
import {
  AfaRegisterDto,
  BulkStatusDto,
  PurchaseVoucherDto,
} from './dto/xpress.dto';
import { DataMessage } from '../lib/utils/types.utils';
import { SupplierName } from '../orders/orders.types';

/**
 * Orchestrates the user-facing XpresPortal features that sit alongside order
 * fulfilment: offers, supplier balance, bulk status, vouchers, AFA registration
 * and management of each user's personal XpresPortal API key.
 *
 * Every call resolves the acting key the same way fulfilment does: the user's
 * own stored key when present, otherwise the platform key (handled inside the
 * provider when no key is passed).
 */
@Injectable()
export class XpressService {
  private readonly _logger = new Logger(XpressService.name);

  constructor(
    private readonly _xpress: XpressProvider,
    private readonly _userRepo: UserRepository,
    private readonly _encryption: EncryptionService,
  ) {}

  // ── Personal API key management (all roles) ──────────────────

  /** Whether the user has their own key, its supplier, plus a masked preview. Never returns the raw key. */
  getApiKey(user: User): DataMessage<{
    hasOwnKey: boolean;
    supplier: SupplierName;
    preview: string | null;
  }> {
    const key = this._tryDecrypt(user.apiKey);
    return {
      message: 'API key status retrieved',
      data: {
        hasOwnKey: Boolean(key),
        supplier: user.apiKeySupplier ?? SupplierName.XPRESS,
        preview: key ? this._mask(key) : null,
      },
    };
  }

  async setApiKey(
    user: User,
    rawKey: string,
    supplier: SupplierName = SupplierName.XPRESS,
  ): Promise<DataMessage<{ preview: string; supplier: SupplierName }>> {
    const key = rawKey.trim();

    // Only XpresPortal exposes a balance endpoint we can validate against;
    // accept Verdeaccess keys as-is (validated implicitly on first use).
    if (supplier === SupplierName.XPRESS) {
      try {
        await this._xpress.getBalance(key);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          throw new BadRequestException('That XpresPortal API key is invalid.');
        }
        this._logger.error(
          `API key validation failed: ${(error as Error).message}`,
        );
        throw new InternalServerErrorException(
          'Could not validate the API key right now.',
        );
      }
    }

    await this._userRepo.setApiKey(
      user.id,
      this._encryption.encrypt(key),
      supplier,
    );
    return {
      message: 'API key saved',
      data: { preview: this._mask(key), supplier },
    };
  }

  async deleteApiKey(user: User): Promise<DataMessage<null>> {
    if (!user.apiKey) throw new NotFoundException('No API key to remove');
    // Clearing the key reverts the user to the platform key, which is XpresPortal.
    await this._userRepo.setApiKey(user.id, null, SupplierName.XPRESS);
    return {
      message: 'API key removed — orders now use the platform key',
      data: null,
    };
  }

  // ── Offers / balance ─────────────────────────────────────────

  async getOffers(user: User) {
    try {
      const data = await this._xpress.getOffers(this._userKey(user));
      return { message: 'Offers retrieved', data: data.offers ?? [] };
    } catch (error) {
      throw this._toHttp(error, 'Failed to load offers');
    }
  }

  async getBalance(user: User) {
    try {
      const data = await this._xpress.getBalanceInfo(this._userKey(user));
      return {
        message: 'Balance retrieved',
        data: {
          balance: data.balance,
          currency: data.currency,
          name: data.name,
        },
      };
    } catch (error) {
      throw this._toHttp(error, 'Failed to load balance');
    }
  }

  // ── Bulk order status ────────────────────────────────────────

  async bulkStatus(user: User, dto: BulkStatusDto) {
    try {
      const data = await this._xpress.bulkCheckStatus(
        dto.identifiers,
        this._userKey(user),
      );
      return { message: 'Statuses retrieved', data };
    } catch (error) {
      throw this._toHttp(error, 'Failed to check order statuses');
    }
  }

  // ── Vouchers ─────────────────────────────────────────────────

  async listVouchers(user: User) {
    try {
      const data = await this._xpress.listVoucherTypes(this._userKey(user));
      return {
        message: 'Voucher types retrieved',
        data: data.voucherTypes ?? [],
      };
    } catch (error) {
      throw this._toHttp(error, 'Failed to load voucher types');
    }
  }

  async purchaseVouchers(user: User, dto: PurchaseVoucherDto) {
    const key = this._userKey(user);
    await this._assertBalance(key);
    try {
      const data = await this._xpress.purchaseVouchers(
        {
          voucherSlug: dto.voucherSlug,
          quantity: dto.quantity,
          phone: dto.phone,
          email: dto.email,
          sendViaWhatsApp: dto.sendViaWhatsApp ?? false,
        },
        key,
      );
      if (!data.success) {
        throw new BadRequestException(data.error ?? 'Voucher purchase failed');
      }
      return { message: 'Vouchers purchased', data };
    } catch (error) {
      throw this._toHttp(error, 'Failed to purchase vouchers');
    }
  }

  // ── AFA registration (MTN only — fee deducted from supplier wallet) ──

  async registerAfa(user: User, dto: AfaRegisterDto) {
    const key = this._userKey(user);
    await this._assertBalance(key);
    try {
      const data = await this._xpress.registerAfa(dto, key);
      if (!data.success) {
        throw new BadRequestException(data.error ?? 'AFA registration failed');
      }
      return { message: 'AFA registration submitted', data };
    } catch (error) {
      throw this._toHttp(error, 'Failed to register for AFA');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  /** The user's own decrypted key, or undefined to fall back to the platform key. */
  private _userKey(user: User): string | undefined {
    return this._tryDecrypt(user.apiKey) ?? undefined;
  }

  private _tryDecrypt(encrypted?: string | null): string | null {
    if (!encrypted) return null;
    try {
      return this._encryption.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  /** Purchases require a non-zero supplier wallet balance. */
  private async _assertBalance(apiKey?: string): Promise<void> {
    let balance: number;
    try {
      balance = await this._xpress.getBalance(apiKey);
    } catch (error) {
      throw this._toHttp(error, 'Could not verify wallet balance');
    }
    if (balance <= 0) {
      throw new BadRequestException(
        'Your supplier wallet balance is empty. Please top up before purchasing.',
      );
    }
  }

  private _mask(key: string): string {
    if (key.length <= 8) return '••••';
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  }

  private _toHttp(error: unknown, fallback: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException
    ) {
      return error;
    }
    if (isAxiosError(error) && error.response) {
      const data = error.response.data as
        | { error?: string; message?: string }
        | undefined;
      const status = error.response.status;
      const msg = data?.error ?? data?.message ?? fallback;
      if (status === 401)
        return new BadRequestException('Invalid or missing API key');
      if (status >= 400 && status < 500) return new BadRequestException(msg);
    }
    this._logger.error(`${fallback}: ${(error as Error).message}`);
    return new InternalServerErrorException(fallback);
  }
}
