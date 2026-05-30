import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

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
}
