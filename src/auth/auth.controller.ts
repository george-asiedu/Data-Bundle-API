import {
  BadRequestException,
  Body,
  Headers,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import {
  swaggerRegisterResponse,
  swaggerCheckEmailResponse,
  swaggerVerifyEmailResponse,
  swaggerRequestPasswordReset,
  swaggerResetPasswordResponse,
  swaggerVerifyTokenResponse,
  swaggerLoginResponse,
  swaggerGetAuthenticatedUserResponse,
  swaggerRefreshAccessTokenResponse,
  swaggerVerifyMfaResponse,
  swaggerResendVerificationEmailResponse,
} from './auth.swagger';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailDto } from './dto/email.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginDto, LoginWithCodeDto } from './dto/login.dto';
import { AuthGuard } from './guards/auth.guard';
import { CookieOptions, Request, Response } from 'express';
import { OAuthProfile } from './auth.types';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12h, matches token TTL

@Controller('auth')
export class AuthController {
  // The refresh token is the only long-lived credential, so it lives in an
  // httpOnly cookie scoped to the auth routes (refresh + logout) and never
  // reaches JavaScript. Cross-site delivery (SPA and API on different domains)
  // requires SameSite=None + Secure — but Secure cookies are dropped over plain
  // HTTP, so for local development we fall back to a Lax, non-Secure cookie.
  private readonly _isProd: boolean;
  private readonly _refreshCookieOptions: CookieOptions;

  constructor(
    private readonly _authService: AuthService,
    private readonly _configService: ConfigService,
  ) {
    this._isProd = this._configService.get<string>('NODE_ENV') === 'production';
    this._refreshCookieOptions = {
      httpOnly: true,
      secure: this._isProd,
      sameSite: this._isProd ? 'none' : 'lax',
      path: '/api/auth',
    };
  }

