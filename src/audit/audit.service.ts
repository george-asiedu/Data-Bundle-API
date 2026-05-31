import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AuditRepository } from './repositories/audit-logs.repository';
import { CreateLogPayload, LogAction } from './log-action.types';
import { QueryRunner } from 'typeorm';
import { AuditLogs } from './entities/audit-logs.entity';
import { QueryRunnerExec } from '../shared/services/query-runner-exec.service';
import { User } from '../auth/entities/user.entity';
import { Paginator } from '../shared/services/paginator.provider';
import { DataMessage } from '../lib/utils/types.utils';

@Injectable()
export class AuditService {
  private readonly _logger = new Logger(AuditService.name);

  constructor(
    private readonly _auditRepository: AuditRepository,
    private readonly _queryRunnerExec: QueryRunnerExec,
  ) {}

  // Core write — payload carries either user object or userId string
  async log(payload: CreateLogPayload): Promise<void> {
    let queryRunner: QueryRunner | undefined = undefined;

    try {
      queryRunner = await this._queryRunnerExec.getRunner();

      await this._auditRepository.save(queryRunner, payload);
      await this._queryRunnerExec.commit(queryRunner);
    } catch (error: unknown) {
      await this._queryRunnerExec.rollback(queryRunner);
      this._logger.error(
        `Failed to write activity log [${payload.action}]: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Shorthand for manual logging (AuthService, etc.) — passes userId string
  async logAction(
    action: LogAction,
    userId?: string | null,
    extras?: Partial<CreateLogPayload>,
  ): Promise<void> {
    return this.log({ action, userId: userId ?? null, ...extras });
  }

  // Shorthand for interceptor — passes full User entity, avoids DB lookup
  async logFromRequest(
    payload: CreateLogPayload,
    user: User | null,
  ): Promise<void> {
    return this.log({ ...payload, user });
  }

  // User-facing: their own activity timeline
  async getMyActivity(
    userId: string,
    paginator: Paginator,
  ): Promise<DataMessage<AuditLogs[]>> {
    try {
      const logs = await this._auditRepository.paginateByUser(
        userId,
        paginator,
      );
      return { message: 'Activity retrieved successfully', data: logs };
    } catch (error: unknown) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  // Internal/admin: full log with optional action filter
  async getAll(
    paginator: Paginator,
    action?: LogAction,
  ): Promise<DataMessage<AuditLogs[]>> {
    try {
      const logs = await this._auditRepository.paginateAll(paginator, action);
      return { message: 'Logs retrieved successfully', data: logs };
    } catch (error: unknown) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  // Internal: all logs for a specific resource entity
  async getByResource(
    paginator: Paginator,
    resourceType: string,
    resourceId: string,
  ): Promise<DataMessage<AuditLogs[]>> {
    try {
      const logs = await this._auditRepository.paginateByResource(
        paginator,
        resourceType,
        resourceId,
      );
      return { message: 'Resource logs retrieved successfully', data: logs };
    } catch (error: unknown) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async getActionSummary(): Promise<
    DataMessage<{ action: string; count: string }[]>
  > {
    try {
      const summary = await this._auditRepository.countByAction();
      return { message: 'Action summary retrieved', data: summary };
    } catch (error: unknown) {
      this._logger.error((error as Error).message);
      throw new InternalServerErrorException('Something went wrong');
    }
  }
}
