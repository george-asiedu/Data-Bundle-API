import { LogAction, ROUTE_ACTION_MAP } from './log-action.types';
import { Request } from 'express';

// Normalize dynamic segments — /wallet/WL1001 → /wallet/:id
export function resolveAction(method: string, path: string): LogAction | null {
  const strippedPath = path.replace(/^\/api/, '');

  const normalized = strippedPath
    .replace(/\/[A-Z]{2}\d+/g, '/:id')
    .replace(/\/\d+/g, '/:n')
    .replace(/\/[0-9a-f-]{36}/gi, '/:id');

  const key = `${method} ${normalized}`;
  return ROUTE_ACTION_MAP[key] ?? null;
}

// Extract safe, relevant context per action type — never log passwords or tokens
export function extractMetadata(
  action: LogAction,
  req: Request,
  responseBody: unknown,
): Record<string, unknown> | null {
  const body = req.body as Record<string, unknown>;
  const params = req.params;

  switch (action) {
    case LogAction.LOGIN:
    case LogAction.LOGIN_FAILED:
      return { email: body.email };

    case LogAction.INITIALIZE_PAYMENT:
    case LogAction.INITIALIZE_REGISTRATION_PAYMENT:
      return {
        email: body.email,
        amount: body.amount,
      };

    case LogAction.COMPLETE_FINANCIAL_SETUP:
      return {
        businessName: body.businessName,
        bankCode: body.bankCode,
        accountNumber: body.accountNumber,
        vendorApiKey: body.vendorApiKey,
      };

    case LogAction.VERIFY_TRANSACTION:
      return {
        reference:
          params.reference ??
          (responseBody as Record<string, unknown>).id ??
          null,
      };

    case LogAction.UPLOAD_INITIATED:
    case LogAction.UPLOAD_COMPLETED:
    case LogAction.UPLOAD_ABORTED:
      return {
        key: body.key,
        shortUrl: body.shortUrl,
        longUrl: body.longUrl,
      };

    default:
      return null;
  }
}
