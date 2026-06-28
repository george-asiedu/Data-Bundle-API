import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

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

/** One line item in a bulk order placement. */
export class BulkOrderItemDto extends CreateOrderDto {}

/** Place multiple agent orders in a single request (max 50). */
export class CreateBulkOrderDto {
  @ApiProperty({ type: [BulkOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkOrderItemDto)
  orders: BulkOrderItemDto[];
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
