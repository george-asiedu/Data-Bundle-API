import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { AuditLogs } from './entities/audit-logs.entity';

@Injectable()
export class AuditRetentionService {
  private readonly _logger = new Logger(AuditRetentionService.name);
  private readonly _retentionDays: number;

  constructor(
    private readonly _configService: ConfigService,
    private readonly _dataSource: DataSource,
  ) {
    this._retentionDays =
      this._configService.get<number>('RETENTION_DAYS') || 60;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteOldLogs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this._retentionDays);

      const result = await this._dataSource
        .createQueryBuilder()
        .delete()
        .from(AuditLogs)
        .where('created_at < :cutoffDate', { cutoffDate })
        .execute();

      this._logger.log(
        `Audit log retention: deleted ${result.affected ?? 0} audit logs older than ${this._retentionDays} days.`,
      );
    } catch (error: unknown) {
      this._logger.error(
        'Error occurred while deleting old audit logs.',
        (error as Error).message,
      );
    }
  }
}
