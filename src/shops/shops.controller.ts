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
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { PaginatorBuilder } from '../shared/services/paginator.provider';
import { QueryPaginatorDto } from '../lib/dto/query-paginator.dto';
import { ShopsService } from './shops.service';
import { ShopCheckoutDto } from './dto/shop-checkout.dto';

@ApiTags('Shops')
@Controller('shops')
export class ShopsController {
  constructor(
    private readonly _shopsService: ShopsService,
    private readonly _paginatorBuilder: PaginatorBuilder,
  ) {}

  @ApiOperation({ summary: 'My shop dashboard overview (stats + highlights)' })
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Get('me/overview')
  overview(@CurrentUser() user: User) {
    return this._shopsService.overview(user.id);
  }

  @ApiOperation({ summary: 'My shop orders (customer-placed)' })
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Get('me/orders')
  orders(@Query() params: QueryPaginatorDto, @CurrentUser() user: User) {
    const paginator = this._paginatorBuilder
      .setPage(params.page)
      .setPerPage(params.perPage)
      .setQuery(params.q)
      .getResult();
    return this._shopsService.listShopOrders(user.id, paginator);
  }

  @ApiOperation({ summary: 'Confirm a paid shop order and fulfil it' })
  @HttpCode(HttpStatus.OK)
  @Post('checkout/:reference/confirm')
  confirm(@Param('reference') reference: string) {
    return this._shopsService.confirm(reference);
  }

  @ApiOperation({ summary: 'Customer retry of a paid shop order by reference' })
  @HttpCode(HttpStatus.OK)
  @Post('checkout/:reference/retry')
  retry(@Param('reference') reference: string) {
    return this._shopsService.retry(reference);
  }

  @ApiOperation({ summary: 'Start a customer checkout (Paystack)' })
  @HttpCode(HttpStatus.CREATED)
  @Post(':slug/checkout')
  checkout(@Param('slug') slug: string, @Body() body: ShopCheckoutDto) {
    return this._shopsService.checkout(slug, body);
  }

  @ApiOperation({ summary: 'Public storefront by slug (customer-facing)' })
  @HttpCode(HttpStatus.OK)
  @Get(':slug')
  publicShop(@Param('slug') slug: string) {
    return this._shopsService.publicShop(slug);
  }
}
