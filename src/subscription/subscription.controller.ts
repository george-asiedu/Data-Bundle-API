import { Controller, Get, UseGuards } from '@nestjs/common';
import { User } from '../auth/entities/user.entity';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { SubscriptionService } from './subscription.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly _subService: SubscriptionService) {}

  @ApiOperation({ summary: 'Gets the subscription status of a user' })
  @Get('status')
  async getStatus(@CurrentUser() user: User) {
    const isActive = await this._subService.hasAccess(user.id);
    return { isActive };
  }
}