  private _setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      ...this._refreshCookieOptions,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }

  private _clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this._refreshCookieOptions);
  }

  /**
   * Moves the refresh token out of a session response body and into the
   * httpOnly cookie, so it is never exposed to the SPA.
   */
  private _issueRefreshCookie(
    res: Response,
    payload: { data?: { token?: { refreshToken?: string } } },
  ): void {
    const token = payload.data?.token?.refreshToken;
    if (token) {
      this._setRefreshCookie(res, token);
      delete payload.data!.token!.refreshToken;
    }
  }

  /**
   * ensures a user can create an account
   * @param {RegisterDto} body
   * @returns
   */
  @ApiOperation(swaggerRegisterResponse)
  @HttpCode(HttpStatus.OK)
  @Post('register')
  register(@Body(ValidationPipe) body: RegisterDto) {
    if (body.password !== body.confirmPassword)
      throw new BadRequestException('Passwords do not match each other');

    return this._authService.register(body);
  }

  /**
   * verifies the email by ensuring the token is valid
   * @param {VerifyEmailDto} body
   * @returns
   */
  @ApiOperation(swaggerVerifyEmailResponse)
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(
    @Body(ValidationPipe) body: VerifyEmailDto,
    @Headers('origin') origin: string,
  ) {
    const clientOrigin = origin;
    if (!clientOrigin) {
      throw new BadRequestException(
        'Origin header or frontend URL must be provided',
      );
    }
    return this._authService.verifyEmail(body, clientOrigin);
  }

  /**
   * resend the email verification link if the user did not receive the first email or the token has expired
   * @param {VerifyEmailDto} body
   * @returns
   */
  @ApiOperation(swaggerResendVerificationEmailResponse)
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  resendVerification(@Body(ValidationPipe) body: EmailDto) {
    return this._authService.resendVerificationEmail(body);
  }

  /**
   * checks email to ensure no duplicates emails are allowed
   * @param {EmailDto} body
   * @returns
   */
  @ApiOperation(swaggerCheckEmailResponse)
  @HttpCode(HttpStatus.OK)
  @Post('check-email')
  checkEmail(@Body(ValidationPipe) body: EmailDto) {
    return this._authService.checkEmail(body.email);
  }

  /**
   * allows a user to request for password change
   * @param {EmailDto} body
   * @returns
   */
  @ApiOperation(swaggerRequestPasswordReset)
  @HttpCode(HttpStatus.OK)
  @Post('request-password-reset')
  requestPasswordReset(
    @Body(ValidationPipe) body: EmailDto,
    @Headers('origin') origin: string,
  ) {
    const clientOrigin = origin;
    if (!clientOrigin) {
      throw new BadRequestException(
        'Origin header or frontend URL must be provided',
      );
    }

    return this._authService.requestPasswordReset(body.email, clientOrigin);
  }

  /**
   * this endpoint allows a user to a reset password
   * @param {EmailDto} body
   * @param token
   * @returns
   */
  @ApiOperation(swaggerResetPasswordResponse)
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(
    @Body(ValidationPipe) body: ResetPasswordDto,
    @Query('token') token: string,
  ) {
    if (!token) throw new BadRequestException('Access denied');

    if (body.newPassword !== body.confirmPassword)
      throw new BadRequestException('Passwords do not match each other');

    return this._authService.resetPassword(body, token);
  }

  /**
   * verify the provided token after requesting for a password change
   * @returns
   * @param token
   */
  @ApiOperation(swaggerVerifyTokenResponse)
  @Get('verify-token')
  verifyToken(@Query('token') token: string) {
    return this._authService.verifyToken(token);
  }

  /**
   * allows for user login
   * @param {EmailDto} body
   * @param req
   * @returns
   */
  @ApiOperation(swaggerLoginResponse)
  @UseInterceptors(ClassSerializerInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body(ValidationPipe) body: LoginDto, @Req() req: Request) {
    return this._authService.login(body, req);
  }

  /**
   * allows for user login via backup code
   * @param {EmailDto} body
   * @param req
   * @returns
   */
  @ApiOperation(swaggerLoginResponse)
  @UseInterceptors(ClassSerializerInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('login-with-backup-code')
  async loginWithBackupCode(
    @Body(ValidationPipe) body: LoginWithCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this._authService.loginWithBackupCode(body, req);
    this._issueRefreshCookie(res, result);
    return result;
  }

  /**
   * Verify the 6-digit MFA code sent to email
   * @param body
   * @returns
   */
  @ApiOperation(swaggerVerifyMfaResponse)
  @UseInterceptors(ClassSerializerInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('verify-mfa')
  async verifyMfa(
    @Body(ValidationPipe) body: VerifyMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.mfaToken || !body.code) {
      throw new BadRequestException('Token and code are required');
    }
    const result = await this._authService.verifyMfa(body, req);
    this._issueRefreshCookie(res, result);
    return result;
  }

  /**
   * resend the email otp code if the user did not receive the first email or code is expired
   * @param {VerifyEmailDto} body
   * @returns
   */
  @ApiOperation(swaggerResendVerificationEmailResponse)
  @HttpCode(HttpStatus.OK)
  @Post('resend-mfa-code')
  resendMfaCode(@Body(ValidationPipe) body: EmailDto) {
    return this._authService.resendMfaCode(body.email);
  }

  /**
   * allows for Google OAuth login
   * @returns
   */
  @ApiOperation({
    summary: 'Initiate Google OAuth login',
    description:
      'Redirects the user to the Google consent screen for authentication.',
  })
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  googleAuth() {}

  /**
   * redirect user to Google consent screen
   * @param req
   * @param res
   * @returns
   */
  @ApiOperation({
    summary: 'Handle Google OAuth callback',
    description:
      'Handles the callback from Google after user authentication and redirects accordingly.',
  })
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as OAuthProfile;
    return await this._authService.handleOAuthLogin(profile, res);
  }

  /**
   * Exchanges the single-use OAuth code from the callback redirect for the
   * session tokens. Keeps tokens out of the redirect URL.
   */
  @ApiOperation({
    summary: 'Exchange a one-time OAuth code for session tokens',
    description:
      'The SPA posts the `code` returned on the OAuth callback redirect and receives the user profile and tokens in the response body.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('oauth/exchange')
  async exchangeOAuthCode(
    @Body(ValidationPipe) body: OAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this._authService.exchangeOAuthCode(body.code);
    this._issueRefreshCookie(res, result);
    return result;
  }

  /**
   * gets the authenticated user based on the access token
   * @returns
   * @param req
   */
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation(swaggerGetAuthenticatedUserResponse)
  @Get('user')
  getAuthenticatedUser(@Req() req: Request) {
    return {
      data: req.user,
    };
  }

  /**
   * refreshes an access token when the previous one is invalid
   * @returns
   * @param req
   */
  @ApiOperation(swaggerRefreshAccessTokenResponse)
  @Get('refresh-token')
  async refreshAccessToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];

    if (!refreshToken) throw new UnauthorizedException('Access denied');

    const result = await this._authService.refreshAccessToken(refreshToken);

    // Rotation: replace the cookie with the freshly minted refresh token and
    // keep only the new access token in the body.
    this._setRefreshCookie(res, result.data.refreshToken);
    return { data: { token: result.data.token } };
  }

  /**
   * Revokes the refresh-token family and clears the cookie.
   */
  @ApiOperation({ summary: 'Log out and revoke the current session' })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
    this._clearRefreshCookie(res);
    return this._authService.logout(refreshToken);
  }
}
