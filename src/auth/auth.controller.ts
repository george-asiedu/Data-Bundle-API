import {
  BadRequestException,
  Body,
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
} from './auth.swagger';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailDto } from './dto/email.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from './guards/auth.guard';
import { Request, Response } from 'express';
import { OAuthProfile } from './auth.types';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly _authService: AuthService) {}

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
  verifyEmail(@Body(ValidationPipe) body: VerifyEmailDto) {
    return this._authService.verifyEmail(body);
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
  requestPasswordReset(@Body(ValidationPipe) body: EmailDto) {
    return this._authService.requestPasswordReset(body.email);
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
    const { redirectUrl } = await this._authService.handleOAuthLogin(
      profile,
      req,
    );
    return res.redirect(redirectUrl);
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
  refreshAccessToken(@Req() req: Request) {
    const refreshToken = req.headers['ref-tk'] as string;

    if (!refreshToken) throw new UnauthorizedException('Access denied');

    return this._authService.refreshAccessToken(refreshToken);
  }
}
