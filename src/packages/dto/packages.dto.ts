import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PackageExpiry, PackageNetwork, PackageType } from '../packages.types';

export class SetRetailPriceDto {
  /** Retail price in pesewas (e.g. 480 = GHS 4.80). */
  @ApiProperty({ example: 480, description: 'Retail price in pesewas' })
  @IsInt()
  @Min(1)
  retailPrice: number;
}

export class SetVisibilityDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  inShop: boolean;
}

export class BulkPriceItemDto {
  @ApiProperty({ example: 'PKG1001' })
  @IsString()
  packageId: string;

  @ApiProperty({ example: 480, description: 'Retail price in pesewas' })
  @IsInt()
  @Min(1)
  retailPrice: number;
}

export class BulkPricingDto {
  @ApiProperty({ type: [BulkPriceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkPriceItemDto)
  items: BulkPriceItemDto[];
}

export class ApplyMarginDto {
  @ApiProperty({
    example: 20,
    description: 'Markup percentage applied to wholesale',
  })
  @IsInt()
  @Min(0)
  @Max(1000)
  marginPercent: number;

  @ApiProperty({
    required: false,
    description: 'Limit the margin to a single network',
    enum: PackageNetwork,
  })
  @IsOptional()
  @IsEnum(PackageNetwork)
  network?: PackageNetwork;
}

export class UpdateShopDto {
  @ApiProperty({ required: false, example: 'George Data Hub' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiProperty({
    required: false,
    example: 'george-data-hub',
    description: 'Lowercase letters, numbers and hyphens only',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug may contain only lowercase letters, numbers and hyphens',
  })
  slug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePackageDto {
  @ApiProperty({ enum: PackageNetwork })
  @IsEnum(PackageNetwork)
  network: PackageNetwork;

  @ApiProperty({ enum: PackageType })
  @IsEnum(PackageType)
  type: PackageType;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(100000)
  capacityGb: number;

  @ApiProperty({ required: false, example: '5 GB' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sizeLabel?: string;

  @ApiProperty({ example: 2000, description: 'Wholesale price in pesewas' })
  @IsInt()
  @Min(0)
  wholesalePrice: number;

  @ApiProperty({ required: false, example: 2400 })
  @IsOptional()
  @IsInt()
  @Min(0)
  suggestedRetailPrice?: number;

  @ApiProperty({ enum: PackageExpiry })
  @IsEnum(PackageExpiry)
  expiryInfo: PackageExpiry;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerCode?: string;
}

export class UpdatePackageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sizeLabel?: string;

  @ApiProperty({ required: false, description: 'Wholesale price in pesewas' })
  @IsOptional()
  @IsInt()
  @Min(0)
  wholesalePrice?: number;

  @ApiProperty({
    required: false,
    description: 'Suggested retail price in pesewas',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  suggestedRetailPrice?: number;

  @ApiProperty({ required: false, enum: PackageExpiry })
  @IsOptional()
  @IsEnum(PackageExpiry)
  expiryInfo?: PackageExpiry;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerCode?: string;
}
