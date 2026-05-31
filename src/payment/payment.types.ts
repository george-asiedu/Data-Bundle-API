export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum TransactionPurpose {
  TOP_UP = 'TOP_UP',
  BUNDLE_PURCHASE = 'BUNDLE_PURCHASE',
  REGISTRATION_FEE = 'REGISTRATION_FEE',
  WITHDRAWAL = 'WITHDRAWAL',
  SUBSCRIPTION_PAYMENT = 'SUBSCRIPTION_PAYMENT',
}

export interface PaymentFailurePayload {
  email: string;
  name: string;
  reference: string;
  errorReason: string;
}

export interface PaymentSuccessPayload {
  email: string;
  name: string;
  amountGhs: number;
  purpose: string;
  reference: string;
}
