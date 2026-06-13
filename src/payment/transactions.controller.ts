import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { TransactionsService } from './transactions.service';
import { PaginatorBuilder } from 'src/shared/services/paginator.provider';
import { QueryPaginatorDto } from 'src/lib/dto/query-paginator.dto';

@ApiTags('Transactions')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly _transactionsService: TransactionsService,
    private readonly _paginatorBuilder: PaginatorBuilder,
  ) {}

  @ApiOperation({ summary: "Get a user's wallet" })
  @HttpCode(HttpStatus.OK)
  @Get('wallet/:userId')
  getWallet(@Param('userId') userId: string) {
    return this._transactionsService.getWallet(userId);
  }

  @ApiOperation({ summary: "Get a user's transaction detail" })
  @HttpCode(HttpStatus.OK)
  @Get(':id')
  getTransaction(@Param('id') id: string) {
    return this._transactionsService.getTransaction(id);
  }

  @ApiOperation({
    summary: "Get a user's transaction by reference for validation purposes",
  })
  @HttpCode(HttpStatus.OK)
  @Get(':ref')
  getTransactionReference(@Param('ref') ref: string) {
    return this._transactionsService.getTransactionByReference(ref);
  }

  @ApiOperation({
    summary: 'Paginate transactions for a user',
  })
  @HttpCode(HttpStatus.OK)
  @Get(':userId')
  paginate(
    @Query() params: QueryPaginatorDto,
    @Param('userId') userId: string,
  ) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .setQuery(params.q)
      .getResult();
    return this._transactionsService.paginateTransactions(paginator, userId);
  }
}
