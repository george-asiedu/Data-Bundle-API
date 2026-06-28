import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../auth/auth.types';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { PaginatorBuilder } from '../shared/services/paginator.provider';
import { QueryPaginatorDto } from '../lib/dto/query-paginator.dto';
import { OrdersService } from './orders.service';
import { CreateBulkOrderDto, CreateOrderDto } from './dto/orders.dto';

@ApiTags('Orders')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly _ordersService: OrdersService,
    private readonly _paginatorBuilder: PaginatorBuilder,
  ) {}

  @ApiOperation({ summary: 'Place a bundle order from the agent dashboard' })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  place(@Body() body: CreateOrderDto, @CurrentUser() user: User) {
    return this._ordersService.placeAgentOrder(user, body);
  }

  @ApiOperation({ summary: 'Place multiple bundle orders in one request' })
  @HttpCode(HttpStatus.CREATED)
  @Post('bulk')
  placeBulk(@Body() body: CreateBulkOrderDto, @CurrentUser() user: User) {
    return this._ordersService.placeAgentOrdersBulk(user, body.orders);
  }

  @ApiOperation({ summary: 'List my orders' })
  @HttpCode(HttpStatus.OK)
  @Get()
  list(@Query() params: QueryPaginatorDto, @CurrentUser() user: User) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .setQuery(params.q)
      .getResult();
    return this._ordersService.listMyOrders(user.id, paginator);
  }

  @ApiOperation({ summary: 'Admin: list all platform orders (Verdeaccess)' })
  @UseGuards(RoleGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Get('admin/all')
  listAll(@Query() params: QueryPaginatorDto) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .setQuery(params.q)
      .getResult();
    return this._ordersService.listAllOrders(paginator);
  }

  @ApiOperation({ summary: 'Get a single order' })
  @HttpCode(HttpStatus.OK)
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this._ordersService.getOrder(user, id);
  }

  @ApiOperation({ summary: 'Refresh an order status from the supplier' })
  @HttpCode(HttpStatus.OK)
  @Get(':id/status')
  sync(@Param('id') id: string, @CurrentUser() user: User) {
    return this._ordersService.syncOrder(user, id);
  }

  @ApiOperation({ summary: 'Retry a failed or pending order (no re-charge)' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/retry')
  retry(@Param('id') id: string, @CurrentUser() user: User) {
    return this._ordersService.retryOrder(user, id);
  }
}
