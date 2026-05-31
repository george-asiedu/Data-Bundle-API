import { DataSource, QueryRunner } from 'typeorm';
import { CreateLogPayload, LogAction } from '../log-action.types';
import { AuditLogs } from '../entities/audit-logs.entity';
import { User } from '../../auth/entities/user.entity';
import { Paginator } from '../../shared/services/paginator.provider';

export class AuditRepository {
  constructor(private readonly _dataSource: DataSource) {}

  private _getQueryBuilder() {
    return this._dataSource.getRepository(AuditLogs).createQueryBuilder('logs');
  }

  async _getNextId(queryRunner: QueryRunner): Promise<string> {
    const result = await queryRunner.manager
      .createQueryBuilder(AuditLogs, 'logs')
      .select('MAX(CAST(SUBSTRING(logs.id, 3) AS INTEGER))', 'maxNum')
      .getRawOne<{ maxNum: string | null }>();

    const maxNum = result?.maxNum ? parseInt(result.maxNum, 10) : 1000;
    return `AL${maxNum + 1}`;
  }

  async save(
    queryRunner: QueryRunner,
    payload: CreateLogPayload,
  ): Promise<AuditLogs> {
    let user: User | null = null;

    if (payload.user !== undefined) {
      // Interceptor path — full entity already attached from request
      user = payload.user ?? null;
    } else if (payload.userId) {
      // logAction path — only the ID is known, fetch the entity
      user = await queryRunner.manager.findOne(User, {
        where: { id: payload.userId },
      });
    }

    const log = new AuditLogs();
    log.id = await this._getNextId(queryRunner);
    log.user = user ? user : null;
    log.action = payload.action;
    log.endpoint = payload.endpoint ?? null;
    log.statusCode = payload.statusCode ?? null;
    log.resourceType = payload.resourceType ?? null;
    log.resourceId = payload.resourceId ?? null;
    log.metadata = payload.metadata ?? null;
    log.ipAddress = payload.ipAddress ?? null;
    log.userAgent = payload.userAgent ?? null;
    log.durationMs = payload.durationMs ?? null;

    return queryRunner.manager.save(AuditLogs, log);
  }

  async paginateByUser(
    userId: string,
    paginator: Paginator,
  ): Promise<Array<AuditLogs>> {
    return this._getQueryBuilder()
      .where('logs.user = :userId', { userId })
      .orderBy('logs.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage)
      .getMany();
  }

  async paginateAll(
    paginator: Paginator,
    action?: LogAction,
  ): Promise<Array<AuditLogs>> {
    const qb = this._getQueryBuilder()
      .leftJoinAndSelect('logs.user', 'user')
      .orderBy('logs.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage);

    if (action) qb.where('logs.action = :action', { action });

    return qb.getMany();
  }

  async paginateByResource(
    paginator: Paginator,
    resourceType: string,
    resourceId: string,
  ): Promise<Array<AuditLogs>> {
    return await this._getQueryBuilder()
      .leftJoinAndSelect('logs.user', 'user')
      .where(
        'logs.resourceType = :resourceType AND logs.resourceId = :resourceId',
        {
          resourceType,
          resourceId,
        },
      )
      .orderBy('logs.createdAt', 'DESC')
      .take(paginator.perPage)
      .skip(paginator.page * paginator.perPage)
      .getMany();
  }

  async countByAction(): Promise<{ action: string; count: string }[]> {
    return await this._getQueryBuilder()
      .select('logs.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('logs.action')
      .getRawMany();
  }
}
