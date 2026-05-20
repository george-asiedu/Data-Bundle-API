import { Data } from '../lib/mailer/types.mailer';
import { RegisterDto } from './dto/register.dto';

export enum Role {
  AGENT = 'AGENT',
  SUB_AGENT = 'SUB_AGENT',
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
}

export type OAuthProfile = {
  providerId: string;
  email: string;
  fullName: string;
  imageUrl?: string;
  provider: AuthProvider;
};

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

export type CreateUserType = {
  provider?: AuthProvider;
  providerId?: string;
  role?: Role;
  fullName?: string;
} & Partial<Pick<RegisterDto, 'password'>> &
  Omit<RegisterDto, 'confirmPassword' | 'password'>;

export type VerificationType = {
  token: string;
} & Data;

export type ConfirmationType = {
  frontendUrl: string;
} & Data;

export type RequestEmailResetType = VerificationType &
  Pick<ConfirmationType, 'frontendUrl'>;
