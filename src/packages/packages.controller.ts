import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Role } from '../auth/auth.types';
import { User } from '../auth/entities/user.entity';
import { PackagesService } from './packages.service';
import {
  ApplyMarginDto,
  CreatePackageDto,
  SetRetailPriceDto,
  SetVisibilityDto,
  UpdatePackageDto,
  UpdateShopDto,
} from './dto/packages.dto';

@ApiTags('Packages')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('packages')
export class PackagesController {
  constructor(private readonly _packagesService: PackagesService) {}

  @ApiOperation({ summary: 'List available packages with my pricing' })
  @HttpCode(HttpStatus.OK)
  @Get()
  list(@CurrentUser() user: User) {
    return this._packagesService.listForUser(user.id);
  }

  @ApiOperation({ summary: 'Apply a uniform margin across my packages' })
  @HttpCode(HttpStatus.OK)
  @Post('apply-margin')
  applyMargin(@Body() body: ApplyMarginDto, @CurrentUser() user: User) {
    return this._packagesService.applyMargin(user.id, body);
  }

  @ApiOperation({ summary: 'Get my shop (auto-provisioned on first access)' })
  @HttpCode(HttpStatus.OK)
  @Get('shop')
  getMyShop(@CurrentUser() user: User) {
    return this._packagesService.getMyShop(user);
  }

  @ApiOperation({ summary: 'Update my shop name, link or active status' })
  @HttpCode(HttpStatus.OK)
  @Patch('shop')
  updateMyShop(@Body() body: UpdateShopDto, @CurrentUser() user: User) {
    return this._packagesService.updateMyShop(user, body);
  }

  @ApiOperation({ summary: 'Set my retail price for a package' })
  @HttpCode(HttpStatus.OK)
  @Patch(':id/pricing')
  setPrice(
    @Param('id') id: string,
    @Body() body: SetRetailPriceDto,
    @CurrentUser() user: User,
  ) {
    return this._packagesService.setRetailPrice(user.id, id, body.retailPrice);
  }

  @ApiOperation({ summary: 'Show/hide a package in my shop' })
  @HttpCode(HttpStatus.OK)
  @Patch(':id/visibility')
  setVisibility(
    @Param('id') id: string,
    @Body() body: SetVisibilityDto,
    @CurrentUser() user: User,
  ) {
    return this._packagesService.setVisibility(user.id, id, body.inShop);
  }

  // ── Admin ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Admin: list the full package catalog' })
  @UseGuards(RoleGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Get('admin/all')
  listAll() {
    return this._packagesService.listAll();
  }

  @ApiOperation({ summary: 'Admin: create a package' })
  @UseGuards(RoleGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Post('admin')
  create(@Body() body: CreatePackageDto, @CurrentUser() admin: User) {
    return this._packagesService.createPackage(admin.id, body);
  }

  @ApiOperation({ summary: 'Admin: update a package (price/availability)' })
  @UseGuards(RoleGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Patch('admin/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdatePackageDto,
    @CurrentUser() admin: User,
  ) {
    return this._packagesService.updatePackage(admin.id, id, body);
  }
}
