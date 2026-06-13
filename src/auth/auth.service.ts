import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryRunner } from 'typeorm';
import { compare, genSalt, hash } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';

import { UserRepository } from './repositories/user.repository';
import { RegisterDto } from './dto/register.dto';
import { AccountStatus, OAuthProfile } from './auth.types';
import { EmailVerificationMailer } from './mailer/email-verification.mailer';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestEmailResetMailer } from './mailer/request-email-reset.mailer';
import { PasswordResetRepository } from './repositories/password-reset.repository';
import { EncryptionService } from './encryption.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfirmationMailer } from './mailer/confirmation.mailer';
import { ResetPasswordMailer } from './mailer/reset-password.mailer';
import { LoginDto, LoginWithCodeDto } from './dto/login.dto';
import { Request, Response } from 'express';
import { ApplicationException } from '../lib/exception/app.exception';
import { DataMessage, MessageOnly } from '../lib/utils/types.utils';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { TokenGenerator } from '../shared/services/token-generator.service';
import { PaymentService } from '../payment/payment.service';
import { WalletRepository } from '../payment/repositories/wallet.repository';
import { MfaMailer } from './mailer/mfa.mailer';
import { MfaVerificationRepository } from './repositories/mfa-verification.repository';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { EmailDto } from './dto/email.dto';
import { LogAction } from '../audit/log-action.types';
import { AuditService } from '../audit/audit.service';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { OAuthExchangeCodeRepository } from './repositories/oauth-exchange-code.repository';
import * as crypto from 'node:crypto';

@Injectable()
export class AuthService {
  // Refresh tokens live for 12h; OAuth exchange codes are single-use and expire
  // in 2 minutes — just long enough for the SPA to complete the redirect.
  private static readonly REFRESH_TTL_MS = 12 * 60 * 60 * 1000;
  private static readonly OAUTH_CODE_TTL_MS = 2 * 60 * 1000;

  private readonly _logger = new Logger(AuthService.name);
  private readonly _secretKey: string;
  private readonly _oauthSuccessRedirect: string;
  private readonly _oauthFailureRedirect: string;
  private readonly _frontendUrl: string;

  constructor(
    private readonly _userRepo: UserRepository,
    private readonly _configService: ConfigService,
    private readonly _tokenGenerator: TokenGenerator,
    private readonly _queryRunnerExec: QueryRunnerExec,
    private readonly _encryptionService: EncryptionService,
    private readonly _confirmationMailer: ConfirmationMailer,
    private readonly _resetPasswordMailer: ResetPasswordMailer,
    private readonly _passwordResetRepo: PasswordResetRepository,
    private readonly _emailVerificationMailer: EmailVerificationMailer,
    private readonly _requestEmailResetMailer: RequestEmailResetMailer,
    private readonly _emailVerificationRepo: EmailVerificationRepository,
    private readonly _paymentService: PaymentService,
    private readonly _walletRepo: WalletRepository,
    private readonly _mfaMailer: MfaMailer,
    private readonly _mfaVerificationRepo: MfaVerificationRepository,
    private readonly _auditService: AuditService,
    private readonly _refreshTokenRepo: RefreshTokenRepository,
    private readonly _oauthCodeRepo: OAuthExchangeCodeRepository,
  ) {
    this._secretKey = this._configService.get('SECRET_KEY') as string;
    this._oauthSuccessRedirect = this._configService.get<string>(
      'OAUTH_SUCCESS_REDIRECT',
    ) as string;
    this._oauthFailureRedirect = this._configService.get<string>(
      'OAUTH_FAILURE_REDIRECT',
    ) as string;
    this._frontendUrl = this._configService.get<string>(
      'FRONTEND_LOCAL_URL',
    ) as string;
  }

  async register(body: RegisterDto): Promise<DataMessage<unknown>> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const existingUser = await this._userRepo.find(body.email);
      if (existingUser) throw new ApplicationException('Email already exist');

      const rawBackupCode = this._generateBackupCode();
      const hashedBackupCode = await this._hashPassword(rawBackupCode);

      const { user, emailVerification } =
        await this._addUserAndEmailVerification(
          queryRunner,
          body,
          hashedBackupCode,
        );

