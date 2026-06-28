import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderRepository } from './repositories/order.repository';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersPoller } from './orders.poller';
import { VerdeaccessProvider } from './suppliers/verdeaccess.provider';
import { SupplierRegistry } from './suppliers/supplier.registry';
import { SUPPLIER_PROVIDERS } from './suppliers/supplier.provider';
import { XpressProvider } from '../xpress/xpress.provider';
import { XpressModule } from '../xpress/xpress.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { PackagesModule } from '../packages/packages.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    AuthModule,
    PaymentModule,
    PackagesModule,
    AuditModule,
    XpressModule,
  ],
  providers: [
    OrderRepository,
    OrdersService,
    OrdersPoller,
    VerdeaccessProvider,
    SupplierRegistry,
    {
      // The set of supplier integrations the registry resolves from.
      provide: SUPPLIER_PROVIDERS,
      useFactory: (verde: VerdeaccessProvider, xpress: XpressProvider) => [
        verde,
        xpress,
      ],
      inject: [VerdeaccessProvider, XpressProvider],
    },
  ],
  controllers: [OrdersController],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
