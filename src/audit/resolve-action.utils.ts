import { LogAction, ROUTE_ACTION_MAP } from './log-action.types';
import { Request } from 'express';
import { User } from '../auth/entities/user.entity';

export interface AuditContext {
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
}

// Normalize dynamic segments so concrete URLs map to a route template:
//   /upload/AG1001/business-logo   → /upload/:id/business-logo
//   /payment/verify/n7wg9swvto     → /payment/verify/:reference
export function resolveAction(method: string, path: string): LogAction | null {
  const strippedPath = path.replace(/^\/api/, '');

  const normalized = strippedPath
    // Paystack-style references are free-form, so collapse the whole segment.
    .replace(/(\/payment\/verify)\/[^/]+/, '$1/:reference')
    // Entity ids: AG1001, CU1001, TR1001, WL1001, …
    .replace(/\/[A-Za-z]{2}\d+/g, '/:id')
    // UUIDs
    .replace(/\/[0-9a-f-]{36}/gi, '/:id')
    // Bare numeric ids
    .replace(/\/\d+/g, '/:n');

  const key = `${method} ${normalized}`;
  return ROUTE_ACTION_MAP[key] ?? null;
}

/**
 * Derives the audited resource (type + id) and a safe metadata snapshot for an
 * action. Never returns secrets or full financial identifiers.
 */
export function buildAuditContext(
  action: LogAction,
  req: Request,
  responseBody: unknown,
): AuditContext {
  const body = (req.body as Record<string, unknown>) ?? {};
  const params = req.params ?? {};
  const actingUserId = (req.user as User | null)?.id ?? null;
  const data = extractResponseData(responseBody);

  switch (action) {
    case LogAction.INITIALIZE_PAYMENT:
    case LogAction.INITIALIZE_REGISTRATION_PAYMENT:
      return {
        resourceType: 'payment',
        resourceId: asString(data?.reference),
        metadata: { email: body.email, amount: body.amount },
      };

    case LogAction.VERIFY_TRANSACTION:
      return {
        resourceType: 'transaction',
        resourceId: asString(params.reference) ?? asString(data?.reference),
        metadata: { reference: asString(params.reference) },
      };

    case LogAction.COMPLETE_FINANCIAL_SETUP:
    case LogAction.UPDATE_FINANCIAL_SETUP:
      return {
        resourceType: 'user',
        resourceId: actingUserId,
        metadata: {
          businessName: body.businessName,
          bankCode: body.bankCode,
          // Mask the bank account and never persist the vendor API key — audit
          // logs must not store secrets or full financial identifiers.
          accountNumber: maskTail(body.accountNumber),
          vendorApiKeyProvided: Boolean(body.vendorApiKey),
        },
      };

    case LogAction.BUSINESS_LOGO_UPLOADED:
    case LogAction.PROFILE_LOGO_UPLOADED:
      return {
        resourceType: 'user',
        resourceId: asString(params.id) ?? actingUserId,
        metadata: { shortUrl: body.shortUrl, longUrl: body.longUrl },
      };

    case LogAction.UPLOAD_INITIATED:
    case LogAction.UPLOAD_COMPLETED:
    case LogAction.UPLOAD_ABORTED:
      return {
        resourceType: 'upload',
        resourceId: asString(body.key),
        metadata: {
          key: body.key,
          shortUrl: body.shortUrl,
          longUrl: body.longUrl,
        },
      };

    default:
      return { resourceType: null, resourceId: null, metadata: null };
  }
}

function extractResponseData(
  responseBody: unknown,
): Record<string, unknown> | null {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'data' in responseBody
  ) {
    const data = (responseBody as { data?: unknown }).data;
    if (data && typeof data === 'object')
      return data as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Keep only the last 4 characters of a sensitive identifier (e.g. ****6789).
function maskTail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const tail = value.slice(-4);
  return `****${tail}`;
}