      await this._walletRepo.add(queryRunner, { balance: 0 }, user);

      await this._emailVerificationMailer.sendMail({
        email: user.email,
        name: user.fullName ?? 'User',
        token: emailVerification.token,
      });

      await this._queryRunnerExec.commit(queryRunner);

      this._audit(LogAction.REGISTER, user.id, {
        metadata: { email: user.email },
      });

      return {
        message:
          'Registration successful. Please check your email to verify your account.',
        data: {
          userId: user.id,
          accountStatus: user.accountStatus,
          backupCode: rawBackupCode,
        },
      };
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  private async _addUserAndEmailVerification(
    queryRunner: QueryRunner,
    body: RegisterDto,
    hashedBackupCode: string,
  ) {
    const user = await this._userRepo.add(queryRunner, {
      fullName: body.fullName,
      email: body.email,
      password: await this._hashPassword(body.password),
      backupCode: hashedBackupCode,
    });

    const emailVerification = await this._emailVerificationRepo.add(
      queryRunner,
      {
        email: user.email,
        token: this._tokenGenerator.generate(12),
      },
    );

    return { user, emailVerification };
  }

  private async _hashPassword(password: string): Promise<string> {
    const saltRound = 12;
    const salt = await genSalt(saltRound);
    return await hash(password, salt);
  }

  /**
   * Generates a single-use MFA backup code with ~80 bits of cryptographic
   * entropy, grouped for readability (e.g. IDM-3F9A-...-...). The raw value is
   * shown to the user once; only its bcrypt hash is ever stored.
   */
  private _generateBackupCode(): string {
    const hex = crypto.randomBytes(10).toString('hex').toUpperCase();
    const groups = hex.match(/.{1,4}/g) ?? [hex];
    return `IDM-${groups.join('-')}`;
  }

  async verifyEmail(
    body: VerifyEmailDto,
    clientOrigin: string,
  ): Promise<DataMessage<unknown>> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const existingUser = await this._userRepo.find(body.email);
      const verification = await this._emailVerificationRepo.find(
        body.email,
        body.token,
      );

      if (
        !verification ||
        !existingUser ||
        (existingUser && existingUser.accountStatus === AccountStatus.ACTIVE)
      ) {
        throw new ApplicationException('Token is invalid');
      }

      await this._emailVerificationRepo.destroy(queryRunner, verification);

      await this._userRepo.update(queryRunner, existingUser, {
        accountStatus: AccountStatus.PENDING_PAYMENT,
      });

      const registrationFeeGhs = 1;
      const paystackSession =
        await this._paymentService.initializeTransactionForRegistration(
          {
            email: existingUser.email,
            amount: registrationFeeGhs,
          },
          existingUser.id,
        );

      await this._confirmationMailer.sendMail({
        email: existingUser.email,
        name: existingUser.fullName ?? 'User',
        frontendUrl: clientOrigin,
      });

      await this._queryRunnerExec.commit(queryRunner);

      this._audit(LogAction.EMAIL_VERIFIED, existingUser.id, {
        metadata: { email: existingUser.email },
      });

      return {
        message:
          'Email successfully verified. Please complete payment to activate your account.',
        data: {
          accountStatus: AccountStatus.PENDING_PAYMENT,
          authorizationUrl: paystackSession.data.authorization_url,
          accessCode: paystackSession.data.access_code,
          reference: paystackSession.data.reference,
        },
      };
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error(
        `Verification Crash Trace: ${(error as Error).stack || (error as Error).message}`,
      );
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async resendVerificationEmail(body: EmailDto): Promise<MessageOnly> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const existingUser = await this._userRepo.find(body.email);
      if (!existingUser) {
        throw new ApplicationException(
          'No account found associated with this email address.',
        );
      }

      if (existingUser.accountStatus === AccountStatus.ACTIVE) {
        throw new ApplicationException(
          'This account has already been verified successfully.',
        );
      }

      const existingVerification =
        await this._emailVerificationRepo.findByEmail(body.email);

      if (existingVerification) {
        await this._emailVerificationRepo.destroy(
          queryRunner,
          existingVerification,
        );
      }

      const newVerification = await this._emailVerificationRepo.add(
        queryRunner,
        {
          email: existingUser.email,
          token: this._tokenGenerator.generate(12),
        },
      );

