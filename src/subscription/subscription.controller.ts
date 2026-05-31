import { Controller, Get } from '@nestjs/common';
import { User } from '../auth/entities/user.entity';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly _subService: SubscriptionService) {}

  @Get('status')
  async getStatus(@CurrentUser() user: User) {
    const isActive = await this._subService.hasAccess(user.id);
    return { isActive };
  }
}
