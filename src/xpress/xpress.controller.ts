import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { XpressService } from './xpress.service';
import {
  AfaRegisterDto,
  BulkStatusDto,
  PurchaseVoucherDto,
  SetXpressApiKeyDto,
} from './dto/xpress.dto';

@ApiTags('Xpress')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('xpress')
export class XpressController {
  constructor(private readonly _xpress: XpressService) {}

  // ── Personal API key (available to all roles) ────────────────

  @ApiOperation({ summary: 'Get my XpresPortal API key status (masked)' })
  @HttpCode(HttpStatus.OK)
  @Get('api-key')
  getApiKey(@CurrentUser() user: User) {
    return this._xpress.getApiKey(user);
  }

  @ApiOperation({ summary: 'Set or update my XpresPortal API key' })
  @HttpCode(HttpStatus.OK)
  @Put('api-key')
  setApiKey(@Body() body: SetXpressApiKeyDto, @CurrentUser() user: User) {
    return this._xpress.setApiKey(user, body.apiKey, body.supplier);
  }

  @ApiOperation({
    summary: 'Remove my XpresPortal API key (revert to platform key)',
  })
  @HttpCode(HttpStatus.OK)
  @Delete('api-key')
  deleteApiKey(@CurrentUser() user: User) {
    return this._xpress.deleteApiKey(user);
  }

  // ── Offers / balance ─────────────────────────────────────────

  @ApiOperation({ summary: 'List available offers' })
  @HttpCode(HttpStatus.OK)
  @Get('offers')
  offers(@CurrentUser() user: User) {
    return this._xpress.getOffers(user);
  }

  @ApiOperation({ summary: 'Check supplier wallet balance' })
  @HttpCode(HttpStatus.OK)
  @Get('balance')
  balance(@CurrentUser() user: User) {
    return this._xpress.getBalance(user);
  }

  // ── Bulk order status ────────────────────────────────────────

  @ApiOperation({ summary: 'Check the status of up to 100 orders' })
  @HttpCode(HttpStatus.OK)
  @Post('orders/status/bulk')
  bulkStatus(@Body() body: BulkStatusDto, @CurrentUser() user: User) {
    return this._xpress.bulkStatus(user, body);
  }

  // ── Vouchers ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'List available voucher types' })
  @HttpCode(HttpStatus.OK)
  @Get('vouchers')
  vouchers(@CurrentUser() user: User) {
    return this._xpress.listVouchers(user);
  }

  @ApiOperation({ summary: 'Purchase vouchers' })
  @HttpCode(HttpStatus.CREATED)
  @Post('vouchers/purchase')
  purchaseVouchers(
    @Body() body: PurchaseVoucherDto,
    @CurrentUser() user: User,
  ) {
    return this._xpress.purchaseVouchers(user, body);
  }

  // ── AFA ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Register for an AFA bundle (MTN only)' })
  @HttpCode(HttpStatus.CREATED)
  @Post('afa/register')
  registerAfa(@Body() body: AfaRegisterDto, @CurrentUser() user: User) {
    return this._xpress.registerAfa(user, body);
  }
}
