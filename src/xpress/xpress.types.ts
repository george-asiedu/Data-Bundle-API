/**
 * Types for the XpresPortal integration.
 * API docs: https://www.xpresportal.app/api/v1 (auth: `x-api-key` header).
 */

/** Raw order statuses XpresPortal can return. */
export type XpressOrderStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'resolved';

/** GET /offers */
export interface XpressOffer {
  name: string;
  isp: string;
  type: string; // e.g. "Data", "Airtime"
  description: string;
  offerSlug: string;
  volumes: number[];
}
export interface XpressOffersResponse {
  success: boolean;
  offers: XpressOffer[];
  authMethod?: string;
}

/** GET /balance */
export interface XpressBalanceResponse {
  success: boolean;
  balance: number;
  currency: string;
  name: string;
  timestamp: string;
}

/** POST /order/:network */
export interface XpressPlaceOrderBody {
  type: 'single' | 'bulk';
  volume: string | number;
  phone: string;
  offerSlug: string;
  webhookUrl: string;
  metadata?: Record<string, unknown>;
}
export interface XpressPlaceOrderResponse {
  success: boolean;
  orderId?: string;
  reference?: string;
  status?: XpressOrderStatus;
  totalAmount?: number;
  currency?: string;
  message?: string;
  error?: string;
  type?: string;
}

/** GET /order/status/:identifier */
export interface XpressOrderStatusResponse {
  success: boolean;
  order?: {
    orderId: string;
    reference: string;
    status: XpressOrderStatus;
    recipient: string;
    volume: number;
    timestamp: string;
  };
  error?: string;
  type?: string;
}

/** POST /order/status/bulk */
export interface XpressBulkStatusItem {
  identifier: string;
  found: boolean;
  orderId?: string;
  reference?: string;
  status?: XpressOrderStatus;
  recipient?: string;
  volume?: number;
  timestamp?: string;
}
export interface XpressBulkStatusResponse {
  success: boolean;
  total: number;
  found: number;
  notFound: number;
  orders: XpressBulkStatusItem[];
}

/** GET /vouchers */
export interface XpressVoucherType {
  name: string;
  description: string;
  voucherUrl: string;
  slug: string;
}
export interface XpressVoucherTypesResponse {
  success: boolean;
  voucherTypes: XpressVoucherType[];
}

/** POST /vouchers/purchase */
export interface XpressPurchaseVoucherBody {
  voucherSlug: string;
  quantity: number;
  phone: string;
  email: string;
  sendViaWhatsApp?: boolean;
  webhookUrl: string;
}
export interface XpressPurchaseVoucherResponse {
  success: boolean;
  transactionId?: string;
  voucherType?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  deliveryPhone?: string;
  deliveryEmail?: string;
  error?: string;
  type?: string;
}

/** POST /afa/register */
export interface XpressAfaRegisterBody {
  name: string;
  phoneNumber: string;
  idNumber: string;
  location: string;
  region: string;
  dateOfBirth?: string;
  occupation?: string;
}
export interface XpressAfaRegisterResponse {
  success: boolean;
  registrationId?: string;
  name?: string;
  phoneNumber?: string;
  idNumber?: string;
  location?: string;
  region?: string;
  registrationPrice?: number;
  status?: string;
  submittedAt?: string;
  error?: string;
  type?: string;
}
