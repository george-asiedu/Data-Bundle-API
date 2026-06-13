import { User } from '../auth/entities/user.entity';

export enum LogAction {
  REGISTER = 'auth.register',
  EMAIL_VERIFIED = 'auth.email_verified',
  LOGIN_INITIATED = 'auth.login_initiated',
  LOGIN = 'auth.login',
  LOGIN_FAILED = 'auth.login_failed',
  LOGOUT = 'auth.logout',
  PASSWORD_RESET_REQUESTED = 'auth.password_reset_requested',
  PASSWORD_RESET = 'auth.password_reset',

  // Upload — logged by the interceptor on authenticated routes
  UPLOAD_INITIATED = 'upload.initiated',
  UPLOAD_COMPLETED = 'upload.completed',
  UPLOAD_ABORTED = 'upload.aborted',
  BUSINESS_LOGO_UPLOADED = 'upload.business_logo',
  PROFILE_LOGO_UPLOADED = 'upload.profile_logo',

  // Payment
  INITIALIZE_PAYMENT = 'payment.initialize',
  INITIALIZE_REGISTRATION_PAYMENT = 'payment.registration',
  VERIFY_TRANSACTION = 'payment.verify',
  PAYMENT_CONFIRMED = 'payment.confirmed',
  COMPLETE_FINANCIAL_SETUP = 'payment.complete_financial_setup',
  UPDATE_FINANCIAL_SETUP = 'payment.update_financial_setup',
}

export interface CreateLogPayload {
  action: LogAction;
  user?: User | null;
  userId?: string | null;
  endpoint?: string | null;
  statusCode?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  durationMs?: number | null;
}

/**
 * Routes audited by the global interceptor. Auth outcomes are intentionally
 * absent here — they are logged manually in AuthService so the acting user and
 * success/failure are captured precisely (req.user is null on those routes).
 * Paths are matched after normalization (see resolveAction).
 */
export const ROUTE_ACTION_MAP: Record<string, LogAction> = {
  'POST /upload/initiate': LogAction.UPLOAD_INITIATED,
  'POST /upload/complete': LogAction.UPLOAD_COMPLETED,
  'POST /upload/abort': LogAction.UPLOAD_ABORTED,
  'POST /upload/:id/business-logo': LogAction.BUSINESS_LOGO_UPLOADED,
  'POST /upload/:id/profile-logo': LogAction.PROFILE_LOGO_UPLOADED,

  'POST /payment/initialize': LogAction.INITIALIZE_PAYMENT,
  'POST /payment/initialize/registration':
    LogAction.INITIALIZE_REGISTRATION_PAYMENT,
  'GET /payment/verify/:reference': LogAction.VERIFY_TRANSACTION,
  'POST /payment/complete-financial-setup': LogAction.COMPLETE_FINANCIAL_SETUP,
  'PUT /payment/update-financial-setup': LogAction.UPDATE_FINANCIAL_SETUP,
};
