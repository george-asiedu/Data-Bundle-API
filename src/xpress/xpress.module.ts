import { Module } from '@nestjs/common';
import { XpressProvider } from './xpress.provider';
import { XpressService } from './xpress.service';
import { XpressController } from './xpress.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * XpresPortal integration: the platform's default fulfilment supplier plus the
 * surrounding features (offers, balance, vouchers, AFA, bulk status and personal
 * API-key management). Exports XpressProvider so OrdersModule can register it as
 * a SupplierProvider.
 */
@Module({
  imports: [AuthModule],
  providers: [XpressProvider, XpressService],
  controllers: [XpressController],
  exports: [XpressProvider],
})
export class XpressModule {}
