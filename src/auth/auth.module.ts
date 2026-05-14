import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EncryptionService } from './encryption.service';
import { UserRepository } from './repositories/user.repository';
import { ConfirmationMailer } from './mailer/confirmation.mailer';
import { EmailVerificationMailer } from './mailer/email-verification.mailer';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { RequestEmailResetMailer } from './mailer/request-email-reset.mailer';
import { PasswordResetRepository } from './repositories/password-reset.repository';
import { ResetPasswordMailer } from './mailer/reset-password.mailer';
import { User } from './entities/user.entity';
import { EmailVerification } from './entities/email-verification.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { GoogleStrategy } from './strategies/google.strategy';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmailVerification, PasswordReset]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EncryptionService,
    ConfirmationMailer,
    ResetPasswordMailer,
    EmailVerificationMailer,
    RequestEmailResetMailer,
    UserRepository,
    PasswordResetRepository,
    EmailVerificationRepository,
    GoogleStrategy,
    GoogleOAuthGuard,
  ],
  exports: [UserRepository, EncryptionService],
})
export class AuthModule {}
