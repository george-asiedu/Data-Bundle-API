/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
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
import { LoginDto } from './dto/login.dto';
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

@Injectable()
export class AuthService {
  private readonly _logger = new Logger(AuthService.name);
  private readonly _secretKey: string;
  private readonly _oauthSuccessRedirect: string;
  private readonly _oauthFailureRedirect: string;

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
  ) {
    this._secretKey = this._configService.get('SECRET_KEY') as string;
    this._oauthSuccessRedirect = this._configService.get<string>(
      'OAUTH_SUCCESS_REDIRECT',
    ) as string;
    this._oauthFailureRedirect = this._configService.get<string>(
      'OAUTH_FAILURE_REDIRECT',
    ) as string;
  }

  async register(body: RegisterDto): Promise<DataMessage<unknown>> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const existingUser = await this._userRepo.find(body.email);
      if (existingUser) throw new ApplicationException('Email already exist');

      const { user, emailVerification } =
        await this._addUserAndEmailVerification(queryRunner, body);

      await this._walletRepo.add(queryRunner, { balance: 0 }, user);

      await this._emailVerificationMailer.sendMail({
        email: user.email,
        name: user.fullName ?? 'User',
        token: emailVerification.token,
      });

      await this._queryRunnerExec.commit(queryRunner);

      return {
        message:
          'Registration successful. Please check your email to verify your account.',
        data: {
          userId: user.id,
          accountStatus: user.accountStatus,
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
  ) {
    const user = await this._userRepo.add(queryRunner, {
      fullName: body.fullName,
      email: body.email,
      password: await this._hashPassword(body.password),
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

      return {
        message:
          'Email successfully verified. Please complete payment to activate your account.',
        data: {
          accountStatus: AccountStatus.PENDING_PAYMENT,
          authorizationUrl: paystackSession.data.authorization_url,
          reference: paystackSession.data.reference,
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
    const message = 'Please check your email and password';
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      // ensure any existing token attached to the user is first deleted before adding new ones
      const passwordResets = await this._passwordResetRepo.findMany(email);
      await this._passwordResetRepo.destroyMany(queryRunner, passwordResets);

      const existingUserWithEmail = await this._userRepo.find(email);

      if (!existingUserWithEmail) throw new ApplicationException(message);

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

      return { message };
    } catch (error) {
      await this._queryRunnerExec.rollback(queryRunner);

      if (error instanceof ApplicationException) return { message };

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

      return { message: 'You have successfully changed your password' };
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

  async login(body: LoginDto) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      const user = await this._userRepo.find(body.email);
      const hashedPassword = user?.password ?? '';
      const samePassword = await compare(body.password, hashedPassword);

      if (!user || !samePassword) {
        // await this._auditService.logAction(LogAction.LOGIN_FAILED, null, {
        //   metadata: { email: body.email },
        //   ipAddress: req.ip,
        //   userAgent: req.headers['user-agent'],
        // });
        throw new ApplicationException('Invalid email and or password');
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

      const mfaToken = sign(
        { sub: user.id, token: 'mfa-tk' },
        this._secretKey,
        { algorithm: 'HS256', expiresIn: '5m' },
      );

      return {
        message:
          'Credentials verified. Please enter the 6-digit code sent to your email.',
        data: {
          mfaToken: this._encryptionService.encrypt(mfaToken),
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

  async verifyMfa(body: VerifyMfaDto) {
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

      if (!mfaVerification || codeAgeInMinutes > 5) {
        throw new ApplicationException('Code is invalid or has expired');
      }

      queryRunner = await this._queryRunnerExec.getRunner();
      await this._mfaVerificationRepo.destroy(queryRunner, mfaVerification);

      await this._userRepo.update(queryRunner, user, {
        lastLoginAt: new Date(),
      });

      await this._queryRunnerExec.commit(queryRunner);

      const accessToken = this._generateAccessToken(user.id);
      const refreshToken = this._generateRefreshToken(user.id);

      // await this._auditService.logAction(LogAction.LOGIN, user.id, {
      //   ipAddress: req.ip,
      //   userAgent: req.headers['user-agent'],
      // });

      return {
        message: 'You are logged-in successfully',
        data: {
          user,
          token: {
            accessToken: this._encryptionService.encrypt(accessToken),
            refreshToken: this._encryptionService.encrypt(refreshToken),
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

  private _generateRefreshToken(id: string): string {
    return sign(
      {
        sub: id,
        token: 'ref-tk',
      },
      this._secretKey,
      {
        algorithm: 'HS256',
        expiresIn: '12h',
      },
    );
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ data: { token: string } }> {
    try {
      const decryptedRefreshToken =
        this._encryptionService.decrypt(refreshToken);
      const result = verify(decryptedRefreshToken, this._secretKey, {
        algorithms: ['HS256'],
      }) as unknown as { sub: string; token: string };

      if (!result.token || result.token !== 'ref-tk')
        throw new ApplicationException('Access denied');

      const user = await this._userRepo.find(result.sub);

      if (!user) throw new ApplicationException('Access denied');

      return {
        data: {
          token: this._encryptionService.encrypt(
            this._generateAccessToken(user.id),
          ),
        },
      };
    } catch (error) {
      if (error instanceof ApplicationException)
        throw new UnauthorizedException(error.message);

      this._logger.error((error as Error).message);

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async handleOAuthLogin(profile: OAuthProfile, req: Request, res: Response) {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      const { user, isNew } = await this._userRepo.findOrCreateOAuthUser(
        queryRunner,
        profile,
      );

      await this._userRepo.update(queryRunner, user, {
        lastLoginAt: new Date(),
      });
      await this._queryRunnerExec.commit(queryRunner);

      // await this._auditService.logAction(LogAction.LOGIN, user.id, {
      //   metadata: { provider: profile.provider, isNewUser: isNew },
      //   ipAddress: req.ip,
      //   userAgent: req.headers['user-agent'],
      // });

      const accessToken = this._generateAccessToken(user.id);
      const refreshToken = this._generateRefreshToken(user.id);
      const encryptedAccess = this._encryptionService.encrypt(accessToken);
      const encryptedRefresh = this._encryptionService.encrypt(refreshToken);

      const frontendUrl = req.cookies['oauth_redirect'];
      res.clearCookie('oauth_redirect');

      const successPath = this._oauthSuccessRedirect;
      const redirectUrl = `${frontendUrl}${successPath}?access_token=${encodeURIComponent(encryptedAccess)}&refresh_token=${encodeURIComponent(encryptedRefresh)}&is_new=${isNew}`;

      return res.redirect(redirectUrl);
    } catch (error: unknown) {
      await this._queryRunnerExec.rollback(queryRunner);

      this._logger.error(
        `OAuth login failed for ${profile.provider}: ${(error as Error).message}`,
      );

      const frontendUrl = req.cookies['oauth_redirect'];
      const failurePath = this._oauthFailureRedirect;
      return res.redirect(`${frontendUrl}${failurePath}`);
    }
  }
}