      await this._emailVerificationMailer.sendMail({
        email: existingUser.email,
        name: existingUser.fullName ?? 'User',
        token: newVerification.token,
      });

      await this._queryRunnerExec.commit(queryRunner);

      return {
        message:
          'A new verification email has been sent. Please check your inbox.',
      };
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error(
        `Resend Verification System Failure: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'System failed to process token transmission.',
      );
    }
  }

  async checkEmail(email: string): Promise<MessageOnly> {
    try {
      const existingUserWithEmail = await this._userRepo.find(email);

      if (existingUserWithEmail)
        throw new ApplicationException('Email already taken');

      return { message: 'Email can be used' };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async requestPasswordReset(
    email: string,
    clientOrigin: string,
  ): Promise<MessageOnly> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const passwordResets = await this._passwordResetRepo.findMany(email);
      await this._passwordResetRepo.destroyMany(queryRunner, passwordResets);

      const existingUserWithEmail = await this._userRepo.find(email);

      if (!existingUserWithEmail)
        throw new ApplicationException(
          'No account found associated with this email address.',
        );

      const token = sign(
        { sub: existingUserWithEmail.id },
        this._configService.get('SECRET_KEY') as string,
        { expiresIn: '30m', algorithm: 'HS256' },
      );
      const encryptedToken = this._encryptionService.encrypt(token);

      await this._passwordResetRepo.add(queryRunner, {
        email: existingUserWithEmail.email,
        token: token,
      });

      await this._requestEmailResetMailer.sendMail({
        email,
        name: existingUserWithEmail.fullName ?? 'User',
        token: encryptedToken,
        frontendUrl: clientOrigin,
      });

      await this._queryRunnerExec.commit(queryRunner);

      this._audit(
        LogAction.PASSWORD_RESET_REQUESTED,
        existingUserWithEmail.id,
        {
          metadata: { email: existingUserWithEmail.email },
        },
      );

      return {
        message: 'Password reset instructions have been sent to your email.',
      };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        return { message: error.message };

      this._logger.error((error as Error).message);

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async resetPassword(
    body: ResetPasswordDto,
    token: string,
  ): Promise<MessageOnly> {
    let queryRunner: QueryRunner | undefined = undefined;
    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const decryptedToken = this._encryptionService.decrypt(token);
      const result = verify(decryptedToken, this._secretKey) as unknown as {
        sub: string;
      };

      const existingUserWithEmail = await this._userRepo.find(result.sub);

      if (!existingUserWithEmail)
        throw new ApplicationException('Access denied');

      const existingPasswordReset = await this._passwordResetRepo.find(
        existingUserWithEmail.email,
      );

      if (
        !existingPasswordReset ||
        (existingPasswordReset &&
          existingPasswordReset.email !== existingUserWithEmail.email)
      )
        throw new ApplicationException('Access denied');

      await this._passwordResetRepo.destroy(queryRunner, existingPasswordReset);
      await this._userRepo.update(queryRunner, existingUserWithEmail, {
        password: await this._hashPassword(body.newPassword),
      });

      await this._resetPasswordMailer.sendMail({
        email: existingUserWithEmail.email,
        name: existingUserWithEmail.fullName ?? 'User',
      });

      await this._queryRunnerExec.commit(queryRunner);

      this._audit(LogAction.PASSWORD_RESET, existingUserWithEmail.id, {
        metadata: { email: existingUserWithEmail.email },
      });

      return {
        message:
          'Your password has been reset successfully. Please login with your new password.',
      };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  verifyToken(token: string) {
    try {
      const decryptedToken = this._encryptionService.decrypt(token);
      verify(
        decryptedToken,
        this._configService.get('SECRET_KEY') as string,
      ) as unknown as { sub: string };

      return { message: 'Valid token' };
    } catch {
      throw new BadRequestException('Invalid token');
    }
  }

  async login(body: LoginDto, req: Request) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      const user = await this._userRepo.find(body.email);
      const hashedPassword = user?.password ?? '';
      const samePassword = await compare(body.password, hashedPassword);

      if (!user || !samePassword) {
        this._audit(LogAction.LOGIN_FAILED, user?.id ?? null, {
          req,
          metadata: { email: body.email },
        });
        throw new ApplicationException('Invalid email or password');
      }

      if (user.accountStatus === AccountStatus.PENDING_PAYMENT) {
        const registrationFeeGhs = 1;
        const paystackSession =
          await this._paymentService.initializeTransactionForRegistration(
            {
              email: user.email,
              amount: registrationFeeGhs,
            },
            user.id,
          );

        throw new BadRequestException({
          message: 'Your registration payment is incomplete.',
          accountStatus: user.accountStatus,
          authorizationUrl: paystackSession.data.authorization_url,
          accessCode: paystackSession.data.access_code,
          reference: paystackSession.data.reference,
        });
      }

      queryRunner = await this._queryRunnerExec.getRunner();

      const existingMfaCodes = await this._mfaVerificationRepo.findMany(
        user.email,
      );
      await this._mfaVerificationRepo.destroyMany(
        queryRunner,
        existingMfaCodes,
      );

      const mfaCode = Math.floor(100000 + Math.random() * 900000).toString();
      await this._mfaVerificationRepo.add(queryRunner, {
        email: user.email,
        code: mfaCode,
      });

      await this._mfaMailer.sendMail({
        email: user.email,
        name: user.fullName ?? 'User',
        token: mfaCode,
      });

      await this._queryRunnerExec.commit(queryRunner);

      this._audit(LogAction.LOGIN_INITIATED, user.id, {
        req,
        metadata: { email: user.email },
      });

      const mfaToken = sign(
        { sub: user.id, token: 'mfa-tk' },
        this._secretKey,
        { algorithm: 'HS256', expiresIn: '15m' },
      );

      return {
        message:
          'Credentials verified. Please enter the 6-digit code sent to your email.',
        data: {
          mfaToken: this._encryptionService.encrypt(mfaToken),
          email: user.email,
        },
      };
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      if (error instanceof HttpException) throw error;

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async resendMfaCode(email: string) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const user = await this._userRepo.find(email);
      if (!user) throw new ApplicationException('User account not found');

      const existingMfaCodes = await this._mfaVerificationRepo.findMany(email);
      await this._mfaVerificationRepo.destroyMany(
        queryRunner,
        existingMfaCodes,
      );

      const mfaCode = Math.floor(100000 + Math.random() * 900000).toString();
      await this._mfaVerificationRepo.add(queryRunner, {
        email,
        code: mfaCode,
      });

      await this._mfaMailer.sendMail({
        email,
        name: user.fullName ?? 'User',
        token: mfaCode,
      });

      await this._queryRunnerExec.commit(queryRunner);

      return {
        message: 'A new MFA code has been sent to your email.',
      };
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async verifyMfa(body: VerifyMfaDto, req: Request) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      const decryptedToken = this._encryptionService.decrypt(body.mfaToken);
      const result = verify(decryptedToken, this._secretKey) as unknown as {
        sub: string;
        token: string;
      };

      if (result.token !== 'mfa-tk') {
        throw new ApplicationException('Invalid MFA session');
      }

      const user = await this._userRepo.find(result.sub);
      if (!user) throw new ApplicationException('User not found');

      const mfaVerification = await this._mfaVerificationRepo.find(
        user.email,
        body.code,
      );

      const now = new Date();
      const codeAgeInMinutes = mfaVerification
        ? (now.getTime() - new Date(mfaVerification.createdAt).getTime()) /
          60000
        : Infinity;

      if (!mfaVerification || codeAgeInMinutes > 15) {
        throw new ApplicationException('Code is invalid or has expired');
      }

      queryRunner = await this._queryRunnerExec.getRunner();
      await this._mfaVerificationRepo.destroy(queryRunner, mfaVerification);

      await this._userRepo.update(queryRunner, user, {
        lastLoginAt: new Date(),
      });

      await this._queryRunnerExec.commit(queryRunner);

      const session = await this._issueSession(user.id);

      this._audit(LogAction.LOGIN, user.id, {
        req,
        metadata: { method: 'mfa' },
      });

      return {
        message: 'You are logged-in successfully',
        data: {
          user,
          token: {
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          },
        },
      };
    } catch (error) {
      if (queryRunner) await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException)
        throw new BadRequestException(error.message);

      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Verification failed');
    }
  }

  async loginWithBackupCode(body: LoginWithCodeDto, req: Request) {
    const queryRunner = await this._queryRunnerExec.getRunner();

    try {
      const user = await this._userRepo.find(body.email);
      const validBackupCode = await compare(
        body.backupCode,
        user?.backupCode ?? '',
      );
      if (!user || !validBackupCode) {
        this._audit(LogAction.LOGIN_FAILED, user?.id ?? null, {
          req,
          metadata: { email: body.email, method: 'backup_code' },
        });
        throw new UnauthorizedException('Invalid email or backup code.');
      }

      // Rotate the backup code: a code is single-use, so issue a fresh one and
      // store its hash. The new raw code is returned once for the user to save.
      const newRawBackupCode = this._generateBackupCode();
      await this._userRepo.update(queryRunner, user, {
        backupCode: await this._hashPassword(newRawBackupCode),
      });
      await this._queryRunnerExec.commit(queryRunner);

      const session = await this._issueSession(user.id);

      this._audit(LogAction.LOGIN, user.id, {
        req,
        metadata: { method: 'backup_code' },
      });

      return {
        message:
          'You are logged-in successfully. Save your new backup code — it replaces the one you just used.',
        data: {
          user,
          backupCode: newRawBackupCode,
          token: {
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          },
        },
      };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);
      this._logger.error(
        `Backup code login failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private _generateAccessToken(id: string): string {
    return sign(
      {
        sub: id,
        token: 'acc-tk',
      },
      this._secretKey,
      {
        algorithm: 'HS256',
        expiresIn: '15m',
      },
    );
  }

  private _sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Records an auth event against the acting user. Auth routes are
   * unauthenticated (no req.user), so we log the user here where the identity is
   * known. Fire-and-forget — auditing must never block or fail the request.
   */
  private _audit(
    action: LogAction,
    userId: string | null,
    opts?: { req?: Request; metadata?: Record<string, unknown> },
  ): void {
    void this._auditService.logAction(action, userId, {
      resourceType: userId ? 'user' : null,
      resourceId: userId,
      ipAddress: opts?.req?.ip ?? null,
      userAgent: opts?.req?.headers['user-agent'] ?? null,
      metadata: opts?.metadata ?? null,
    });
  }

  /**
   * Mints an access token plus a persisted, rotatable refresh token. The raw
   * refresh secret is opaque and high-entropy; only its hash is stored, and
   * both tokens are returned encrypted for transport, preserving the existing
   * client contract.
   */
  private async _issueSession(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshTokenHash: string;
  }> {
    const rawRefresh = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = this._sha256(rawRefresh);

    await this._refreshTokenRepo.create({
      userId,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + AuthService.REFRESH_TTL_MS),
    });

    return {
      accessToken: this._encryptionService.encrypt(
        this._generateAccessToken(userId),
      ),
      refreshToken: this._encryptionService.encrypt(rawRefresh),
      refreshTokenHash,
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ data: { token: string; refreshToken: string } }> {
    let rawToken: string;
    try {
      rawToken = this._encryptionService.decrypt(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this._refreshTokenRepo.findByHash(
      this._sha256(rawToken),
    );

    if (!stored)
      throw new UnauthorizedException('Invalid or expired refresh token');

    // Reuse detection: presenting an already-revoked token means it was
    // captured. Burn the whole family so neither holder can continue.
    if (stored.revokedAt) {
      await this._refreshTokenRepo.revokeAllForUser(stored.userId);
      this._logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; all sessions revoked`,
      );
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Invalid or expired refresh token');

    const user = await this._userRepo.find(stored.userId);
    if (!user)
      throw new UnauthorizedException('Invalid or expired refresh token');

    // Rotate: issue a fresh pair, then revoke the token just used.
    const session = await this._issueSession(user.id);
    stored.revokedAt = new Date();
    stored.replacedByHash = session.refreshTokenHash;
    await this._refreshTokenRepo.save(stored);

    return {
      data: { token: session.accessToken, refreshToken: session.refreshToken },
    };
  }

  /**
   * Revokes the caller's refresh-token family so the session cannot be resumed.
   * Best-effort: a missing or malformed token is treated as already logged out.
   */
  async logout(encryptedRefreshToken?: string): Promise<MessageOnly> {
    if (encryptedRefreshToken) {
      try {
        const rawToken = this._encryptionService.decrypt(encryptedRefreshToken);
        const stored = await this._refreshTokenRepo.findByHash(
          this._sha256(rawToken),
        );
        if (stored) {
          await this._refreshTokenRepo.revokeAllForUser(stored.userId);
          this._audit(LogAction.LOGOUT, stored.userId);
        }
      } catch {
        // Ignore — logging out with an unreadable token is still a logout.
      }
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Exchanges the single-use OAuth code (delivered via the callback redirect)
   * for the real session tokens, returned in the response body.
   */
  async exchangeOAuthCode(rawCode: string) {
    const stored = await this._oauthCodeRepo.findByHash(this._sha256(rawCode));

    if (!stored || stored.consumedAt || stored.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Invalid or expired authorization code');

    stored.consumedAt = new Date();
    await this._oauthCodeRepo.save(stored);

    const user = await this._userRepo.find(stored.userId);
    if (!user)
      throw new UnauthorizedException('Invalid or expired authorization code');

    const session = await this._issueSession(user.id);

    this._audit(LogAction.LOGIN, user.id, {
      metadata: { provider: 'google', isNewUser: stored.isNew },
    });

    return {
      message: 'Successfully authenticated via Google',
      data: {
        user,
        isNew: stored.isNew,
        token: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        },
      },
    };
  }

  async handleOAuthLogin(profile: OAuthProfile, res: Response) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const { user, isNew } = await this._userRepo.findOrCreateOAuthUser(
        queryRunner,
        profile,
      );

      if (isNew) {
        await this._walletRepo.add(queryRunner, { balance: 0 }, user);
      }

      await this._userRepo.update(queryRunner, user, {
        lastLoginAt: new Date(),
      });

      if (user.accountStatus === AccountStatus.PENDING_PAYMENT) {
        const registrationFeeGhs = 1;
        const paystackSession =
          await this._paymentService.initializeTransactionForRegistration(
            { email: user.email, amount: registrationFeeGhs },
            user.id,
          );

        await this._queryRunnerExec.commit(queryRunner);

        const frontendBaseUrl =
          this._frontendUrl ||
          this._configService.get<string>('FRONTEND_SERVER_URL');
        const paymentUrl = new URL('/complete-registration', frontendBaseUrl);

        paymentUrl.searchParams.append(
          'access_code',
          paystackSession.data.access_code,
        );
        paymentUrl.searchParams.append(
          'authorization_url',
          paystackSession.data.authorization_url,
        );
        paymentUrl.searchParams.append(
          'reference',
          paystackSession.data.reference,
        );
        paymentUrl.searchParams.append('email', user.email);

        return res.redirect(paymentUrl.toString());
      }

      await this._queryRunnerExec.commit(queryRunner);

      // Hand the SPA a single-use code instead of the tokens themselves. The
      // tokens are minted only when the SPA exchanges this code over a POST,
      // so they never touch the redirect URL, browser history or access logs.
      const rawCode = crypto.randomBytes(32).toString('hex');
      await this._oauthCodeRepo.create({
        codeHash: this._sha256(rawCode),
        userId: user.id,
        isNew,
        expiresAt: new Date(Date.now() + AuthService.OAUTH_CODE_TTL_MS),
      });

      const frontendUrl =
        this._frontendUrl ||
        this._configService.get<string>('FRONTEND_SERVER_URL');
      const redirectUrl = new URL(this._oauthSuccessRedirect, frontendUrl);

      redirectUrl.searchParams.append('code', rawCode);

      return res.redirect(redirectUrl.toString());
    } catch (error: unknown) {
      await this._queryRunnerExec.rollback(queryRunner);

      this._logger.error(
        `OAuth login failed for ${profile.provider}: ${(error as Error).message}`,
      );

      const frontendUrl =
        this._frontendUrl ||
        this._configService.get<string>('FRONTEND_SERVER_URL');
      const failurePath = new URL(this._oauthFailureRedirect, frontendUrl);
      return res.redirect(failurePath.toString());
    }
  }
}
