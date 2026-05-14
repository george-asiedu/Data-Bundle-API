import { ApiProperty } from '@nestjs/swagger';

export class QueryPaginatorDto {
  @ApiProperty()
  perPage: string;

  @ApiProperty()
  page: string;

  @ApiProperty()
  q: string;
}
