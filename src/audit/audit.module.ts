import { forwardRef, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogs } from './entities/audit-logs.entity';
import { AuditController } from './audit.controller';
import { AuditRepository } from './repositories/audit-logs.repository';
import { AuditInterceptor } from './audit.interceptor';
import { AuditRetentionService } from './audit-retention.service';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLogs]),
    forwardRef(() => AuthModule),
    SharedModule,
  ],
  providers: [
    AuditService,
    AuditRepository,
    AuditInterceptor,
    AuditRetentionService,
  ],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
