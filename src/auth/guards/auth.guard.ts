import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { verify } from 'jsonwebtoken';

import { UserRepository } from '../repositories/user.repository';
import { EncryptionService } from '../encryption.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly _userRepo: UserRepository,
    private readonly _configService: ConfigService,
    private readonly _encryptionService: EncryptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: Request = context.switchToHttp().getRequest();
    const { authorization } = req.headers;

    if (!authorization) throw new UnauthorizedException('Access denied');

    const [bearer, token] = authorization.split(' ');

    if (!bearer || !token || bearer !== 'Bearer')
      throw new UnauthorizedException('Access denied');

    try {
      const decryptedToken = this._encryptionService.decrypt(token);
      const result = verify(
        decryptedToken,
        this._configService.get<string>('SECRET_KEY') as string,
        {
          algorithms: ['HS256'],
        },
      ) as unknown as { sub: string; token: string };

      if (!result.token || result.token !== 'acc-tk') throw new Error();

      const existingUser = await this._userRepo.find(result.sub);

      if (!existingUser) throw new Error();

      req.user = existingUser;

      return true;
    } catch {
      throw new UnauthorizedException('Access denied');
    }
  }
}
