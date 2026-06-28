import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierName } from '../../orders/orders.types';

/** Save/update the user's personal supplier API key. */
export class SetXpressApiKeyDto {
  @ApiProperty({ example: 'dk_abc123...' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  apiKey: string;

  @ApiPropertyOptional({
    enum: SupplierName,
    description: 'Which supplier the key belongs to. Defaults to XPRESS.',
  })
  @IsEnum(SupplierName)
  @IsOptional()
  supplier?: SupplierName;
}

/** Purchase one or more vouchers. */
export class PurchaseVoucherDto {
  @ApiProperty({ example: 'wassce_results_checker' })
  @IsString()
  voucherSlug: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: '233241234567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  sendViaWhatsApp?: boolean;
}

/** Register a customer for an AFA bundle (MTN numbers only). */
export class AfaRegisterDto {
  @ApiProperty({ example: 'Kwame Asante' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: '0249116309', description: 'MTN number only' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ example: 'GHA-202501234-5' })
  @IsString()
  @Matches(/^GHA-\d{9}-\d$/, {
    message: 'Invalid Ghana Card format. Expected: GHA-XXXXXXXXX-X',
  })
  idNumber: string;

  @ApiProperty({ example: 'Kumasi' })
  @IsString()
  location: string;

  @ApiProperty({ example: 'Ashanti' })
  @IsString()
  region: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Farmer' })
  @IsOptional()
  @IsString()
  occupation?: string;
}

/** Check the status of up to 100 orders by id or reference. */
export class BulkStatusDto {
  @ApiProperty({ type: [String], example: ['ORD-000067', 'ORD-IB22OQws'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  identifiers: string[];
}
