import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsRepository } from './repository/subscription.repository';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { GracePeriodMailer } from './mailer/grace-period.mailer';
import { RenewedSubscriptionMailer } from './mailer/renewed-subscription.mailer';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription]),
    forwardRef(() => AuthModule),
    forwardRef(() => PaymentModule),
  ],
  providers: [
    SubscriptionsRepository,
    SubscriptionService,
    GracePeriodMailer,
    RenewedSubscriptionMailer,
  ],
  controllers: [SubscriptionController],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
