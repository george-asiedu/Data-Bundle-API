import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LogAction } from '../log-action.types';
import { ApiProperty } from '@nestjs/swagger';
import { QueryPaginatorDto } from '../../lib/dto/query-paginator.dto';

export class QueryAuditLogsDto extends QueryPaginatorDto {
  @IsEnum(LogAction)
  @IsOptional()
  @ApiProperty()
  action?: LogAction;

  @IsString()
  @IsOptional()
  @ApiProperty()
  resourceType?: string;

  @IsString()
  @IsOptional()
  @ApiProperty()
  resourceId?: string;
}
