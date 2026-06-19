import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'PKG1001' })
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @ApiProperty({ example: '0554821034', description: 'Ghana recipient number' })
  @IsString()
  @Matches(/^0\d{9}$/, {
    message: 'Enter a valid 10-digit Ghana phone number (e.g. 0554821034)',
  })
  recipientNumber: string;
}

export class RetryOrderDto {
  @ApiProperty({
    required: false,
    description:
      'Paystack reference, required to retry a shop (customer-paid) order',
  })
  @IsString()
  @IsNotEmpty()
  paystackReference?: string;
}
