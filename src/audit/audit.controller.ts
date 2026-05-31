import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
  Get,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PaginatorBuilder } from '../shared/services/paginator.provider';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/auth.types';
import { QueryPaginatorDto } from '../lib/dto/query-paginator.dto';

@ApiTags('Audit Logs')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(
    private readonly _auditService: AuditService,
    private readonly _paginatorBuilder: PaginatorBuilder,
  ) {}

  @ApiOperation({ summary: 'Get a user activity logs' })
  @HttpCode(HttpStatus.OK)
  @Get('user')
  async paginateMyActivity(
    @Query() params: QueryAuditLogsDto,
    @CurrentUser() user: User,
  ) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .getResult();

    return await this._auditService.getMyActivity(user.id, paginator);
  }

  @ApiOperation({ summary: 'Get all activity logs (admin)' })
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @Get()
  async paginateAll(@Query() params: QueryAuditLogsDto) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .getResult();

    return await this._auditService.getAll(paginator, params.action);
  }

  @ApiOperation({ summary: 'Get logs for a specific resource (admin)' })
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.AGENT)
  @Get('resource/:type/:id')
  paginateByResource(
    @Query() params: QueryPaginatorDto,
    @Param('type') resourceType: string,
    @Param('id') resourceId: string,
  ) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .setQuery(params.q)
      .getResult();

    return this._auditService.getByResource(
      paginator,
      resourceType,
      resourceId,
    );
  }

  @ApiOperation({ summary: 'Get action summary counts (admin)' })
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.AGENT)
  @Get('summary')
  getActionSummary() {
    return this._auditService.getActionSummary();
  }
}
