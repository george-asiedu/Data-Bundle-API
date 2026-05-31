import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '../auth/auth.types';
import { SubscriptionService } from './subscription.service';
import { Request } from 'express';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly _subService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const user = request.user as User;

    if (!user) return false;

    // Bypass for super admin
    if (user.role === Role.SUPER_ADMIN) return true;
    const hasAccess = await this._subService.hasAccess(user.id);

    if (!hasAccess) {
      throw new ForbiddenException({
        message:
          'Your subscription has expired. Please renew to access this resource.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }

    return true;
  }
}
