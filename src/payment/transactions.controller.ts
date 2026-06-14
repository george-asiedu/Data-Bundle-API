import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { TransactionsService } from './transactions.service';
import { PaginatorBuilder } from 'src/shared/services/paginator.provider';
import { QueryPaginatorDto } from 'src/lib/dto/query-paginator.dto';
import { CurrentUser } from 'src/shared/decorators/current-user.decorator';
import { Roles } from 'src/shared/decorators/role.decorator';
import { Role } from 'src/auth/auth.types';
import { User } from 'src/auth/entities/user.entity';
import {
  RejectWithdrawalDto,
  RequestWithdrawalDto,
} from './dto/withdrawal.dto';

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
  getWallet(@Param('userId') userId: string, @CurrentUser() user: User) {
    return this._transactionsService.getWallet(userId, user);
  }

  @ApiOperation({ summary: 'Initialize a wallet top-up via Paystack' })
  @HttpCode(HttpStatus.OK)
  @Post('top-up')
  topUp(@Body() body: RequestWithdrawalDto, @CurrentUser() user: User) {
    return this._transactionsService.topUp(user, body.amount);
  }

  @ApiOperation({ summary: 'Request a withdrawal from the wallet' })
  @HttpCode(HttpStatus.CREATED)
  @Post('withdrawals')
  requestWithdrawal(
    @Body() body: RequestWithdrawalDto,
    @CurrentUser() user: User,
  ) {
    return this._transactionsService.requestWithdrawal(user, body.amount);
  }

  @ApiOperation({ summary: 'List my withdrawal requests' })
  @HttpCode(HttpStatus.OK)
  @Get('withdrawals')
  getMyWithdrawals(
    @Query() params: QueryPaginatorDto,
    @CurrentUser() user: User,
  ) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .setQuery(params.q)
      .getResult();
    return this._transactionsService.getMyWithdrawals(user.id, paginator);
  }

  @ApiOperation({ summary: 'Admin: approve a pending withdrawal' })
  @UseGuards(RoleGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Patch('withdrawals/:id/approve')
  approveWithdrawal(@Param('id') id: string, @CurrentUser() admin: User) {
    return this._transactionsService.approveWithdrawal(admin, id);
  }

  @ApiOperation({ summary: 'Admin: reject a pending withdrawal' })
  @UseGuards(RoleGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Patch('withdrawals/:id/reject')
  rejectWithdrawal(
    @Param('id') id: string,
    @Body() body: RejectWithdrawalDto,
    @CurrentUser() admin: User,
  ) {
    return this._transactionsService.rejectWithdrawal(admin, id, body.reason);
  }

  @ApiOperation({ summary: "Get a transaction's detail by id" })
  @HttpCode(HttpStatus.OK)
  @Get('detail/:id')
  getTransaction(@Param('id') id: string) {
    return this._transactionsService.getTransaction(id);
  }

  @ApiOperation({
    summary: 'Get a transaction by reference for validation purposes',
  })
  @HttpCode(HttpStatus.OK)
  @Get('reference/:ref')
  getTransactionReference(@Param('ref') ref: string) {
    return this._transactionsService.getTransactionByReference(ref);
  }

  @ApiOperation({ summary: 'Paginate transactions for a user' })
  @HttpCode(HttpStatus.OK)
  @Get('user/:userId')
  paginate(
    @Query() params: QueryPaginatorDto,
    @Param('userId') userId: string,
    @CurrentUser() user: User,
  ) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .setQuery(params.q)
      .getResult();
    return this._transactionsService.paginateTransactions(
      paginator,
      userId,
      user,
    );
  }
}
