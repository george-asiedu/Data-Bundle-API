import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { SupplierName } from '../../orders/orders.types';

export class VerifyBankDto {
  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 15)
  accountNumber: string;

  @ApiProperty({ example: '044', description: 'The Paystack bank code' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;
}

export class CompleteFinancialSetupDto {
  @ApiProperty({ example: 'Kwabena Data Hub' })
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty({ example: '044' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 15)
  accountNumber: string;

  @ApiProperty({ example: 'hfbleklgmmelafjbef' })
  @IsString()
  @IsOptional()
  vendorApiKey?: string;

  @ApiPropertyOptional({
    enum: SupplierName,
    example: SupplierName.XPRESS,
    description:
      'Which supplier the provided key belongs to. Defaults to XPRESS (the platform supplier) when omitted or when no key is provided.',
  })
  @IsEnum(SupplierName)
  @IsOptional()
  vendorApiKeySupplier?: SupplierName;
}
