import { User } from '../auth/entities/user.entity';

export enum LogAction {
  LOGIN = 'auth.login',
  LOGOUT = 'auth.logout',
  LOGIN_FAILED = 'auth.login_failed',
  PASSWORD_RESET = 'auth.password_reset',
  EMAIL_VERIFIED = 'auth.email_verified',

  UPLOAD_INITIATED = 'upload.initiated',
  UPLOAD_COMPLETED = 'upload.completed',
  UPLOAD_ABORTED = 'upload.aborted',

  INITIALIZE_PAYMENT = 'payment.initialize',
  INITIALIZE_REGISTRATION_PAYMENT = 'payment.registration',
  VERIFY_TRANSACTION = 'payment.verify',
  COMPLETE_FINANCIAL_SETUP = 'payment.complete_financial_setup',
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

export const ROUTE_ACTION_MAP: Record<string, LogAction> = {
  'POST /auth/login': LogAction.LOGIN,
  'POST /auth/logout': LogAction.LOGOUT,
  'POST /auth/password-reset': LogAction.PASSWORD_RESET,
  'POST /auth/verify-email': LogAction.EMAIL_VERIFIED,

  'POST /upload/initiate': LogAction.UPLOAD_INITIATED,
  'POST /upload/complete': LogAction.UPLOAD_COMPLETED,
  'POST /upload/abort': LogAction.UPLOAD_ABORTED,

  'POST /payment/initialize': LogAction.INITIALIZE_PAYMENT,
  'POST /payment/initialize/registration':
    LogAction.INITIALIZE_REGISTRATION_PAYMENT,
  'POST /payment/complete-financial-setup': LogAction.COMPLETE_FINANCIAL_SETUP,
};
