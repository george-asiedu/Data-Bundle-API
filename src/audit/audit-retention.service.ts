import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, In, LessThan } from 'typeorm';
import { AuditLogs } from './entities/audit-logs.entity';
import { S3Service } from '../shared/s3/s3.service';

/**
 * Keeps the audit_logs table small (and DB costs down) by moving logs older
 * than the retention window to cold storage on S3, then deleting them from the
 * database. Logs are never lost — they are archived first, in batches, so a
 * large backlog never has to be held in memory at once.
 */
@Injectable()
export class AuditRetentionService {
  private readonly _logger = new Logger(AuditRetentionService.name);
  private readonly _retentionDays: number;
  private static readonly BATCH_SIZE = 1000;

  constructor(
    private readonly _configService: ConfigService,
    private readonly _dataSource: DataSource,
    private readonly _s3Service: S3Service,
  ) {
    this._retentionDays =
      this._configService.get<number>('RETENTION_DAYS') || 60;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async archiveAndPurgeOldLogs(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this._retentionDays);

    const repo = this._dataSource.getRepository(AuditLogs);
    let totalArchived = 0;
    let batchIndex = 0;

    try {
      // Process oldest-first in bounded batches: archive to S3, then delete.
      for (;;) {
        const batch = await repo.find({
          where: { createdAt: LessThan(cutoffDate) },
          relations: { user: true },
          order: { createdAt: 'ASC' },
          take: AuditRetentionService.BATCH_SIZE,
        });

        if (batch.length === 0) break;

        await this._archiveBatch(cutoffDate, batchIndex, batch);

        await repo.delete({ id: In(batch.map((log) => log.id)) });

        totalArchived += batch.length;
        batchIndex += 1;

        // A short batch means we've drained everything past the cutoff.
        if (batch.length < AuditRetentionService.BATCH_SIZE) break;
      }

      this._logger.log(
        `Audit retention: archived and purged ${totalArchived} logs older than ${this._retentionDays} days.`,
      );
    } catch (error: unknown) {
      // Archival failed before deletion, so nothing is lost — the rows remain
      // and the next run retries them.
      this._logger.error(
        `Audit retention failed after archiving ${totalArchived} logs: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async _archiveBatch(
    cutoffDate: Date,
    batchIndex: number,
    batch: AuditLogs[],
  ): Promise<void> {
    const runDate = cutoffDate.toISOString().slice(0, 10);
    const key = `audit-archive/${runDate}/audit-logs-${Date.now()}-${batchIndex}.json`;

    await this._s3Service.putObject(
      key,
      JSON.stringify(batch),
      'application/json',
    );
  }
}
