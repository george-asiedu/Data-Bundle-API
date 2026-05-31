export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export interface GracePeriodPayload {
  email: string;
  name: string;
  amountDueGhs: number;
}

export interface RenewedSubscriptionPayload {
  email: string;
  name: string;
}
