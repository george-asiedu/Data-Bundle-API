import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthProvider, OAuthProfile } from '../auth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const nodeEnv = configService.get<string>('NODE_ENV') as string;
    const callbackLocal = configService.get<string>(
      'GOOGLE_CALLBACK_LOCAL_URL',
    ) as string;
    const callbackServer = configService.get<string>(
      'GOOGLE_CALLBACK_SERVER_URL',
    ) as string;

    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') as string,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') as string,
      callbackURL: nodeEnv === 'development' ? callbackLocal : callbackServer,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails: { value: string }[];
      displayName: string;
      photos: { value: string }[];
    },
    done: VerifyCallback,
  ): void {
    const user: OAuthProfile = {
      providerId: profile.id,
      email: profile.emails[0].value,
      fullName: profile.displayName,
      imageUrl: profile.photos?.[0]?.value,
      provider: AuthProvider.GOOGLE,
    };

    done(null, user);
  }
}
