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

export type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    metadata?: {
      userId?: string;
      purpose?: TransactionPurpose;
    };
    customer?: {
      email?: string;
      first_name?: string;
    };
  };
};

export interface PaystackCreateSubaccountResponse {
  status: boolean;
  message: string;
  data: {
    subaccount_code: string;
  };
}

export interface PaystackBankResolutionResponse {
  status: boolean;
  message: string;
  data: {
    account_name: string;
    account_number: string;
    bank_id: number;
    bank_name: string;
  };
}
