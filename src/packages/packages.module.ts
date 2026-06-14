import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package } from './entities/package.entity';
import { ShopPackage } from './entities/shop-package.entity';
import { Shop } from './entities/shop.entity';
import { PackageRepository } from './repositories/package.repository';
import { ShopPackageRepository } from './repositories/shop-package.repository';
import { ShopRepository } from './repositories/shop.repository';
import { PackagesService } from './packages.service';
import { PackagesController } from './packages.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Package, ShopPackage, Shop]),
    AuthModule,
    AuditModule,
  ],
  providers: [
    PackageRepository,
    ShopPackageRepository,
    ShopRepository,
    PackagesService,
  ],
  controllers: [PackagesController],
  exports: [
    PackageRepository,
    ShopPackageRepository,
    ShopRepository,
    PackagesService,
  ],
})
export class PackagesModule {}
