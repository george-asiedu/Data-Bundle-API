export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum TransactionPurpose {
  TOP_UP = 'TOP_UP',
  BUNDLE_PURCHASE = 'BUNDLE_PURCHASE',
  REGISTRATION_FEE = 'REGISTRATION_FEE',
  WITHDRAWAL = 'WITHDRAWAL',
  WITHDRAWAL_REVERSAL = 'WITHDRAWAL_REVERSAL',
  SUBSCRIPTION_PAYMENT = 'SUBSCRIPTION_PAYMENT',
}

/**
 * Lifecycle of an agent withdrawal request.
 * PENDING   — funds held on the wallet, awaiting admin review.
 * APPROVED  — admin approved; a Paystack transfer has been initiated.
 * PROCESSING— transfer accepted by Paystack, awaiting final settlement webhook.
 * PAID      — transfer settled successfully (terminal).
 * REJECTED  — admin declined; held funds refunded to the wallet (terminal).
 * FAILED    — transfer failed/reversed at the gateway; funds refunded (terminal).
 */
export enum WithdrawalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
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

export interface PaystackTransferRecipientResponse {
  status: boolean;
  message: string;
  data: {
    recipient_code: string;
    active: boolean;
  };
}

export interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: {
    transfer_code: string;
    reference: string;
    // 'success' | 'pending' | 'otp' | 'failed' | 'reversed' ...
    status: string;
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
